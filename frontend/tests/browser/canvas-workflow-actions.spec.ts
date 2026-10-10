import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";
import type { CanvasLayout } from "../../src/shared/api/types";

async function frames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
}
async function blankPoint(page: Page, nearEdge = false) {
  return page.locator(".routing-canvas-scroll").evaluate((element, edge) => {
    const box = element.getBoundingClientRect();
    const xs = edge ? [box.right - 20, box.right - 60, box.left + 30] : [box.left + 440, box.left + 600, box.left + 90];
    for (const y of [box.bottom - 180, box.bottom - 260, box.top + 300]) for (const x of xs) {
      const hit = document.elementFromPoint(x, y);
      if (hit && element.contains(hit) && !hit.closest("button, [data-canvas-edge]")) return { x, y };
    }
    throw new Error("No exposed blank board point");
  }, nearEdge);
}

async function wirePoint(page: Page, selector: string) {
  await frames(page);
  return page.locator(selector).evaluate((element) => {
    const path = element as SVGPathElement, matrix = path.getScreenCTM()!;
    for (const fraction of [0.2, 0.3, 0.5, 0.7, 0.8]) {
      const point = path.getPointAtLength(path.getTotalLength() * fraction).matrixTransform(matrix);
      if (document.elementFromPoint(point.x, point.y) === path) return { x: point.x, y: point.y };
    }
    throw new Error("Wire is covered");
  });
}

test("native edge context deletion and keyboard undo keep protected pool and generated paths", async ({ page, mockApi }) => {
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: { questions: { x: 40, y: 80 }, "rule-0": { x: 350, y: 80 }, fallback: { x: 350, y: 280 }, "zone::balanced/default": { x: 650, y: 80 }, "zone::balanced/quality": { x: 650, y: 280 }, "model::fixture-provider/fixture-model": { x: 1000, y: 80 } } };
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const menu = page.getByRole("menu", { name: en.canvasActions });
  const match = '[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="match"]';
  const at = await wirePoint(page, match); await page.mouse.click(at.x, at.y, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: en.canvasDisconnect })).toBeEnabled();
  await menu.getByRole("menuitem", { name: en.canvasDisconnect }).click();
  await expect(page.locator(match)).toHaveCount(0);
  await page.locator(".routing-canvas-scroll").focus(); await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(match)).toHaveCount(1);
  await page.locator(match).focus(); await page.keyboard.press("Enter"); await page.locator(match).focus(); await page.keyboard.press("Delete");
  await expect(page.locator(match)).toHaveCount(0);
  await page.locator(".routing-canvas-scroll").focus(); await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator(match)).toHaveCount(1);
  const pool = await wirePoint(page, '[data-canvas-edge][data-edge-from="zone::balanced/default"][data-edge-kind="pool"]');
  await page.mouse.click(pool.x, pool.y, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: en.canvasDisconnect })).toBeDisabled();
  await expect(menu).toContainText(en.canvasReason_lastMember);
  await page.keyboard.press("Escape");
  const fixed = await wirePoint(page, '[data-canvas-edge][data-edge-from="rule-0"][data-edge-kind="unmatched"]');
  await page.mouse.click(fixed.x, fixed.y, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: en.canvasDisconnect })).toBeDisabled();
  await expect(menu).toContainText(en.canvasReason_fixed);
});

test("native zoom/pan add, input-safe deletion, combined history, review and save/reopen", async ({ page, mockApi }, testInfo) => {
  mockApi.appliedConfiguration = structuredClone(configuration);
  mockApi.allowedWrites.push({ method: "POST", path: "/v1/routing/configuration/validate" }, { method: "PUT", path: "/v1/routing/configuration" });
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: { questions: { x: 40, y: 80 }, "rule-0": { x: 380, y: 80 }, fallback: { x: 380, y: 300 } } };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const canvas = page.locator(".routing-canvas-scroll");
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: en.canvasZoomOut, exact: true }).click();
  await frames(page);
  const wheelAt = await blankPoint(page);
  await page.mouse.move(wheelAt.x, wheelAt.y); await page.mouse.wheel(160, 160);
  await expect.poll(() => canvas.evaluate((element) => element.scrollLeft > 70 && element.scrollTop > 40)).toBe(true);
  await canvas.focus(); await page.keyboard.press("h");
  const panStart = await blankPoint(page);
  const beforePan = await canvas.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }));
  await page.mouse.move(panStart.x, panStart.y); await page.mouse.down();
  await page.mouse.move(panStart.x + 70, panStart.y + 40, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => canvas.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }))).toEqual({ x: beforePan.x - 70, y: beforePan.y - 40 });
  await canvas.focus(); await page.keyboard.press("v");
  await page.mouse.wheel(0, 60); await frames(page);
  const point = await blankPoint(page);
  const expected = await page.locator(".routing-canvas-content").evaluate((element, point) => {
    const box = element.getBoundingClientRect(); const scale = box.width / (element as HTMLElement).offsetWidth;
    return { x: Math.round((point.x - box.left) / scale), y: Math.round((point.y - box.top) / scale) };
  }, point);
  const originalCount = mockApi.appliedConfiguration.rules.length;
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByRole("menu", { name: en.canvasActions });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: en.canvasAddQuestion })).toBeEnabled();
  await menu.getByRole("menuitem", { name: en.addRule, exact: true }).click();
  const added = canvas.locator(`[data-canvas-node="rule-${originalCount}"]`);
  await expect(added).toHaveClass(/selected/);
  await expect(added).toHaveAttribute("data-node-state", "incomplete");
  await expect.poll(() => mockApi.canvasLayout?.nodes[`rule-${originalCount}`]).toEqual(expected);
  const inspector = page.getByRole("complementary", { name: en.nodeInspector });
  await expect(inspector).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("workflow-new-rule.png"), fullPage: true });
  await inspector.getByRole("combobox", { name: en.label, exact: true }).selectOption(configuration.labels[0]!.name);
  await expect(added).toHaveAttribute("data-node-state", "selected");
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await added.focus(); await page.keyboard.press("Delete");
  await expect(added).toHaveCount(0);
  await expect.poll(() => mockApi.canvasLayout?.nodes[`rule-${originalCount}`]).toBeUndefined();
  await page.keyboard.press("ControlOrMeta+z"); await expect(added).toHaveCount(1);
  await canvas.focus(); await page.keyboard.press("ControlOrMeta+Shift+z"); await expect(added).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z"); await expect(added).toHaveCount(1);
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await added.focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => mockApi.canvasLayout?.nodes[`rule-${originalCount}`]?.x).toBe(expected.x + 20);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => mockApi.canvasLayout?.nodes[`rule-${originalCount}`]?.x).toBe(expected.x);
  await canvas.focus(); await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => mockApi.canvasLayout?.nodes[`rule-${originalCount}`]?.x).toBe(expected.x + 20);
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  const dragBounds = await added.boundingBox();
  if (!dragBounds) throw new Error("Added node is missing");
  const dragAt = { x: dragBounds.x + 30, y: dragBounds.y + 18 };
  expect(await page.evaluate((at) => document.elementFromPoint(at.x, at.y)?.closest("[data-canvas-node]")?.getAttribute("data-canvas-node"), dragAt)).toBe(`rule-${originalCount}`);
  await page.mouse.move(dragAt.x, dragAt.y); await page.mouse.down();
  await page.mouse.move(dragAt.x + 30, dragAt.y + 24, { steps: 6 }); await page.mouse.up();
  const finalPosition = { x: expected.x + 60, y: expected.y + 32 };
  await expect.poll(() => mockApi.canvasLayout?.nodes[`rule-${originalCount}`]).toEqual(finalPosition);
  await canvas.focus(); await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => mockApi.canvasLayout?.nodes[`rule-${originalCount}`]).toEqual({ x: expected.x + 20, y: expected.y });
  await canvas.focus(); await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => mockApi.canvasLayout?.nodes[`rule-${originalCount}`]).toEqual(finalPosition);
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await page.getByRole("button", { name: en.canvasAddNode, exact: true }).click();
  await menu.getByRole("menuitem", { name: en.canvasAddQuestion }).click();
  await expect(inspector).toBeVisible();
  const input = inspector.getByRole("textbox", { name: en.instructions, exact: true }).last();
  await input.fill("New routing question"); await input.press("Backspace");
  await expect(added).toHaveCount(1);
  await expect(input).toHaveValue("New routing questio");
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("workflow-desktop-history.png"), fullPage: true });
  await page.getByRole("button", { name: en.reviewChanges, exact: true }).click();
  await page.route("**/v1/routing/configuration", async (route) => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "Synthetic save failure" } }) });
    else await route.fallback();
  });
  const failed = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith("/v1/routing/configuration"));
  await page.getByRole("button", { name: en.confirmAndSave, exact: true }).click();
  expect((await failed).status()).toBe(500);
  await expect(page.getByRole("button", { name: en.confirmAndSave, exact: true })).toBeEnabled();
  await expect(added).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("workflow-save-failure.png"), fullPage: true });
  await page.unroute("**/v1/routing/configuration");
  await page.getByRole("button", { name: en.confirmAndSave, exact: true }).click();
  await expect.poll(() => mockApi.appliedConfiguration?.rules.length).toBe(originalCount + 1);
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeDisabled();
  await page.reload(); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(added).toHaveCount(1);
  await expect.poll(() => added.evaluate((element) => ({ x: Number.parseFloat((element as HTMLElement).style.left), y: Number.parseFloat((element as HTMLElement).style.top) }))).toEqual(finalPosition);
  expect(mockApi.appliedConfiguration?.questions.question_1?.instructions).toBe("New routing questio");
});

test("deleting a middle rule remaps its successor and cancelling restores the original slots", async ({ page, mockApi }) => {
  const catalog = structuredClone(configuration);
  catalog.rules = [0, 1, 2].map((index) => ({ ...catalog.rules[0]!, index }));
  mockApi.appliedConfiguration = catalog;
  const positions = { "rule-0": { x: 350, y: 100 }, "rule-1": { x: 650, y: 300 }, "rule-2": { x: 950, y: 100 } };
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: positions };
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const middle = page.locator('[data-canvas-node="rule-1"]');
  await middle.click({ button: "right" });
  await page.getByRole("menuitem", { name: en.remove, exact: true }).click();
  await expect(page.locator('[data-canvas-node="rule-2"]')).toHaveCount(0);
  await expect.poll(() => mockApi.canvasLayout?.nodes["rule-1"]).toEqual(positions["rule-2"]);
  await page.getByRole("button", { name: en.cancel, exact: true }).click();
  await expect(page.locator('[data-canvas-node="rule-2"]')).toHaveCount(1);
  await expect.poll(() => mockApi.canvasLayout?.nodes).toEqual(positions);
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeDisabled();
});

test("native stale node menu preserves remapped rules and a fresh menu still deletes with undo", async ({ page, mockApi }, testInfo) => {
  const catalog = structuredClone(configuration);
  catalog.questions.intent!.criteria.third = "Third route";
  catalog.rules = ["default", "other", "third"].map((criterion, index) => ({
    index, when: { intent: criterion }, select: { label: index === 1 ? "quality" : "default" },
  }));
  mockApi.appliedConfiguration = catalog;
  const positions = { "rule-0": { x: 350, y: 80 }, "rule-1": { x: 700, y: 300 }, "rule-2": { x: 1000, y: 80 } };
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: positions };
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const rules = page.locator('[data-canvas-node^="rule-"]');
  const first = page.locator('[data-canvas-node="rule-0"]');
  const second = page.locator('[data-canvas-node="rule-1"]');
  const menu = page.getByRole("menu", { name: en.canvasActions });
  const openFirstMenu = async () => {
    await frames(page);
    const at = await first.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const point = { x: box.left + 30, y: box.top + 18 };
      return { ...point, hit: document.elementFromPoint(point.x, point.y)?.closest("[data-canvas-node]")?.getAttribute("data-canvas-node") };
    });
    expect(at.hit).toBe("rule-0");
    await page.mouse.click(at.x, at.y, { button: "right" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: en.remove, exact: true })).toBeEnabled();
  };
  await expect(rules).toHaveCount(3);
  await openFirstMenu();
  const inspectorDelete = page.getByRole("complementary", { name: en.nodeInspector }).getByRole("button", { name: en.deleteRule, exact: true });
  await inspectorDelete.focus(); await page.keyboard.press("Enter");
  await expect(rules).toHaveCount(2);
  await expect.poll(() => mockApi.canvasLayout?.nodes).toEqual({ "rule-0": positions["rule-1"], "rule-1": positions["rule-2"] });
  const staleRemove = menu.getByRole("menuitem", { name: en.remove, exact: true });
  // Exercise any surviving action using Enter; pointer input would dismiss it first.
  if (await menu.count() && await staleRemove.isEnabled()) {
    await staleRemove.focus(); await page.keyboard.press("Enter");
  }
  await testInfo.attach("stale-menu-state", { body: JSON.stringify({ count: await rules.count(), menuCount: await menu.count(), nodes: mockApi.canvasLayout?.nodes }), contentType: "application/json" });
  await expect(rules).toHaveCount(2);
  await expect(menu).toHaveCount(0);
  await expect(first).toContainText("intent=other"); await expect(first).toContainText("quality");
  await expect(second).toContainText("intent=third");
  await expect.poll(() => mockApi.canvasLayout?.nodes).toEqual({ "rule-0": positions["rule-1"], "rule-1": positions["rule-2"] });
  await page.screenshot({ path: testInfo.outputPath("stale-menu-invalidated.png"), fullPage: true });
  await openFirstMenu();
  await menu.getByRole("menuitem", { name: en.remove, exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(rules).toHaveCount(1); await expect(first).toContainText("intent=third");
  await expect.poll(() => mockApi.canvasLayout?.nodes).toEqual({ "rule-0": positions["rule-2"] });
  const canvas = page.locator(".routing-canvas-scroll");
  await canvas.focus(); await page.keyboard.press("ControlOrMeta+z");
  await expect(rules).toHaveCount(2); await expect(first).toContainText("intent=other"); await expect(second).toContainText("intent=third");
  await expect.poll(() => mockApi.canvasLayout?.nodes).toEqual({ "rule-0": positions["rule-1"], "rule-1": positions["rule-2"] });
  await canvas.focus(); await page.keyboard.press("ControlOrMeta+z");
  await expect(rules).toHaveCount(3); await expect(first).toContainText("intent=default"); await expect(second).toContainText("intent=other");
  await expect(page.locator('[data-canvas-node="rule-2"]')).toContainText("intent=third");
  await expect.poll(() => mockApi.canvasLayout?.nodes).toEqual(positions);
});

test("invalid question configuration has a located explicit repair and undo", async ({ page, mockApi }) => {
  const catalog = structuredClone(configuration); catalog.questions.intent!.type = "score";
  mockApi.appliedConfiguration = catalog;
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const entry = page.locator('[data-canvas-node="questions"]');
  await expect(entry).toHaveAttribute("data-node-state", "invalid");
  await page.getByRole("button", { name: en.canvasUseChoice, exact: true }).click();
  await expect(page.getByRole("complementary", { name: en.nodeInspector })).toBeVisible();
  await expect(entry).toHaveAttribute("data-node-state", "selected");
  await expect(page.locator('[data-output-node="questions"][data-output-kind="context"]')).toHaveCount(2);
  await page.locator(".routing-canvas-scroll").focus(); await page.keyboard.press("ControlOrMeta+z");
  await expect(entry).toHaveAttribute("data-node-state", "invalid");
});

test("unknown rule destination repairs that rule without marking inherited fallback incomplete", async ({ page, mockApi }) => {
  const catalog = structuredClone(configuration);
  catalog.rules[0]!.select.label = "missing-label";
  catalog.fallback = {};
  mockApi.appliedConfiguration = catalog;
  await page.goto("/dashboard/"); await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(page.locator('[data-canvas-node="rule-0"]')).toHaveAttribute("data-node-state", "incomplete");
  await expect(page.locator('[data-canvas-node="fallback"]')).toHaveAttribute("data-node-state", "normal");
  await page.getByRole("button", { name: en.canvasRepair, exact: true }).click();
  const inspector = page.getByRole("complementary", { name: en.nodeInspector });
  await expect(inspector.getByRole("group", { name: `${en.rule} 1`, exact: true })).toBeVisible();
  await inspector.getByRole("combobox", { name: en.label, exact: true }).selectOption("default");
  await expect(page.locator('[data-canvas-node="rule-0"]')).toHaveAttribute("data-node-state", "selected");
});

test("policy review waits for queued layout PUTs and unsent viewport debounce work", async ({ page, mockApi }) => {
  const initial: CanvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: { "rule-0": { x: 350, y: 80 }, fallback: { x: 350, y: 300 } } };
  mockApi.canvasLayout = initial;
  const writes: CanvasLayout[] = [];
  let release!: () => void;
  const firstWrite = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/v1/dashboard/canvas-layout", async (route) => {
    if (route.request().method() !== "PUT") { await route.fallback(); return; }
    const next = route.request().postDataJSON() as CanvasLayout;
    writes.push(next);
    if (writes.length === 1) await firstWrite;
    mockApi.canvasLayout = next;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(next) });
  });
  await page.setViewportSize({ width: 1280, height: 900 }); await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click(); await frames(page);
  await page.locator('[data-canvas-node="fallback"]').click();
  await page.getByRole("complementary", { name: en.nodeInspector }).getByRole("combobox", { name: en.label, exact: true }).selectOption("quality");
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  const rule = page.locator('[data-canvas-node="rule-0"]');
  await rule.focus(); await rule.press("Alt+ArrowRight");
  await expect.poll(() => writes.length).toBe(1);
  await rule.press("Alt+ArrowRight");
  const review = page.getByRole("button", { name: en.reviewChanges, exact: true });
  await expect(review).toBeDisabled();
  await expect(page.getByText(en.canvasSavingLayout, { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  release();
  await expect.poll(() => writes.length).toBe(2);
  await expect(review).toBeEnabled();
  expect(mockApi.canvasLayout.nodes["rule-0"]).toEqual({ x: 390, y: 80 });
  const viewportBefore = await page.locator(".routing-canvas-scroll").evaluate((element) => element.scrollLeft);
  await page.locator(".routing-canvas-scroll").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => page.locator(".routing-canvas-scroll").evaluate((element) => element.scrollLeft)).toBeGreaterThan(viewportBefore);
  await expect(review).toBeDisabled();
  expect(writes).toHaveLength(2);
  await frames(page);
  const bounds = await rule.boundingBox(); if (!bounds) throw new Error("Rule has no native bounds");
  await page.mouse.move(bounds.x + 30, bounds.y + 18); await page.mouse.down();
  await page.mouse.move(bounds.x + 60, bounds.y + 28, { steps: 3 });
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect.poll(() => writes.length).toBe(3);
  await expect(review).toBeEnabled();
  expect(writes[2]!.nodes["rule-0"]).toEqual({ x: 390, y: 80 });
  expect(writes[2]!.viewport.x).toBeGreaterThan(writes[1]!.viewport.x);
});

for (const width of [1280, 320]) for (const locale of ["en", "zh-CN"] as const) for (const scheme of ["light", "dark"]) {
  test(`bounded context menu, keyboard addition and protected entry ${width} ${locale} ${scheme}`, async ({ page }, testInfo) => {
    const words = locale === "en" ? en : zhCN;
    await page.setViewportSize({ width, height: 900 }); await page.goto("/dashboard/");
    await page.getByRole("button", { name: en.settings, exact: true }).click();
    await page.locator("[data-settings-language]").selectOption(locale);
    await page.locator("[data-settings-scheme]").selectOption(scheme);
    await page.getByRole("button", { name: words.strategyEditor, exact: true }).click();
    const add = page.getByRole("button", { name: words.canvasAddNode, exact: true });
    await expect(add).toBeEnabled(); await add.focus(); await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: words.canvasActions }); await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
    await page.screenshot({ path: testInfo.outputPath(`menu-${width}-${locale}-${scheme}.png`), fullPage: true });
    await page.keyboard.press("Escape"); await expect(menu).toHaveCount(0); await expect(add).toBeFocused();
    await add.click(); await page.locator(".workspace-heading h2").click(); await expect(menu).toHaveCount(0);
    const point = await blankPoint(page, true); await page.mouse.click(point.x, point.y, { button: "right" });
    await expect(menu).toBeVisible();
    const edgeBounds = await menu.boundingBox();
    expect(edgeBounds!.x + edgeBounds!.width).toBeLessThanOrEqual(width);
    expect(edgeBounds!.y + edgeBounds!.height).toBeLessThanOrEqual(900);
    await page.screenshot({ path: testInfo.outputPath(`menu-${width}-${locale}-${scheme}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: words.canvasZoomFit, exact: true }).click(); await frames(page);
    const entry = page.locator('[data-canvas-node="questions"]');
    await entry.click({ button: "right" }); await expect(menu).toContainText(words.canvasProtectedNode);
    await expect(menu.getByRole("menuitem", { name: words.remove, exact: true })).toBeDisabled();
    await page.keyboard.press("Escape"); await entry.focus(); await page.keyboard.press("Delete"); await expect(entry).toHaveCount(1);
  });
}
