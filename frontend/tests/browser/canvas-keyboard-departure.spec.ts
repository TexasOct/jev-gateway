import { writeFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeEnabled();
  const reverse = await target.evaluate(el => document.activeElement !== document.body && !!(el.compareDocumentPosition(document.activeElement!) & Node.DOCUMENT_POSITION_FOLLOWING));
  for (let count = 0; count < 180; count++) {
    // Native focus scrolling can admit a debounced layout PUT and disable navigation.
    // Observe its completion in the browser before running the enabled assertion.
    const focused = await target.evaluate(async el => {
      const started = performance.now();
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      while (el.matches(":disabled")) {
        if (performance.now() - started >= 5_000) throw new Error("Tab traversal target stayed disabled");
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      if (!el.isConnected) throw new Error("Tab traversal target was detached");
      return el === document.activeElement;
    });
    await expect(target).toBeEnabled();
    if (focused) break;
    await page.keyboard.press(reverse ? "Shift+Tab" : "Tab");
  }
  await expect(target).toBeFocused();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const focus = await target.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const y = rect.top + (el.hasAttribute("data-canvas-node") ? 18 : rect.height / 2);
    return { visible: el.matches(":focus-visible"), bounds: rect.toJSON(), hits: [rect.left + 2, rect.left + rect.width / 2, rect.right - 2].map(x => el.contains(document.elementFromPoint(x, y))) };
  });
  expect(focus.visible).toBe(true); expect(focus.hits.every(Boolean), JSON.stringify(focus)).toBe(true);
  expect(focus.bounds.left).toBeGreaterThanOrEqual(0); expect(focus.bounds.right).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}

async function open(page: Page, locale: "en" | "zh-CN", width: number) {
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/dashboard/");
  if (locale === "zh-CN") {
    await tabTo(page, page.getByRole("button", { name: en.settings, exact: true })); await page.keyboard.press("Enter");
    await tabTo(page, page.locator("[data-settings-language]")); await page.locator("[data-settings-language]").selectOption("zh-CN");
    await expect(page.locator("[data-settings-language]")).toHaveValue("zh-CN");
  }
  const words = locale === "en" ? en : zhCN;
  await tabTo(page, page.getByRole("button", { name: words.strategyEditor, exact: true })); await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: words.canvasAddNode, exact: true })).toBeEnabled();
  return words;
}

for (const [locale, width] of [["en", 320], ["zh-CN", 1280]] as const) test(`native keyboard add edit delete undo review save and clean departure ${locale} ${width}`, async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = { version: 1, nodes: { questions: { x: 50, y: 80 }, "rule-0": { x: 420, y: 80 }, fallback: { x: 420, y: 300 } }, viewport: { x: 0, y: 0 } };
  mockApi.allowedWrites.push({ method: "POST", path: "/v1/routing/configuration/validate" }, { method: "PUT", path: "/v1/routing/configuration" });
  const words = await open(page, locale, width);
  await tabTo(page, page.getByRole("button", { name: words.canvasAddNode, exact: true })); await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: words.addRule, exact: true })).toBeFocused(); await page.keyboard.press("Enter");
  const added = page.locator('[data-canvas-node="rule-1"]');
  await expect(added).toHaveAttribute("data-node-state", "incomplete");
  const inspector = page.getByRole("complementary", { name: words.nodeInspector });
  const destination = inspector.getByRole("combobox", { name: words.label, exact: true });
  await tabTo(page, destination); await page.keyboard.press("q");
  await expect(destination).toHaveValue("quality");
  await tabTo(page, page.getByRole("button", { name: words.closeInspector, exact: true })); await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: words.settings, exact: true })).toBeEnabled();
  const configuredNodes = structuredClone(mockApi.canvasLayout!.nodes);
  await tabTo(page, added); await page.keyboard.press("Delete");
  await expect(added).toHaveCount(0); await expect(page.locator(".routing-canvas-scroll")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+z"); await expect(added).toContainText("quality");
  await expect.poll(() => mockApi.canvasLayout?.nodes).toEqual(configuredNodes);
  await page.keyboard.press("ControlOrMeta+Shift+z"); await expect(added).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z"); await expect(added).toContainText("quality");
  await expect.poll(() => mockApi.canvasLayout?.nodes).toEqual(configuredNodes);
  await tabTo(page, page.getByRole("button", { name: words.reviewChanges, exact: true })); await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: words.confirmAndSave, exact: true })); await page.keyboard.press("Enter");
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await expect(page.getByRole("button", { name: words.canvasUndo, exact: true })).toBeDisabled();
  const saved = structuredClone(mockApi.appliedConfiguration!);
  expect(saved.rules.map(({ when, select }) => ({ when, select }))).toEqual([{ when: { intent: "default" }, select: { label: "default" } }, { when: { intent: "default" }, select: { label: "quality" } }]);
  const payload = { version: 1, strategy: configuration.strategy, questions: configuration.questions, rules: [{ when: { intent: "default" }, select: { label: "default" } }, { when: { intent: "default" }, select: { label: "quality" } }], fallback: configuration.fallback, models: {} };
  expect(mockApi.allowedWrites[0]!.body).toEqual(payload); expect(mockApi.allowedWrites[1]!.body).toEqual(payload);
  expect(saved.questions).toEqual(configuration.questions); expect(saved.fallback).toEqual(configuration.fallback);
  const writes = mockApi.requests.filter(request => request.method !== "GET");
  expect(writes.filter(request => request.path !== "/v1/dashboard/canvas-layout")).toEqual([{ method: "POST", path: "/v1/routing/configuration/validate" }, { method: "PUT", path: "/v1/routing/configuration" }]);
  const dialogs: string[] = []; page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await tabTo(page, page.getByRole("button", { name: words.settings, exact: true }));
  const departureWrites = mockApi.requests.filter(request => request.method !== "GET"), layout = structuredClone(mockApi.canvasLayout);
  expect(layout?.nodes).toEqual(configuredNodes);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-settings-language]")).toBeVisible();
  await tabTo(page, page.getByRole("button", { name: words.strategyEditor, exact: true })); await page.keyboard.press("Enter");
  await expect(added).toContainText("quality"); await expect(page.getByRole("button", { name: words.canvasAddNode, exact: true })).toBeEnabled();
  expect(dialogs).toEqual([]); expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual(departureWrites);
  expect(mockApi.appliedConfiguration).toEqual(saved); expect(mockApi.canvasLayout).toEqual(layout);
  await writeFile(info.outputPath("keyboard-saved.json"), JSON.stringify({ payload, saved, layout, writes, departureWrites, dialogs }, null, 2));
  await page.screenshot({ path: info.outputPath("keyboard-saved.png") });
});

for (const [locale, width] of [["en", 1280], ["zh-CN", 390]] as const) test(`dirty cancel discard and confirmed layout-only departure own their requests ${locale} ${width}`, async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = { version: 1, nodes: { "rule-0": { x: 420, y: 80 }, fallback: { x: 420, y: 300 } }, viewport: { x: 0, y: 0 } };
  const words = await open(page, locale, width);
  await tabTo(page, page.locator('[data-canvas-node="fallback"]')); await page.keyboard.press("Enter");
  const destination = page.getByRole("complementary", { name: words.nodeInspector }).getByRole("combobox", { name: words.label, exact: true });
  await tabTo(page, destination); await page.keyboard.press("q");
  await expect(destination).toHaveValue("quality");
  await tabTo(page, page.getByRole("button", { name: words.closeInspector, exact: true })); await page.keyboard.press("Enter");
  const settings = page.getByRole("button", { name: words.settings, exact: true });
  await expect(settings).toBeEnabled();
  await tabTo(page, settings);
  const before = structuredClone(mockApi.canvasLayout), writesBefore = mockApi.requests.filter(request => request.method !== "GET");
  page.once("dialog", dialog => dialog.dismiss()); await page.keyboard.press("Enter");
  await expect(settings).toBeFocused(); await expect(page.locator('[data-canvas-node="fallback"].selected')).toContainText("quality");
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "pending");
  expect(mockApi.canvasLayout).toEqual(before); expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual(writesBefore);
  page.once("dialog", dialog => dialog.accept()); await page.keyboard.press("Enter");
  await expect(page.locator("[data-settings-language]")).toBeVisible();
  await tabTo(page, page.getByRole("button", { name: words.strategyEditor, exact: true })); await page.keyboard.press("Enter");
  await expect(page.locator('[data-canvas-node="fallback"]')).toContainText("default");
  await expect(page.getByRole("button", { name: words.canvasUndo, exact: true })).toBeDisabled();
  expect(mockApi.canvasLayout).toEqual(before); expect(mockApi.appliedConfiguration).toBeUndefined();
  await tabTo(page, page.locator('[data-canvas-node="fallback"]')); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => mockApi.canvasLayout?.nodes.fallback).toEqual({ x: 440, y: 300 });
  await expect(settings).toBeEnabled();
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  const dialogs: string[] = []; page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await tabTo(page, settings);
  const moved = structuredClone(mockApi.canvasLayout), writesAfterMove = mockApi.requests.filter(request => request.method !== "GET");
  expect(moved?.nodes.fallback).toEqual({ x: 440, y: 300 });
  await page.keyboard.press("Enter"); await expect(page.locator("[data-settings-language]")).toBeVisible();
  expect(dialogs).toEqual([]); expect(mockApi.canvasLayout).toEqual(moved); expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual(writesAfterMove);
  expect(writesAfterMove.every(request => request.path === "/v1/dashboard/canvas-layout")).toBe(true);
  expect(configuration.fallback.label).toBe("default");
  await writeFile(info.outputPath("departure-boundaries.json"), JSON.stringify({ before, moved, writesBefore, writesAfterMove, dialogs, requests: mockApi.requests }, null, 2));
  await page.screenshot({ path: info.outputPath("departed.png") });
});
