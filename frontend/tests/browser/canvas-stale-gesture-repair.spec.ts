import { writeFile } from "node:fs/promises";
import { test, expect } from "./fixtures";
import { configuration } from "../fixtures/configuration";
import { en } from "../../src/shared/i18n/en";

test("held native node gesture cannot move a replacement rule after inspector deletion", async ({ page, mockApi }, info) => {
  const catalog = structuredClone(configuration);
  catalog.questions.intent!.criteria.third = "Third route";
  catalog.rules = ["default", "other", "third"].map((criterion, index) => ({ index, when: { intent: criterion }, select: { label: index === 1 ? "quality" : "default" } }));
  mockApi.appliedConfiguration = catalog;
  const positions = { "rule-0": { x: 350, y: 80 }, "rule-1": { x: 700, y: 300 }, "rule-2": { x: 1000, y: 80 } };
  mockApi.canvasLayout = { version: 1, viewport: { x: 0, y: 0 }, nodes: positions };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard/");
  await page.getByRole("button", { name: en.strategyEditor, exact: true }).click();
  await expect(page.getByRole("button", { name: en.canvasAddNode, exact: true })).toBeEnabled();
  const first = page.locator('[data-canvas-node="rule-0"]');
  await first.focus(); await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", { name: en.nodeInspector });
  await expect(inspector).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const point = await first.evaluate(el => {
    const rect = el.getBoundingClientRect(), x = rect.left + 30, y = rect.top + 18;
    return { x, y, hit: el.contains(document.elementFromPoint(x, y)) };
  });
  expect(point.hit).toBe(true);
  await page.evaluate(() => {
    const observations: object[] = [];
    Object.assign(window, { staleGestureEvents: observations });
    for (const type of ["pointerdown", "gotpointercapture", "lostpointercapture", "pointerup"]) document.addEventListener(type, event => {
      const pointer = event as PointerEvent;
      observations.push({ type, pointerId: pointer.pointerId, target: (event.target as Element).closest("[data-canvas-node]")?.getAttribute("data-canvas-node") });
    }, true);
  });
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await inspector.getByRole("button", { name: en.deleteRule, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-canvas-node="rule-2"]')).toHaveCount(0);
  await expect(first).toContainText("intent=other");
  const remapped = { "rule-0": positions["rule-1"], "rule-1": positions["rule-2"] };
  await expect.poll(() => mockApi.canvasLayout?.nodes).toEqual(remapped);
  const capture = await first.evaluate(el => {
    const events = (window as unknown as { staleGestureEvents: { type: string; pointerId: number }[] }).staleGestureEvents;
    const pointerId = events.find(event => event.type === "pointerdown")!.pointerId;
    return { pointerId, captured: el.hasPointerCapture(pointerId) };
  });
  expect.soft(capture.captured, "semantic replacement must release the old native capture").toBe(false);
  await expect(page.locator('[data-canvas-node].selected')).toHaveAttribute("data-canvas-node", "questions");
  const writes = mockApi.canvasWrites?.length ?? 0;
  await page.mouse.move(point.x + 60, point.y + 30, { steps: 3 }); await page.mouse.up();
  const evidence = await page.evaluate(() => (window as unknown as { staleGestureEvents: object[] }).staleGestureEvents);
  await writeFile(info.outputPath("native-event-order.json"), JSON.stringify({ events: evidence, capture, writes: mockApi.canvasWrites, expected: remapped }, null, 2));
  await page.screenshot({ path: info.outputPath("replacement-rule.png") });
  await expect(page.locator("[data-dragging]")).toHaveCount(0);
  await expect.poll(() => mockApi.canvasLayout?.nodes).toEqual(remapped);
  expect(mockApi.canvasWrites?.length ?? 0).toBe(writes);
  await page.locator(".routing-canvas-scroll").focus(); await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator('[data-canvas-node="rule-2"]')).toHaveCount(1);
  await expect(first).toContainText("intent=default");
  await expect.poll(() => mockApi.canvasLayout?.nodes).toEqual(positions);
  await expect(first).toHaveClass(/selected/);
  expect(mockApi.requests.filter(request => request.method !== "GET" && request.path !== "/v1/dashboard/canvas-layout")).toEqual([]);
});
