import { writeFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";

const layout = (nodes: Record<string, { x: number; y: number }>) => ({ version: 1 as const, nodes, viewport: { x: 0, y: 0 } });
const positions: Record<string, { x: number; y: number }> = { "rule-0": { x: 350, y: 80 }, "rule-1": { x: 650, y: 80 }, "rule-2": { x: 950, y: 80 }, fallback: { x: 950, y: 300 }, questions: { x: 50, y: 80 } };

// Find a point that actually hit-tests to the node, avoiding the fixed chrome
// and port handles that overlay the card surface.
async function nodePoint(page: import("@playwright/test").Page, id: string) {
  const target = page.locator(`[data-canvas-node="${id}"]`);
  await target.scrollIntoViewIfNeeded();
  const point = await target.evaluate((el) => {
    const b = el.getBoundingClientRect();
    for (const y of [b.top + 18, b.top + b.height / 2, b.bottom - 8]) for (const x of [b.left + 30, b.left + b.width / 2, b.right - 30]) {
      if (el.contains(document.elementFromPoint(x, y))) return { x, y, hit: true };
    }
    return { x: b.left + 30, y: b.top + 18, hit: false };
  });
  expect(point.hit).toBe(true);
  return point;
}

async function duplicateBodies() {
  const catalog = structuredClone(configuration);
  catalog.rules = [0, 1, 2].map((index) => ({ index, when: { intent: "default" }, select: { label: "default" } }));
  return catalog;
}

// C07: ordered rule removal across first/middle/final and identical bodies.
// Each surface must remap successor slots, leave no stale selection or layout
// reference, and undo the exact draft, layout and selection together.
for (const surface of ["menu", "delete", "backspace"] as const) for (const slot of ["first", "middle", "final"] as const) {
  test(`rule ${slot} removed by ${surface} remaps ordered slots and undoes as one checkpoint`, async ({ page, mockApi }, info) => {
    mockApi.appliedConfiguration = await duplicateBodies();
    mockApi.canvasLayout = layout({ ...positions });
    const original = structuredClone(positions);
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/dashboard/");
    await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
    const index = slot === "first" ? 0 : slot === "middle" ? 1 : 2;
    const target = page.locator(`[data-canvas-node="rule-${index}"]`);
    const canvas = page.locator(".routing-canvas-scroll");
    if (surface === "menu") {
      const at = await nodePoint(page, `rule-${index}`);
      await page.mouse.click(at.x, at.y, { button: "right" });
      const menu = page.getByRole("menu", { name: en.canvasActions });
      await menu.getByRole("menuitem", { name: en.remove, exact: true }).click();
    } else {
      await canvas.focus();
      await target.focus();
      await page.keyboard.press(surface === "delete" ? "Delete" : "Backspace");
    }
    // Successor rules shift up into the removed ordered slot; the trailing slot disappears.
    await expect(page.locator('[data-canvas-node="rule-2"]')).toHaveCount(0);
    // Survivors keep their ordered bodies and take the next ordered slot.
    const survivors = [0, 1, 2].filter((entry) => entry !== index);
    const expectedRules = Object.fromEntries(survivors.map((source, position) => [`rule-${position}`, original[`rule-${source}`]!]));
    await expect.poll(() => Object.fromEntries(Object.entries(mockApi.canvasLayout!.nodes).filter(([id]) => id.startsWith("rule-")))).toEqual(expectedRules);
    // The removed slot leaves no stale layout entry or inspector selection.
    expect(Object.keys(mockApi.canvasLayout!.nodes).filter((id) => id.startsWith("rule-"))).toHaveLength(2);
    await expect(page.locator('[data-canvas-node].selected')).toHaveCount(0);
    // Undo restores the original ordered draft, layout and selection as one step.
    await canvas.focus(); await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeDisabled();
    await expect.poll(() => mockApi.canvasLayout!.nodes).toEqual(original);
    for (const id of ["rule-0", "rule-1", "rule-2"]) await expect(page.locator(`[data-canvas-node="${id}"]`)).toBeVisible();
    await expect(page.locator('[data-canvas-node="rule-0"]')).toContainText("intent=default");
    await expect(page.locator('.workspace-heading [data-policy-draft]')).toHaveAttribute("data-policy-draft", "unchanged");
    await writeFile(info.outputPath("rule-removal.json"), JSON.stringify({ surface, slot, expectedRules, layout: mockApi.canvasLayout, original }, null, 2));
    await page.screenshot({ path: info.outputPath("rule-removal-undone.png") });
  });
}

// C10: native Delete/Backspace inside text, number, textarea and select controls
// keep their editing behaviour and leave graph state and canvas history intact.
test("editing text, number, textarea and select controls never deletes graph objects or canvas history", async ({ page, mockApi }, info) => {
  mockApi.appliedConfiguration = structuredClone(configuration);
  mockApi.canvasLayout = layout({ ...positions, "model::fixture-provider/fixture-model": { x: 1250, y: 80 } });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(page.locator('[data-canvas-node="questions"]')).toBeVisible();
  const canvas = page.locator(".routing-canvas-scroll");
  const nodeCount = await page.locator("[data-canvas-node]").count();
  const layoutBefore = structuredClone(mockApi.canvasLayout);
  // A layout movement creates real combined history before the text edits.
  const questions = page.locator('[data-canvas-node="questions"]');
  await questions.focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => mockApi.canvasLayout!.nodes.questions?.x).toBe(70);
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeEnabled();
  const movedLayout = structuredClone(mockApi.canvasLayout);

  // textarea (question instructions)
  const questionsPoint = await nodePoint(page, "questions"); await page.mouse.click(questionsPoint.x, questionsPoint.y);
  const inspector = page.getByRole("complementary", { name: en.nodeInspector });
  const instructions = inspector.getByRole("textbox", { name: en.instructions, exact: true });
  await instructions.focus();
  await instructions.evaluate((el) => { const input = el as HTMLTextAreaElement; input.setSelectionRange(input.value.length, input.value.length); });
  await page.keyboard.type("XY"); await page.keyboard.press("Backspace");
  await expect(instructions).toHaveValue(`${configuration.questions.intent!.instructions}XY`.slice(0, -1));
  await expect(page.locator("[data-canvas-node]")).toHaveCount(nodeCount);
  // text undo/redo stays inside the control and does not touch canvas history.
  await instructions.press("ControlOrMeta+z");
  await expect(instructions).toHaveValue(`${configuration.questions.intent!.instructions}XY`);
  await instructions.press("ControlOrMeta+Shift+z");
  await expect(instructions).toHaveValue(`${configuration.questions.intent!.instructions}X`);
  await expect(page.getByRole("button", { name: en.canvasUndo, exact: true })).toBeEnabled();
  await expect.poll(() => mockApi.canvasLayout!.nodes).toEqual(movedLayout.nodes);

  // select (fallback label) — Delete/Backspace must not remove the focused node.
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  const fallback = page.locator('[data-canvas-node="fallback"]');
  const fallbackPoint = await nodePoint(page, "fallback");
  await page.mouse.click(fallbackPoint.x, fallbackPoint.y);
  const label = page.getByRole("complementary", { name: en.nodeInspector }).getByRole("combobox", { name: en.label, exact: true });
  await label.focus(); await page.keyboard.press("Backspace"); await page.keyboard.press("Delete");
  await expect(fallback).toHaveCount(1);
  await expect(label).toHaveValue(configuration.fallback.label ?? "");
  await expect(page.locator("[data-canvas-node]")).toHaveCount(nodeCount);
  expect(mockApi.canvasLayout!.nodes.fallback).toEqual(positions.fallback);
  // Returning focus to a removable graph object restores the supported key action.
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  await page.locator('[data-canvas-node="rule-0"]').focus();
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-canvas-node="rule-0"]')).toHaveCount(0);
  await canvas.focus(); await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator('[data-canvas-node="rule-0"]')).toHaveCount(1);
  await expect.poll(() => mockApi.canvasLayout!.nodes["rule-0"]).toEqual(movedLayout.nodes["rule-0"]);

  // number (model priority) — native Delete cannot reach the delete handler.
  await page.getByRole("button", { name: en.closeInspector, exact: true }).click();
  const modelNode = page.locator('[data-canvas-node="model::fixture-provider/fixture-model"]');
  const modelPoint = await nodePoint(page, "model::fixture-provider/fixture-model"); await page.mouse.click(modelPoint.x, modelPoint.y);
  const priority = page.getByRole("complementary", { name: en.nodeInspector }).getByRole("spinbutton", { name: en.priority, exact: true });
  await priority.focus(); await page.keyboard.press("Delete"); await page.keyboard.press("Backspace");
  await expect(modelNode).toHaveCount(1);
  await expect(page.locator("[data-canvas-node]")).toHaveCount(nodeCount);
  // No key press inside a control changed the layout or canvas history.
  await expect.poll(() => mockApi.canvasLayout!.nodes).toEqual(movedLayout.nodes);
  await writeFile(info.outputPath("text-guard.json"), JSON.stringify({ nodeCount, layoutBefore, movedLayout, layout: mockApi.canvasLayout }, null, 2));
  await page.screenshot({ path: info.outputPath("text-guard.png") });
});

// C12: a divergent edit after undo clears the redo stack, and a completed drag
// commits exactly one logical movement with no per-frame history entries.
test("divergent edit clears redo and a completed drag commits one logical movement", async ({ page, mockApi }, info) => {
  mockApi.appliedConfiguration = structuredClone(configuration);
  mockApi.canvasLayout = layout({ ...positions });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  const canvas = page.locator(".routing-canvas-scroll");
  const rule = page.locator('[data-canvas-node="rule-0"]');
  const undo = page.getByRole("button", { name: en.canvasUndo, exact: true });
  const redo = page.getByRole("button", { name: en.canvasRedo, exact: true });

  // One completed pointer drag is one logical movement, not one entry per frame.
  const bounds = await rule.boundingBox(); if (!bounds) throw new Error("Rule has no bounds");
  const start = { x: bounds.x + 30, y: bounds.y + 18 };
  expect(await page.evaluate((at) => document.elementFromPoint(at.x, at.y)?.closest("[data-canvas-node]")?.getAttribute("data-canvas-node"), start)).toBe("rule-0");
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 30, { steps: 8 });
  await page.mouse.move(start.x + 80, start.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => mockApi.canvasLayout!.nodes["rule-0"]).toEqual({ x: positions["rule-0"]!.x + 80, y: positions["rule-0"]!.y + 60 });
  const dragged = structuredClone(mockApi.canvasLayout!.nodes["rule-0"]);
  // A single undo returns the whole drag in one step.
  await canvas.focus(); await undo.click();
  await expect.poll(() => mockApi.canvasLayout!.nodes["rule-0"]).toEqual(positions["rule-0"]);
  await expect(undo).toBeDisabled();
  await redo.click();
  await expect.poll(() => mockApi.canvasLayout!.nodes["rule-0"]).toEqual(dragged);

  // A divergent edit performed after an undo clears the redo stack.
  await undo.click();
  await expect.poll(() => mockApi.canvasLayout!.nodes["rule-0"]).toEqual(positions["rule-0"]);
  await expect(redo).toBeEnabled();
  await rule.focus(); await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => mockApi.canvasLayout!.nodes["rule-0"]).toEqual({ x: positions["rule-0"]!.x, y: positions["rule-0"]!.y + 20 });
  await expect(redo).toBeDisabled();
  // Undo again restores the pre-divergence position; no nonexistent selection is revived.
  await canvas.focus(); await undo.click();
  await expect.poll(() => mockApi.canvasLayout!.nodes["rule-0"]).toEqual(positions["rule-0"]);
  await expect(page.locator('[data-canvas-node].selected')).toHaveCount(0);
  await writeFile(info.outputPath("history-divergence.json"), JSON.stringify({ dragged, layout: mockApi.canvasLayout, redoDisabled: await redo.isDisabled() }, null, 2));
  await page.screenshot({ path: info.outputPath("history-divergence.png") });
});
