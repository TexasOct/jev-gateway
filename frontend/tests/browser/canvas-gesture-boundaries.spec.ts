import { writeFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";
import { zhCN } from "../../src/shared/i18n/zh-CN";

const positions = { questions: { x: 50, y: 80 }, "rule-0": { x: 350, y: 80 }, fallback: { x: 350, y: 300 }, "zone::balanced/default": { x: 900, y: 80 }, "zone::balanced/quality": { x: 900, y: 300 } };
for (const gesture of ["node", "connection"] as const) for (const mechanism of ["inspector", "undo", "redo", "discard", "hash-refresh"] as const) {
  test(`held ${gesture} is superseded by ${mechanism}`, async ({ page, mockApi }, info) => {
    const catalog = structuredClone(configuration);
    mockApi.appliedConfiguration = catalog;
    mockApi.canvasLayout = { version: 1, nodes: structuredClone(positions), viewport: { x: 0, y: 0 } };
    mockApi.allowedWrites.push({ method: "POST", path: "/v1/routing/configuration/validate" });
    await page.setViewportSize({ width: 1280, height: 900 }); await page.goto("/dashboard/");
    await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
    await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
    const fallback = page.locator('[data-canvas-node="fallback"]');
    await fallback.focus(); await page.keyboard.press("Enter");
    const inspector = page.getByRole("complementary", { name: en.nodeInspector });
    const label = inspector.getByRole("combobox", { name: en.label, exact: true });
    if (mechanism !== "inspector") {
      await label.selectOption("quality");
      await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeEnabled();
    }
    if (mechanism === "redo") {
      await page.locator(".routing-canvas-scroll").focus(); await page.keyboard.press("ControlOrMeta+z");
      await expect(fallback).toContainText("default");
      await expect(page.getByRole("button", { name: en.canvasRedo, exact: true })).toBeEnabled();
    }
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const target = gesture === "node" ? page.locator('[data-canvas-node="questions"]') : page.locator('[data-output-node="rule-0"][data-canvas-output="match"]');
    const handle = (await target.elementHandle())!;
    const point = await target.evaluate(el => {
      const rect = el.getBoundingClientRect(), x = rect.left + (el.hasAttribute("data-canvas-node") ? 30 : rect.width / 2), y = rect.top + (el.hasAttribute("data-canvas-node") ? 18 : rect.height / 2);
      return { x, y, hit: el.contains(document.elementFromPoint(x, y)) };
    });
    expect(point.hit).toBe(true);
    await page.evaluate(() => {
      const events: { type: string; pointerId: number }[] = [];
      Object.assign(window, { boundaryEvents: events });
      for (const type of ["pointerdown", "gotpointercapture", "lostpointercapture", "pointerup"]) document.addEventListener(type, event => events.push({ type, pointerId: (event as PointerEvent).pointerId }), true);
    });
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    if (gesture === "connection") await page.mouse.move(point.x + 30, point.y + 10, { steps: 2 });
    const pointerId = await page.evaluate(() => (window as unknown as { boundaryEvents: { pointerId: number }[] }).boundaryEvents[0]!.pointerId);
    expect(await handle.evaluate((el, id) => el.hasPointerCapture(id), pointerId)).toBe(true);
    const writesBefore = mockApi.canvasWrites?.length ?? 0;
    if (mechanism === "inspector") await label.selectOption("quality");
    if (mechanism === "undo" || mechanism === "redo") {
      await page.locator(".routing-canvas-scroll").focus();
      await page.keyboard.press(mechanism === "undo" ? "ControlOrMeta+z" : "ControlOrMeta+Shift+z");
    }
    if (mechanism === "discard") {
      const cancel = page.locator(".workflow-toolbar").getByRole("button", { name: en.cancel, exact: true });
      await cancel.focus(); await page.keyboard.press("Enter");
    }
    if (mechanism === "hash-refresh") {
      mockApi.appliedConfiguration = { ...catalog, config_hash: "external-current-hash", fallback: { label: "quality" }, questions: { intent: { ...catalog.questions.intent!, instructions: "External current instructions" } } };
      page.once("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: en.refresh, exact: true }).focus(); await page.keyboard.press("Enter");
      await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
      await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeDisabled();
    }
    const expectedLabel = mechanism === "undo" || mechanism === "discard" ? "default" : "quality";
    const expectedSelection = mechanism === "discard" || mechanism === "hash-refresh" ? [] : ["fallback"];
    const captured = await handle.evaluate((el, id) => el.hasPointerCapture(id), pointerId);
    await writeFile(info.outputPath("superseded.json"), JSON.stringify({ gesture, mechanism, captured, expectedLabel, expectedSelection, writesBefore, writes: mockApi.canvasWrites }, null, 2));
    expect.soft(captured, "the superseding command must release native capture").toBe(false);
    await expect.soft(fallback).toContainText(expectedLabel);
    await page.mouse.move(point.x + 60, point.y + 20, { steps: 3 }); await page.mouse.up();
    await expect(page.locator("[data-dragging], .canvas-edge-preview")).toHaveCount(0);
    await expect(fallback).toContainText(expectedLabel);
    expect(await page.locator('[data-canvas-node].selected').evaluateAll(elements => elements.map(el => el.getAttribute("data-canvas-node")))).toEqual(expectedSelection);
    expect(mockApi.canvasLayout?.nodes).toEqual(positions);
    const expectedWrites = mechanism === "undo" || mechanism === "redo" ? writesBefore + 1 : writesBefore;
    await expect.poll(() => mockApi.canvasWrites?.length ?? 0).toBe(expectedWrites);
    expect(mockApi.requests.filter(request => request.method !== "GET" && request.path !== "/v1/dashboard/canvas-layout")).toEqual([]);
    // A fresh explicit edit permits whole-payload validation after the gesture oracle.
    await page.locator('[data-canvas-node="questions"]').focus(); await page.keyboard.press("Enter");
    const expectedInstructions = mechanism === "hash-refresh" ? "External current instructions" : catalog.questions.intent!.instructions;
    await expect(inspector.getByRole("textbox", { name: en.instructions, exact: true })).toHaveValue(expectedInstructions);
    await inspector.getByRole("textbox", { name: en.instructions, exact: true }).fill("Whole draft validation marker");
    await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
    await page.getByRole("button", { name: en.reviewChanges, exact: true }).click();
    await expect(page.getByRole("button", { name: en.confirmAndSave, exact: true })).toBeEnabled();
    const payload = mockApi.allowedWrites[0]!.body;
    expect(payload).toEqual({ version: 1, strategy: catalog.strategy, questions: { intent: { ...catalog.questions.intent!, instructions: "Whole draft validation marker" } }, rules: catalog.rules.map(({ when, select }) => ({ when, select })), fallback: { label: expectedLabel }, models: {} });
    await writeFile(info.outputPath("final-state.json"), JSON.stringify({ payload, requests: mockApi.requests, layout: mockApi.canvasLayout, events: await page.evaluate(() => (window as unknown as { boundaryEvents: object[] }).boundaryEvents) }, null, 2));
    await page.screenshot({ path: info.outputPath("final-state.png") });
  });
}

test("Chinese desktop semantic discard restores draft without a layout write", async ({ page, mockApi }, info) => {
  mockApi.canvasLayout = { version: 1, nodes: structuredClone(positions), viewport: { x: 0, y: 0 } };
  await page.setViewportSize({ width: 1280, height: 900 }); await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.settings, exact: true }).click(); await page.locator("[data-settings-language]").selectOption("zh-CN");
  await page.getByRole("button", { name: zhCN.strategyEditor, exact: true }).click();
  await expect(page.getByRole("button", { name: zhCN.canvasAddNode, exact: true })).toBeEnabled();
  await page.locator('[data-canvas-node="fallback"]').focus(); await page.keyboard.press("Enter");
  await page.getByRole("complementary", { name: zhCN.nodeInspector }).getByRole("combobox", { name: zhCN.label, exact: true }).selectOption("quality");
  await page.getByRole("button", { name: zhCN.closeInspector, exact: true }).click();
  const cancel = page.locator(".workflow-toolbar").getByRole("button", { name: zhCN.cancel, exact: true });
  await expect(cancel).toBeEnabled(); await cancel.focus(); await page.keyboard.press("Enter");
  await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
  await expect(page.getByRole("button", { name: zhCN.canvasUndo, exact: true })).toBeDisabled();
  expect(mockApi.requests.filter(request => request.method !== "GET")).toEqual([]);
  await writeFile(info.outputPath("semantic-discard.json"), JSON.stringify({ requests: mockApi.requests, layout: mockApi.canvasLayout }, null, 2));
});
