import { describe, expect, it } from "vitest";
import type { CanvasLayout } from "@/shared/api/types";
import { crossedDragThreshold, dragDisplacement, draggedLayout } from "../model/canvas";

const layout: CanvasLayout = {
  version: 1,
  nodes: { a: { x: 20, y: 20 }, b: { x: 240, y: 20 }, "model::p/a": { x: 700, y: 400 } },
  viewport: { x: 80, y: 120 },
};

describe("native node drag calculations", () => {
  it("distinguishes a click from pointer movement beyond four CSS pixels", () => {
    expect(crossedDragThreshold({ x: 10, y: 10 }, { x: 13, y: 10 })).toBe(false);
    expect(crossedDragThreshold({ x: 10, y: 10 }, { x: 14, y: 10 })).toBe(false);
    expect(crossedDragThreshold({ x: 10, y: 10 }, { x: 14, y: 11 })).toBe(true);
  });

  it("converts CSS displacement through the captured zoom", () => {
    expect(dragDisplacement({ x: 100, y: 80 }, { x: 140, y: 100 }, 2)).toEqual({ x: 20, y: 10 });
    expect(dragDisplacement({ x: 100, y: 80 }, { x: 140, y: 100 }, 0.5)).toEqual({ x: 80, y: 40 });
  });

  it("previews multi-node movement from its initial layout while retaining offsets and unrelated data", () => {
    const starts = { a: { x: 20, y: 20 }, b: { x: 240, y: 20 } };
    const first = draggedLayout(layout, starts, { x: 20, y: 10 }, 1000, 800);
    expect(first.changed).toBe(true);
    expect(first.layout.nodes).toEqual({ a: { x: 40, y: 30 }, b: { x: 260, y: 30 }, "model::p/a": { x: 700, y: 400 } });
    const second = draggedLayout(layout, starts, { x: 30, y: 15 }, 1000, 800);
    expect(second.layout.nodes.a).toEqual({ x: 50, y: 35 });
    expect(second.layout.nodes.b).toEqual({ x: 270, y: 35 });
    expect(second.layout.viewport).toEqual(layout.viewport);
    expect(layout.nodes.a).toEqual({ x: 20, y: 20 });
  });

  it("reports no movement at the clamped origin so a gesture does not need a layout write", () => {
    const starts = { a: { x: 0, y: 0 }, b: { x: 220, y: 0 } };
    expect(draggedLayout(layout, starts, { x: -40, y: -40 }, 1000, 800)).toEqual({ layout, changed: false });
  });
});
