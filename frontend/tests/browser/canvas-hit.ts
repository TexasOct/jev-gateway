import type { Locator } from "@playwright/test";

type CanvasCenterHit = {
  box: { x: number; y: number; width: number; height: number } | null;
  hit: string | null;
};

export async function canvasNodeCenterHit(node: Locator): Promise<CanvasCenterHit> {
  // Chrome measurement can move nodes between separate awaited browser reads.
  return node.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    if (!element.getClientRects().length || !bounds.width || !bounds.height) {
      return { box: null, hit: null };
    }
    const box = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    const hit = element.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      ?.closest("[data-canvas-node]")?.getAttribute("data-canvas-node") ?? null;
    return { box, hit };
  });
}
