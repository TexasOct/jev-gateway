import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { configuration, editableConfiguration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

function taskWorkflow() {
  const catalog = structuredClone(configuration);
  catalog.questions = {
    task_type: { type: "choice", instructions: "Classify the current task.", criteria: { doc: "Write documentation", research: "Research a topic", general: "General conversation", review: "Review existing work", code: "Implement a change", operator: "Operate infrastructure" } },
    complexity: { type: "choice", instructions: "Judge impact, uncertainty and validation difficulty.", criteria: { low: "Small and well understood", medium: "Clear implementation across modules", high: "Broad impact or uncertain implementation", unknown: "Insufficient information" } },
  };
  catalog.rules = [
    { index: 0, when: { task_type: "review", complexity: ["high", "unknown"] }, select: { label: "review_complex" } },
    { index: 1, when: { task_type: "code", complexity: ["high", "unknown"] }, select: { label: "code_complex" } },
    ...["doc", "research", "general", "review", "code", "operator"].map((task_type, index) => ({ index: index + 2, when: { task_type }, select: { label: task_type } })),
  ];
  catalog.models = ["luna", "sol", "deepseek"].map((name) => ({ ...catalog.models[0]!, id: `fixture-provider/${name}`, upstream_model: name, tags: [], baseline_tags: [] }));
  catalog.labels = ["general", "doc", "research", "review", "review_complex", "code", "code_complex", "operator", "fallback"].map((name) => ({
    ...catalog.labels[0]!, name, tag: `balanced/${name}`, resolution: "models" as const,
    models: [`fixture-provider/${["general", "review"].includes(name) ? "deepseek" : ["doc", "research", "code"].includes(name) ? "luna" : "sol"}`],
  }));
  catalog.fallback = { label: "fallback" };
  return editableConfiguration(catalog);
}

async function enter(page: Page, target: Locator) {
  await target.focus();
  await page.keyboard.press("Enter");
}

for (const locale of ["en", "zh-CN"] as const) {
  test(`combined results, condition editing and question switching retain the exact draft in ${locale}`, async ({ page, mockApi }, info) => {
    mockApi.appliedConfiguration = taskWorkflow();
    mockApi.canvasLayout = { version: 1, nodes: {}, viewport: { x: 0, y: 0 } };
    mockApi.allowedWrites.push({ method: "POST", path: "/v1/routing/configuration/validate?strategy=balanced" });
    await page.setViewportSize({ width: 1430, height: 2511 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: en.settings, exact: true }).click();
    await page.locator("[data-settings-language]").selectOption(locale);
    await page.locator("[data-settings-scheme]").selectOption(locale === "en" ? "light" : "dark");
    const words = locale === "en" ? en : zhCN;
    await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
    await expect(page.getByRole("button", { name: words.canvasAddNode, exact: true })).toBeEnabled();
    await page.getByRole("button", { name: words.canvasZoomFit, exact: true }).click();
    const entry = page.locator('[data-canvas-node="questions"]');
    const context = page.locator('[data-canvas-edge][data-edge-from="questions"][data-edge-kind="context"]');
    await expect(context).toHaveCount(1);
    await expect(page.locator('[data-output-node="questions"]')).toHaveCount(2);
    await expect(entry).toContainText("task_type · complexity");
    await expect(page.locator('[data-canvas-edge][data-edge-kind="failure"]')).toHaveAttribute("data-edge-to", "fallback");
    await expect(page.locator('[data-canvas-edge][data-edge-from="rule-7"][data-edge-kind="unmatched"]')).toHaveAttribute("data-edge-to", "zone::balanced/general");

    const continuation = page.locator('[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="unmatched"]');
    const endpoints = await continuation.evaluate((element) => {
      const path = element as SVGPathElement;
      const start = path.getPointAtLength(0), end = path.getPointAtLength(path.getTotalLength());
      return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
    });
    expect(endpoints.start.x).toBe(endpoints.end.x);
    expect(endpoints.end.y).toBeGreaterThan(endpoints.start.y);
    await page.screenshot({ path: info.outputPath(`workflow-${locale}.png`), fullPage: true });

    await enter(page, page.locator('[data-canvas-node="rule-0"]'));
    const inspector = page.getByRole("complementary", { name: words.nodeInspector });
    await expect(inspector).toContainText(words.canvasConditionsHint);
    await expect(inspector).toContainText("Broad impact or uncertain implementation");
    await expect(inspector.getByRole("checkbox", { name: "high", exact: true })).toBeChecked();
    await inspector.getByRole("checkbox", { name: "medium", exact: true }).check();
    await expect(inspector.getByRole("checkbox", { name: "unknown", exact: true })).toBeChecked();
    await enter(page, inspector.getByRole("button", { name: words.closeInspector, exact: true }));

    await enter(page, entry);
    const picker = inspector.getByRole("combobox", { name: words.canvasEditQuestion, exact: true });
    await expect(inspector.getByRole("textbox", { name: words.instructions, exact: true })).toHaveCount(1);
    await picker.selectOption("complexity");
    const raw = "  Retained complexity instructions\n保留原始空白  ";
    await inspector.getByRole("textbox", { name: words.instructions, exact: true }).fill(raw);
    await picker.selectOption("task_type");
    await expect(inspector.getByRole("textbox", { name: words.instructions, exact: true })).toHaveValue("Classify the current task.");
    await picker.selectOption("complexity");
    await expect(inspector.getByRole("textbox", { name: words.instructions, exact: true })).toHaveValue(raw);
    await expect(context).toHaveCount(1);
    await enter(page, inspector.getByRole("button", { name: words.closeInspector, exact: true }));
    await page.getByRole("button", { name: words.reviewChanges, exact: true }).click();
    await expect(page.getByRole("dialog", { name: words.reviewChanges, exact: true })).toBeVisible();
    const body = mockApi.allowedWrites[0]!.body;
    expect(body).toMatchObject({ version: 2, strategy: "balanced", definition: { options: {
      questions: { complexity: { instructions: raw } },
      rules: [{ when: { task_type: "review", complexity: ["high", "unknown", "medium"] }, select: { label: "review_complex" } }, ...taskWorkflow().rules.slice(1).map(({ when, select }) => ({ when, select }))],
      fallback: { label: "fallback" },
    } } });
    expect(mockApi.requests.filter(({ method, path }) => method === "PUT" && path.includes("configuration"))).toEqual([]);
  });
}

for (const width of [320, 390]) for (const scheme of ["light", "dark"] as const) {
  test(`focused rule editing remains reachable at ${width}px in ${scheme}`, async ({ page, mockApi }, info) => {
    mockApi.appliedConfiguration = taskWorkflow();
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard/");
    await page.getByRole("button", { name: en.settings, exact: true }).click();
    await page.locator("[data-settings-language]").selectOption("zh-CN");
    await page.locator("[data-settings-scheme]").selectOption(scheme);
    await page.getByRole("button", { name: zhCN.strategyEditor, exact: true }).click();
    await expect(page.getByRole("button", { name: zhCN.canvasAddNode, exact: true })).toBeEnabled();
    await enter(page, page.locator('[data-canvas-node="rule-0"]'));
    const inspector = page.getByRole("complementary", { name: zhCN.nodeInspector });
    await expect(inspector).toBeVisible();
    const picker = inspector.getByRole("combobox", { name: zhCN.label, exact: true });
    await picker.selectOption("code_complex");
    await expect(picker).toHaveValue("code_complex");
    const bounds = await inspector.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`inspector-${width}-${scheme}.png`) });
    await enter(page, inspector.getByRole("button", { name: zhCN.closeInspector, exact: true }));
    await expect(inspector).toHaveCount(0);
    expect(mockApi.requests.filter(({ method, path }) => method !== "GET" && path.includes("configuration"))).toEqual([]);
  });
}
