import { expect, test } from "@playwright/test";
import { canvasNodeCenterHit } from "./canvas-hit";

const canvas = `<main style="position:relative;height:600px;--canvas-origin-y:0px">
  <section style="position:absolute;left:0;top:var(--canvas-origin-y)">
    <button data-canvas-node="questions" style="position:absolute;left:50px;top:80px;width:190px;height:140px">Questions</button>
  </section>
</main>`;

test("canvas center sampling follows a node after the measured origin changes", async ({ page }) => {
  await page.setContent(canvas);
  const node = page.locator('[data-canvas-node="questions"]');
  const before = await node.boundingBox();
  if (!before) throw new Error("Questions node has no measurable bounds");
  await page.locator("main").evaluate((element) => element.style.setProperty("--canvas-origin-y", "98.71875px"));
  const staleHit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)
    ?.closest("[data-canvas-node]")?.getAttribute("data-canvas-node") ?? null, {
    x: before.x + before.width / 2, y: before.y + before.height / 2,
  });
  expect(staleHit).toBeNull();
  const current = await canvasNodeCenterHit(node);
  expect(current.hit).toBe("questions");
  expect(current.box?.y).toBeCloseTo(before.y + 98.71875, 4);
  expect(current.box?.width).toBe(190);
  expect(current.box?.height).toBe(140);
});

test("canvas center sampling still rejects a node covered by an overlay", async ({ page }) => {
  await page.setContent(canvas);
  await page.locator("main").evaluate((element) => {
    const overlay = element.ownerDocument.createElement("div");
    overlay.style.cssText = "position:absolute;left:50px;top:80px;width:190px;height:140px;z-index:2";
    element.append(overlay);
  });
  const current = await canvasNodeCenterHit(page.locator('[data-canvas-node="questions"]'));
  expect(current.box).not.toBeNull();
  expect(current.hit).toBeNull();
});
