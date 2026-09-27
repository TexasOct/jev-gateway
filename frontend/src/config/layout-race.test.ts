import { describe, expect, it, vi } from "vitest";
import type { CanvasLayout } from "../api";
import { createLayoutWriteQueue, dragDisplacement, draggedLayout, nodeDragScrollLock, reconcileLayoutWrite } from "./canvas";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

const layout = (x: number): CanvasLayout => ({
  version: 1, nodes: { questions: { x, y: 120 }, "rule-0": { x: 440, y: 110 } }, viewport: { x: 200, y: 100 },
});

describe("layout write reconciliation", () => {
  it("rolls back the generation even when a newer revision was queued", () => {
    const current = { generation: 2, revision: 5 };
    expect(reconcileLayoutWrite(current, { generation: 2, revision: 4 }, "failed")).toBe("rollback");
    expect(reconcileLayoutWrite(current, { generation: 2, revision: 4 }, "saved")).toBe("saved");
    expect(reconcileLayoutWrite(current, current, "saved")).toBe("latest");
    for (const outcome of ["saved", "failed"] as const) {
      expect(reconcileLayoutWrite(current, { generation: 1, revision: 5 }, outcome)).toBe("ignore");
    }
  });

  it("finishes rollback before a fresh retry and drops every queued failed-generation preview", async () => {
    const first = deferred(), retry = deferred();
    const events: string[] = [];
    const write = vi.fn((next: CanvasLayout) => {
      events.push(`write:${next.nodes.questions!.x}`);
      return write.mock.calls.length === 1 ? first.promise : retry.promise;
    });
    const queue = createLayoutWriteQueue(write);
    const saved = vi.fn();
    let retryDone: Promise<void> | undefined;
    const error = new Error("layout save failed");
    const failed = vi.fn((reason: unknown) => {
      expect(reason).toBe(error);
      expect(queue.pending).toBe(false);
      events.push("rollback");
      // A retry may be requested from rollback before the abandoned queue drains.
      retryDone = queue.enqueue(layout(160), saved, vi.fn());
    });
    const firstDone = queue.enqueue(layout(140), saved, failed);
    const abandonedA = queue.enqueue(layout(150), saved, failed);
    const abandonedB = queue.enqueue(layout(155), saved, failed);
    await Promise.resolve();
    expect(queue.pending).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    first.reject(error);
    await firstDone;
    await abandonedA;
    await abandonedB;
    await Promise.resolve();
    expect(events).toEqual(["write:140", "rollback", "write:160"]);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
    expect(queue.pending).toBe(true);
    retry.resolve();
    await retryDone;
    expect(saved).toHaveBeenCalledExactlyOnceWith(layout(160), true);
    expect(queue.pending).toBe(false);
  });

  it("updates the rollback checkpoint after each serialized success", async () => {
    const first = deferred(), second = deferred();
    const write = vi.fn(() => write.mock.calls.length === 1 ? first.promise : second.promise);
    const queue = createLayoutWriteQueue(write);
    let checkpoint = layout(110);
    const saved = vi.fn((next: CanvasLayout) => { checkpoint = next; });
    const failed = vi.fn();
    const firstDone = queue.enqueue(layout(140), saved, failed);
    const secondDone = queue.enqueue(layout(150), saved, failed);
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    first.resolve();
    await firstDone;
    expect(saved).toHaveBeenCalledWith(layout(140), false);
    expect(checkpoint).toEqual(layout(140));
    second.reject(new Error("second PUT failed"));
    await secondDone;
    expect(failed).toHaveBeenCalledTimes(1);
    expect(checkpoint).toEqual(layout(140));
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it.each(["saved", "failed"] as const)("ignores a stale %s completion without discarding the latest retry", async (outcome) => {
    const stale = deferred(), retry = deferred();
    const write = vi.fn(() => write.mock.calls.length === 1 ? stale.promise : retry.promise);
    const queue = createLayoutWriteQueue(write);
    const saved = vi.fn(), failed = vi.fn();
    const staleDone = queue.enqueue(layout(140), saved, failed);
    const abandoned = queue.enqueue(layout(150), saved, failed);
    await Promise.resolve();
    queue.invalidate();
    const retryDone = queue.enqueue(layout(170), saved, failed);
    if (outcome === "saved") stale.resolve();
    else stale.reject(new Error("stale failure"));
    await staleDone;
    await abandoned;
    await Promise.resolve();
    expect(saved).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    expect(write.mock.calls).toEqual([[layout(140)], [layout(170)]]);
    expect(queue.pending).toBe(true);
    retry.resolve();
    await retryDone;
    expect(saved).toHaveBeenCalledExactlyOnceWith(layout(170), true);
    expect(queue.pending).toBe(false);
  });
});

describe("node drag scroll lock", () => {
  it.each([0.5, 0.75, 1, 1.75])("keeps pointer deltas independent of wheel/programmatic scrolling at %sx", (zoom) => {
    const scroll = { x: 200, y: 100 };
    const drag = { moved: true, scroll };
    const restored = nodeDragScrollLock(drag, { x: 300, y: 240 }, null);
    expect(restored).toBe(scroll);
    expect(nodeDragScrollLock(drag, scroll, restored)).toBe(scroll);
    const start = layout(110);
    const positions = start.nodes;
    const delta = dragDisplacement({ x: 100, y: 80 }, { x: 100 + 35 * zoom, y: 80 + 20 * zoom }, zoom);
    const preview = draggedLayout(start, positions, delta, 3200, 2200);
    expect(preview.layout.nodes).toEqual({ questions: { x: 145, y: 140 }, "rule-0": { x: 475, y: 130 } });
    expect(preview.layout.viewport).toEqual(scroll);
    expect(start).toEqual(layout(110));
  });

  it("suppresses a trailing corrected-scroll event after cancel/up but allows the next real scroll", () => {
    const scroll = { x: 200, y: 100 };
    const lock = nodeDragScrollLock({ moved: true, scroll }, { x: 300, y: 100 }, null);
    expect(nodeDragScrollLock(null, scroll, lock)).toBe(scroll);
    expect(nodeDragScrollLock(null, { x: 201, y: 100 }, lock)).toBeNull();
    expect(nodeDragScrollLock(null, { x: 200, y: 101 }, lock)).toBeNull();
    expect(nodeDragScrollLock({ moved: false, scroll }, { x: 201, y: 100 }, null)).toBeNull();
    expect(nodeDragScrollLock(null, scroll, null)).toBeNull();
  });
});
