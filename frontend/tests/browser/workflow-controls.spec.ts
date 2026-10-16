import type { Page, Route } from "@playwright/test";
import { test, expect } from "./fixtures";
import type { MockApiState } from "../setup/mock-api";
import { workflowConfiguration } from "../fixtures/configuration";
import type { CanvasLayout, ConfigurationPayload, WorkflowWritePayload } from "../../src/shared/api/types";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

const MODEL = "fixture-provider/fixture-model";
const EXTRA = "fixture-provider/unselected";
type Fixture = {
  configs: Map<string, ConfigurationPayload>;
  layouts: Map<string, CanvasLayout>;
  writes: { method: string; path: string; body: unknown }[];
  hold?: { path: string; received: () => void; release: Promise<void>; status?: number };
  failRead?: number;
  failLayoutRead?: number;
  loseNextCreate?: "before" | "after";
};
async function installWorkflow(page: Page, mock: MockApiState): Promise<Fixture> {
  const initial = structuredClone(workflowConfiguration);
  initial.models.push({ ...initial.models[0]!, id: EXTRA, upstream_model: "unselected", tags: ["foreign/keep"], baseline_tags: ["foreign/keep"] });
  const other = structuredClone(initial);
  other.strategy = "Other"; other.deletable = true; other.config_hash = "other";
  other.labels = other.labels.map((label) => ({ ...label, tag: `Other/${label.name}` }));
  other.questions.intent!.instructions = "Other strategy instructions";
  other.definition!.options.questions = structuredClone(other.questions);
  const baseline = structuredClone(initial);
  const fixture: Fixture = {
    configs: new Map([["balanced", initial], ["Other", other]]),
    layouts: new Map([["balanced", { version: 1, viewport: { x: 0, y: 0 }, nodes: { questions: { x: 40, y: 30 }, "rule-0": { x: 280, y: 30 }, [`model::${MODEL}`]: { x: 40, y: 360 } } }]]),
    writes: [],
  };
  mock.appliedConfiguration = initial;
  const fulfill = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/v1/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (!/^\/v1\/(routing\/(configuration|strategies)|dashboard\/canvas-layout)/.test(url.pathname)) { await route.fallback(); return; }
    const path = url.pathname + url.search;
    mock.requests.push({ method, path });
    if (method !== "GET") {
      mock.allowedWrites.push({ method, path });
      fixture.writes.push({ method, path, body: request.postData() ? request.postDataJSON() : null });
    }
    if (fixture.hold?.path === url.pathname) {
      const held = fixture.hold; fixture.hold = undefined; held.received(); await held.release;
      if (held.status) { await fulfill(route, { error: { message: "Synthetic held failure" } }, held.status); return; }
    }
    if (url.pathname === "/v1/routing/strategies") {
      if (method === "POST") {
        const name = request.postDataJSON().name as string;
        if (fixture.loseNextCreate === "before") { fixture.loseNextCreate = undefined; await route.abort("failed"); return; }
        if (!name || name.trim() !== name || [".", "..", "auto"].includes(name) || name.includes("/") || fixture.configs.has(name)) { await fulfill(route, { error: { message: "Synthetic invalid strategy name" } }, 400); return; }
        const created = structuredClone(initial);
        created.strategy = name; created.deletable = true; created.config_hash = `created-${name}`; created.selected_models = [];
        created.rules = []; created.labels = [{ ...initial.labels[0]!, name: "routine", tag: `${name}/routine`, resolution: "models", models: [] }];
        created.fallback = { label: "routine" };
        created.definition = { kind: "decision_matrix", policy: { labels: { routine: { models: [] } } }, options: { questions: created.questions, rules: [], fallback: created.fallback } };
        fixture.configs.set(name, created); fixture.layouts.delete(name);
        if (fixture.loseNextCreate === "after") { fixture.loseNextCreate = undefined; await route.abort("failed"); return; }
        await fulfill(route, { name, applied: true }); return;
      }
      await fulfill(route, { object: "list", default: "balanced", data: [...fixture.configs.values()].map((config) => ({ name: config.strategy, description: null, policy: {}, editable: true, deletable: config.deletable })) }); return;
    }
    if (url.pathname.startsWith("/v1/routing/strategies/") && method === "DELETE") {
      const name = decodeURIComponent(url.pathname.slice("/v1/routing/strategies/".length));
      if (name === "balanced") { await fulfill(route, { error: { message: "Protected default" } }, 400); return; }
      fixture.configs.delete(name); fixture.layouts.delete(name); await fulfill(route, { deleted: name, applied: true }); return;
    }
    const strategy = url.searchParams.get("strategy") ?? "balanced";
    const config = fixture.configs.get(strategy);
    if (!config) { await fulfill(route, { error: { message: "Unknown workflow" } }, 404); return; }
    if (url.pathname === "/v1/dashboard/canvas-layout") {
      if (method === "GET" && fixture.failLayoutRead) { fixture.failLayoutRead--; await fulfill(route, { error: { message: "Synthetic layout read failure" } }, 503); return; }
      if (method === "PUT") fixture.layouts.set(strategy, request.postDataJSON() as CanvasLayout);
      await fulfill(route, fixture.layouts.get(strategy) ?? { version: 1, nodes: {}, viewport: { x: 0, y: 0 } }); return;
    }
    if (url.pathname.endsWith("/validate")) { await fulfill(route, { valid: true, warnings: [] }); return; }
    if (method === "PUT") {
      const payload = request.postDataJSON() as WorkflowWritePayload;
      expect(payload.version).toBe(2); expect(payload.strategy).toBe(strategy);
      config.selected_models = [...payload.selected_models]; config.definition = structuredClone(payload.definition);
      config.questions = structuredClone(payload.definition.options.questions);
      config.rules = payload.definition.options.rules.map((rule, index) => ({ ...rule, index }));
      config.fallback = structuredClone(payload.definition.options.fallback);
      config.labels = config.labels.map((label) => ({ ...label, resolution: "models", models: [...(payload.definition.policy.labels[label.name]?.models ?? [])] }));
      config.config_hash += ":saved"; config.overlay.applied = true;
      await fulfill(route, { applied: true, warnings: [] }); return;
    }
    if (method === "DELETE") {
      fixture.configs.set(strategy, structuredClone(strategy === "balanced" ? baseline : other));
      await fulfill(route, { applied: true, overlay_removed: false }); return;
    }
    if (fixture.failRead) { fixture.failRead--; await fulfill(route, { error: { message: "Synthetic configuration read failure" } }, 503); return; }
    await fulfill(route, config);
  });
  return fixture;
}

async function keyboardTarget(page: Page, target: import("@playwright/test").Locator) {
  for (let count = 0; count < 160; count++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Native Tab did not reach the target");
}

for (const width of [1280, 390, 320]) for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"] as const) {
  test(`selected nodes, CRUD, floating controls and modal focus ${width} ${locale} ${scheme}`, async ({ page, mockApi }, info) => {
    const words = locale === "en" ? en : zhCN;
    const fixture = await installWorkflow(page, mockApi);
    await page.setViewportSize({ width, height: 800 }); await page.emulateMedia({ colorScheme: scheme });
    await page.addInitScript((language) => localStorage.setItem("jev-dashboard-locale", language), locale);
    await page.goto("/dashboard/"); await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
    const selector = page.getByRole("combobox", { name: words.strategy, exact: true });
    await expect(selector).toHaveValue("balanced");
    await expect(page.getByRole("button", { name: words.workflowDelete, exact: true })).toBeDisabled();
    await expect(page.locator('[data-canvas-node="model::' + EXTRA + '"]')).toHaveCount(0);
    await expect(page.locator(".workflow-info, .workflow-drawer, .workspace-heading, .workspace-status")).toHaveCount(0);
    const add = page.getByRole("button", { name: words.canvasAddNode, exact: true });
    await add.click();
    await page.getByRole("menuitem", { name: words.workflowAddModel, exact: true }).click();
    const chooser = page.getByRole("dialog", { name: words.workflowChooseModel });
    await expect(chooser).toBeVisible(); await chooser.getByRole("textbox", { name: words.workflowModelSearch }).fill("unselected");
    await page.screenshot({ path: info.outputPath("model-chooser.png"), fullPage: true });
    await chooser.getByRole("button", { name: /unselected/ }).click();
    const extra = page.locator('[data-canvas-node="model::' + EXTRA + '"]');
    await expect(extra).toHaveCount(1); await expect(add).toBeFocused();
    await keyboardTarget(page, extra); await page.keyboard.press("Delete"); await expect(extra).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z"); await expect(extra).toHaveCount(1);
    await page.keyboard.press("ControlOrMeta+Shift+z"); await expect(extra).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z"); await expect(extra).toHaveCount(1);
    await expect(page.getByRole("button", { name: words.reviewChanges, exact: true })).toBeEnabled();
    await page.getByRole("button", { name: words.reviewChanges, exact: true }).click();
    const review = page.getByRole("dialog", { name: words.reviewChanges, exact: true });
    await expect(review).toBeVisible(); await review.getByRole("button", { name: words.confirmAndSave }).click();
    await expect(review).toHaveCount(0); await expect(extra).toHaveCount(1);
    expect(fixture.configs.get("balanced")!.selected_models).toEqual([MODEL, EXTRA]);
    expect(fixture.configs.get("balanced")!.models[1]!.tags).toEqual(["foreign/keep"]);
    expect(fixture.writes.filter((write) => write.method === "PUT" && write.path.startsWith("/v1/routing/configuration"))).toHaveLength(1);
    await selector.selectOption("Other"); await expect(selector).toHaveValue("Other"); await expect(extra).toHaveCount(0);
    await selector.selectOption("balanced"); await expect(selector).toHaveValue("balanced"); await expect(extra).toHaveCount(1);
    const create = page.getByRole("button", { name: words.workflowCreate, exact: true }); await create.click();
    const createDialog = page.getByRole("dialog", { name: words.workflowCreate, exact: true });
    await createDialog.getByRole("textbox", { name: words.workflowName }).fill("研究 flow");
    await createDialog.getByRole("button", { name: words.workflowCreate, exact: true }).click();
    await expect(createDialog).toHaveCount(0); await expect(selector).toHaveValue("研究 flow");
    await expect(page.locator('[data-node-kind="model"][data-canvas-node]')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("empty-new-workflow.png"), fullPage: true });
    await page.getByRole("button", { name: words.workflowDelete, exact: true }).click();
    const deletion = page.getByRole("dialog", { name: words.workflowDelete, exact: true }); await deletion.getByRole("button", { name: words.workflowDelete, exact: true }).click();
    await expect(deletion).toHaveCount(0); await expect(selector).toHaveValue("balanced");
    expect(fixture.configs.has("研究 flow")).toBe(false); expect(fixture.configs.has("Other")).toBe(true);
    await expect(extra).toHaveCount(1);
    await page.reload(); await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
    await expect(extra).toHaveCount(1);
    const geometry = await page.locator(".canvas-tools").evaluate((panel) => {
      const bounds = panel.getBoundingClientRect(), canvas = document.querySelector(".routing-canvas-scroll")!.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, canvasLeft: canvas.left, canvasRight: canvas.right, canvasBottom: canvas.bottom, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(width);
    expect(Math.abs((geometry.left + geometry.right) / 2 - (geometry.canvasLeft + geometry.canvasRight) / 2)).toBeLessThan(2);
    expect(Math.abs(geometry.canvasBottom - geometry.bottom - 12)).toBeLessThan(2);
    expect(geometry.overflow).toBe(false);
    await page.screenshot({ path: info.outputPath("floating-controls.png"), fullPage: true });
  });
}

test("dirty refusal, held validation, failed committed read and GET-only recovery preserve strategy identity", async ({ page, mockApi }) => {
  const fixture = await installWorkflow(page, mockApi);
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await page.getByRole("button", { name: en.canvasAddNode, exact: true }).click();
  await page.getByRole("menuitem", { name: en.workflowAddModel, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /unselected/ }).click();
  const selector = page.getByRole("combobox", { name: en.strategy, exact: true });
  page.once("dialog", (dialog) => dialog.dismiss()); await selector.selectOption("Other"); await expect(selector).toHaveValue("balanced");
  let admitted!: () => void, release!: () => void;
  const receipt = new Promise<void>((resolve) => { admitted = resolve; });
  fixture.hold = { path: "/v1/routing/configuration/validate", received: admitted, release: new Promise<void>((resolve) => { release = resolve; }) };
  await page.getByRole("button", { name: en.reviewChanges, exact: true }).click(); await receipt;
  await expect(selector).toBeDisabled(); await expect(page.getByRole("button", { name: en.workflowCreate, exact: true })).toBeDisabled();
  expect(fixture.writes.filter((write) => write.method === "PUT" && write.path.startsWith("/v1/routing/configuration"))).toHaveLength(0);
  release(); await expect(page.getByRole("dialog", { name: en.reviewChanges, exact: true })).toBeVisible();
  fixture.failRead = 2;
  await page.getByRole("dialog").getByRole("button", { name: en.confirmAndSave }).click();
  await expect(page.getByRole("button", { name: en.routingRetryRead })).toBeEnabled(); await expect(selector).toBeDisabled();
  await page.getByRole("button", { name: en.routingRetryRead }).click(); await expect(page.getByRole("button", { name: en.routingRetryRead })).toBeEnabled();
  await page.getByRole("button", { name: en.routingRetryRead }).click(); await expect(selector).toBeEnabled();
  expect(fixture.writes.filter((write) => write.method === "PUT" && write.path.startsWith("/v1/routing/configuration"))).toHaveLength(1);
  expect(fixture.writes.filter((write) => write.path.includes("configuration")).map((write) => write.path)).toEqual(["/v1/routing/configuration/validate?strategy=balanced", "/v1/routing/configuration?strategy=balanced"]);
  await expect(page.locator('[data-canvas-node="model::' + EXTRA + '"]')).toHaveCount(1);
});

test("native pointer/keyboard layout edits, local pool removal, reset and strategy isolation", async ({ page, mockApi }, info) => {
  const fixture = await installWorkflow(page, mockApi);
  await page.setViewportSize({ width: 1280, height: 900 }); await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const question = page.locator('[data-canvas-node="questions"]');
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  const point = await question.evaluate((element) => {
    const bounds = element.getBoundingClientRect(); const x = bounds.left + 90, y = bounds.top + 25;
    if (!element.contains(document.elementFromPoint(x, y))) throw new Error("Native node point is occluded");
    return { x, y, width: (element as HTMLElement).offsetWidth, header: element.querySelector(".canvas-node-content")!.getBoundingClientRect().height, rows: [...element.querySelectorAll<HTMLElement>("span[style]")].filter((item) => item.style.height === "28px").length };
  });
  expect(point.width).toBe(240); expect(point.header).toBe(56); expect(point.rows).toBeGreaterThan(0);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 50, point.y + 40, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => fixture.layouts.get("balanced")?.nodes.questions).toEqual({ x: 90, y: 70 });
  await page.keyboard.press("Alt+ArrowRight"); await expect.poll(() => fixture.layouts.get("balanced")?.nodes.questions).toEqual({ x: 110, y: 70 });
  expect(fixture.writes.filter((write) => write.path.startsWith("/v1/routing/configuration"))).toEqual([]);
  await page.getByRole("button", { name: en.canvasUndo, exact: true }).click();
  await expect.poll(() => fixture.layouts.get("balanced")?.nodes.questions).toEqual({ x: 90, y: 70 });
  await keyboardTarget(page, question); await page.keyboard.press("Shift+Space");
  await expect(question).toHaveClass(/\bselected\b/);
  const beforeOther = structuredClone(fixture.configs.get("Other")!);
  const selector = page.getByRole("combobox", { name: en.strategy, exact: true });
  await expect(selector).toBeEnabled(); await selector.selectOption("Other"); await expect(selector).toHaveValue("Other");
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: en.canvasRedo, exact: true })).toBeDisabled();
  await selector.selectOption("balanced"); await expect(selector).toHaveValue("balanced");
  await expect(question).toHaveCSS("left", "90px");
  await expect(question).toHaveClass(/\bselected\b/);
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: en.canvasRedo, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: en.canvasRedo, exact: true }).click();
  await expect.poll(() => fixture.layouts.get("balanced")?.nodes.questions).toEqual({ x: 110, y: 70 });
  await page.getByRole("button", { name: en.canvasUndo, exact: true }).click();
  await expect.poll(() => fixture.layouts.get("balanced")?.nodes.questions).toEqual({ x: 90, y: 70 });
  await page.getByRole("button", { name: en.canvasRedo, exact: true }).click();
  await expect.poll(() => fixture.layouts.get("balanced")?.nodes.questions).toEqual({ x: 110, y: 70 });
  await expect(question).toHaveCSS("left", "110px");
  const rule = page.locator('[data-canvas-node="rule-0"]'); await keyboardTarget(page, rule); await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: en.nodeInspector });
  await expect(inspector).toBeVisible(); await inspector.getByRole("combobox", { name: en.label, exact: true }).selectOption("quality");
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await page.getByRole("button", { name: en.reviewChanges, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: en.confirmAndSave }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(fixture.configs.get("balanced")!.rules[0]!.select.label).toBe("quality"); expect(fixture.configs.get("Other")).toEqual(beforeOther);
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: en.canvasRedo, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: en.resetBaseline, exact: true }).click();
  await expect(page.getByRole("dialog", { name: en.resetBaseline })).toContainText(en.resetReviewPrompt);
  await page.getByRole("dialog").getByRole("button", { name: en.confirmReset }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); expect(fixture.configs.get("balanced")!.rules[0]!.select.label).toBe("default");
  expect(fixture.layouts.get("balanced")!.nodes.questions).toEqual({ x: 110, y: 70 }); expect(fixture.configs.get("Other")).toEqual(beforeOther);
  await page.screenshot({ path: info.outputPath("native-layout-and-reset.png"), fullPage: true });
});

test("unresolved layout read retries GET and strategy names reject without losing the dialog draft", async ({ page, mockApi }) => {
  const fixture = await installWorkflow(page, mockApi); fixture.failLayoutRead = 1;
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: en.canvasRetryLayoutRead }).click();
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  expect(fixture.writes).toEqual([]);
  await page.getByRole("button", { name: en.workflowCreate, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: en.workflowCreate, exact: true });
  for (const name of ["balanced", ".", "..", "bad/name"]) {
    await dialog.getByRole("textbox", { name: en.workflowName }).fill(name);
    await dialog.getByRole("button", { name: en.workflowCreate, exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Synthetic invalid strategy name");
    await expect(dialog.getByRole("textbox", { name: en.workflowName })).toHaveValue(name);
    await expect(page.locator(".strategy-controls select")).toHaveValue("balanced");
  }
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: en.workflowCreate, exact: true })).toBeFocused();
  expect([...fixture.configs.keys()]).toEqual(["balanced", "Other"]);
});

test("read-only workflow permits shared model inspection and keeps all native mutations disabled", async ({ page, mockApi }) => {
  const fixture = await installWorkflow(page, mockApi); fixture.configs.get("balanced")!.write_available = false;
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  for (const name of [en.workflowCreate, en.workflowDelete, en.reviewChanges, en.canvasAddNode]) await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  const model = page.locator('[data-canvas-node="model::' + MODEL + '"]'); await keyboardTarget(page, model); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: en.mmSave, exact: true })).toBeDisabled();
  for (let count = 0; count < 35; count++) { await page.keyboard.press("Tab"); expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true); }
  for (let count = 0; count < 35; count++) { await page.keyboard.press("Shift+Tab"); expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(model).toBeFocused();
  expect(fixture.writes).toEqual([]);
});

test("held strategy creation keeps modal focus and blocks duplicate submissions and departure", async ({ page, mockApi }) => {
  const fixture = await installWorkflow(page, mockApi);
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await page.getByRole("button", { name: en.workflowCreate, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: en.workflowCreate, exact: true });
  await dialog.getByRole("textbox", { name: en.workflowName }).fill("Held creation");
  let release!: () => void, admitted!: () => void;
  const receipt = new Promise<void>((resolve) => { admitted = resolve; });
  fixture.hold = { path: "/v1/routing/strategies", received: admitted, release: new Promise<void>((resolve) => { release = resolve; }) };
  await keyboardTarget(page, dialog.getByRole("button", { name: en.workflowCreate, exact: true })); await page.keyboard.press("Enter"); await receipt;
  await expect(dialog.getByRole("button", { name: en.workflowCreate, exact: true })).toBeDisabled();
  for (const key of ["Tab", "Shift+Tab"]) for (let count = 0; count < 35; count++) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((element) => element.contains(document.activeElement) && !(document.activeElement as HTMLElement).matches(":disabled"))).toBe(true);
  }
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  expect(fixture.writes.filter((write) => write.path === "/v1/routing/strategies" && write.method === "POST")).toHaveLength(1);
  release(); await expect(dialog).toHaveCount(0); await expect(page.getByRole("combobox", { name: en.strategy, exact: true })).toHaveValue("Held creation");
});

test("a strategy GET retired by native model-read 401 cannot replace a newer switch or disconnect after reconnect", async ({ page, mockApi }) => {
  const fixture = await installWorkflow(page, mockApi);
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const selector = page.getByRole("combobox", { name: en.strategy, exact: true });
  const question = page.locator('[data-canvas-node="questions"]'); await keyboardTarget(page, question); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => fixture.layouts.get("balanced")?.nodes.questions).toEqual({ x: 60, y: 30 });
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeEnabled();
  await expect(selector).toBeEnabled();
  let release!: () => void, admitted!: () => void;
  const receipt = new Promise<void>((resolve) => { admitted = resolve; });
  fixture.hold = { path: "/v1/routing/configuration", status: 503, received: admitted, release: new Promise<void>((resolve) => { release = resolve; }) };
  let releaseModel!: () => void, admittedModel!: () => void;
  const modelReceipt = new Promise<void>((resolve) => { admittedModel = resolve; });
  const modelRelease = new Promise<void>((resolve) => { releaseModel = resolve; });
  await page.route("**/v1/provider-configuration", async (route) => {
    if (route.request().method() !== "GET") { await route.fallback(); return; }
    mockApi.requests.push({ method: "GET", path: "/v1/provider-configuration" });
    admittedModel(); await modelRelease;
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { message: "Synthetic model read authentication" } }) });
  }, { times: 1 });
  const model = page.locator('[data-canvas-node="model::' + MODEL + '"]'); await keyboardTarget(page, model); await page.keyboard.press("Enter");
  await modelReceipt; await selector.selectOption("Other"); await receipt; releaseModel();
  await expect(page.getByRole("button", { name: en.connect, exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: en.apiKey, exact: true }).fill("synthetic-workflow-reconnect");
  await page.getByRole("button", { name: en.connect, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: en.strategyEditor, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeDisabled();
  await expect(selector).toBeEnabled(); await selector.selectOption("Other"); await expect(selector).toHaveValue("Other");
  const retiredResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/v1/routing/configuration" && response.status() === 503);
  release(); const response = await retiredResponse; await response.finished();
  await expect(selector).toHaveValue("Other"); await expect(selector).toBeEnabled();
  await expect(page.getByRole("button", { name: en.connect, exact: true })).toHaveCount(0);
  await expect(page.getByText("Synthetic held failure", { exact: true })).toHaveCount(0);
  expect(fixture.writes.filter((write) => !write.path.startsWith("/v1/dashboard/canvas-layout"))).toEqual([]);
});

test("confirmed view departure retires only its strategy while canceled departure and another strategy keep usable history", async ({ page, mockApi }, info) => {
  const fixture = await installWorkflow(page, mockApi);
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const selector = page.getByRole("combobox", { name: en.strategy, exact: true });
  const question = page.locator('[data-canvas-node="questions"]');
  await keyboardTarget(page, question); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => fixture.layouts.get("balanced")?.nodes.questions).toEqual({ x: 60, y: 30 });
  const balancedMoved = structuredClone(fixture.layouts.get("balanced")!);
  await expect(selector).toBeEnabled(); await selector.selectOption("Other"); await expect(selector).toHaveValue("Other");
  await keyboardTarget(page, question); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => fixture.layouts.get("Other")?.nodes.questions).toEqual({ x: 70, y: 80 });
  const fallback = page.locator('[data-canvas-node="fallback"]');
  await keyboardTarget(page, fallback); await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: en.nodeInspector });
  await inspector.getByRole("combobox", { name: en.label, exact: true }).selectOption("quality");
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  const settings = page.getByRole("button", { name: en.settings, exact: true });
  await expect(settings).toBeEnabled();
  const prefix = structuredClone(fixture.writes), acceptedOther = structuredClone(fixture.layouts.get("Other")!);
  const savedOther = structuredClone(fixture.configs.get("Other")!);
  page.once("dialog", dialog => dialog.dismiss()); await settings.click();
  await expect(settings).toBeFocused(); await expect(selector).toHaveValue("Other");
  await expect(fallback).toContainText("quality");
  await expect(page.locator('.workflow-toolbar[data-policy-draft]')).toHaveAttribute("data-policy-draft", "pending");
  expect(fixture.writes).toEqual(prefix);
  const undo = page.getByRole("button", { name: en.canvasUndo, exact: true });
  const redo = page.getByRole("button", { name: en.canvasRedo, exact: true });
  await undo.click(); await expect(fallback).toContainText("default");
  await expect.poll(() => fixture.writes.length).toBe(prefix.length + 1);
  await redo.click(); await expect(fallback).toContainText("quality");
  await expect.poll(() => fixture.writes.length).toBe(prefix.length + 2);
  const otherWrites = Array.from({ length: 2 }, () => ({ method: "PUT", path: "/v1/dashboard/canvas-layout?strategy=Other", body: acceptedOther }));
  expect(fixture.writes).toEqual([...prefix, ...otherWrites]);
  await expect(settings).toBeEnabled();
  page.once("dialog", dialog => dialog.accept()); await settings.click();
  await expect(page.locator("[data-settings-language]")).toBeVisible();
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(selector).toHaveValue("Other"); await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  await expect(question).toHaveCSS("left", "70px"); await expect(fallback).toContainText("default");
  await expect(undo).toBeDisabled(); await expect(redo).toBeDisabled();
  await expect(page.locator('.workflow-toolbar[data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  expect(fixture.layouts.get("Other")).toEqual(acceptedOther); expect(fixture.configs.get("Other")).toEqual(savedOther);
  expect(fixture.writes).toEqual([...prefix, ...otherWrites]);
  await selector.selectOption("balanced"); await expect(selector).toHaveValue("balanced");
  await expect(question).toHaveCSS("left", "60px"); await expect(undo).toBeEnabled();
  const balancedInitial = { ...balancedMoved, nodes: { ...balancedMoved.nodes, questions: { x: 40, y: 30 } } };
  await undo.click(); await expect.poll(() => fixture.layouts.get("balanced")).toEqual(balancedInitial);
  await redo.click(); await expect.poll(() => fixture.layouts.get("balanced")).toEqual(balancedMoved);
  expect(fixture.writes).toEqual([...prefix, ...otherWrites, { method: "PUT", path: "/v1/dashboard/canvas-layout?strategy=balanced", body: balancedInitial }, { method: "PUT", path: "/v1/dashboard/canvas-layout?strategy=balanced", body: balancedMoved }]);
  expect(fixture.writes.every(write => write.method === "PUT" && write.path.startsWith("/v1/dashboard/canvas-layout?strategy="))).toBe(true);
  await info.attach("discard-owner-history-ledger", { contentType: "application/json", body: JSON.stringify({ prefix, acceptedOther, savedOther, balancedInitial, balancedMoved, writes: fixture.writes, requests: mockApi.requests }, null, 2) });
});

test("canceled dirty departure preserves history while confirmed discard and departure cannot resurrect models", async ({ page, mockApi }) => {
  const fixture = await installWorkflow(page, mockApi);
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const selector = page.getByRole("combobox", { name: en.strategy, exact: true });
  const balancedQuestion = page.locator('[data-canvas-node="questions"]'); await keyboardTarget(page, balancedQuestion); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => fixture.layouts.get("balanced")?.nodes.questions).toEqual({ x: 60, y: 30 });
  await expect(selector).toBeEnabled();
  await selector.selectOption("Other"); await expect(selector).toHaveValue("Other");
  const question = page.locator('[data-canvas-node="questions"]'); await keyboardTarget(page, question); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => fixture.layouts.get("Other")?.nodes.questions).toEqual({ x: 70, y: 80 });
  const add = async () => {
    await page.getByRole("button", { name: en.canvasAddNode, exact: true }).click();
    await page.getByRole("menuitem", { name: en.workflowAddModel, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: /unselected/ }).click();
    await expect(page.locator('[data-canvas-node="model::' + EXTRA + '"]')).toBeVisible();
  };
  await add();
  page.once("dialog", (dialog) => dialog.dismiss()); await selector.selectOption("balanced"); await expect(selector).toHaveValue("Other");
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeEnabled();
  await expect(page.locator('[data-canvas-node="model::' + EXTRA + '"]')).toBeVisible();
  await page.getByRole("button", { name: en.discardChanges, exact: true }).click();
  await expect(page.locator('[data-canvas-node="model::' + EXTRA + '"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: en.canvasRedo, exact: true })).toBeDisabled();
  await add(); page.once("dialog", (dialog) => dialog.accept()); await selector.selectOption("balanced"); await expect(selector).toHaveValue("balanced");
  await selector.selectOption("Other"); await expect(selector).toHaveValue("Other");
  await expect(page.locator('[data-canvas-node="model::' + EXTRA + '"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: en.canvasRedo, exact: true })).toBeDisabled();
  await expect(question).toHaveCSS("left", "70px");
  expect(fixture.configs.get("Other")!.selected_models).toEqual([MODEL]);
  expect(fixture.writes.filter((write) => write.path.startsWith("/v1/routing/configuration"))).toEqual([]);
  await add(); page.once("dialog", (dialog) => dialog.dismiss()); await page.getByRole("button", { name: en.monitoring, exact: true }).click();
  await expect(selector).toHaveValue("Other"); await expect(page.locator('[data-canvas-node="model::' + EXTRA + '"]')).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: en.monitoring, exact: true }).click();
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(selector).toHaveValue("Other"); await expect(page.locator('[data-canvas-node="model::' + EXTRA + '"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: en.canvasRedo, exact: true })).toBeDisabled();
  await keyboardTarget(page, question); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => fixture.layouts.get("Other")?.nodes.questions).toEqual({ x: 90, y: 80 });
  await expect(selector).toBeEnabled();
  await page.getByRole("button", { name: en.workflowDelete, exact: true }).click(); await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: en.workflowDelete, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: en.workflowDelete, exact: true }).click();
  await expect(selector).toHaveValue("balanced");
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeEnabled();
  await expect(question).toHaveCSS("left", "60px");
  await page.getByRole("button", { name: en.workflowCreate, exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: en.workflowName }).fill("Other");
  await page.getByRole("dialog").getByRole("button", { name: en.workflowCreate, exact: true }).click();
  await expect(selector).toHaveValue("Other");
  await expect(page.locator('[data-node-kind="model"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: en.canvasRedo, exact: true })).toBeDisabled();
});

for (const outcome of ["before", "after"] as const) test(`unknown strategy creation ${outcome} commit recovers through reads without replay`, async ({ page, mockApi }) => {
  const fixture = await installWorkflow(page, mockApi); fixture.loseNextCreate = outcome;
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await page.getByRole("button", { name: en.workflowCreate, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: en.workflowCreate, exact: true });
  await dialog.getByRole("textbox", { name: en.workflowName }).fill("Uncertain creation");
  await dialog.getByRole("button", { name: en.workflowCreate, exact: true }).click();
  await expect(dialog.getByRole("button", { name: en.routingRetryRead })).toBeEnabled();
  await expect(dialog.getByRole("textbox", { name: en.workflowName })).toHaveValue("Uncertain creation");
  await expect(dialog.getByRole("button", { name: en.workflowCreate, exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: en.routingRetryRead }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: en.strategy, exact: true })).toHaveValue(outcome === "after" ? "Uncertain creation" : "balanced");
  expect(fixture.writes.filter((write) => write.method === "POST" && write.path === "/v1/routing/strategies")).toHaveLength(1);
  expect(mockApi.requests.slice(mockApi.requests.findIndex((request) => request.method === "POST" && request.path === "/v1/routing/strategies") + 1).filter((request) => request.path.includes("strategies") || request.path.includes("configuration")).every((request) => request.method === "GET")).toBe(true);
});
