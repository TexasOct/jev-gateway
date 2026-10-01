import { describe, expect, it } from "vitest";
import { appendUnique, windowRange } from "../model/pagination";

describe("monitoring pages", () => {
  it("deduplicates overlapping pages using stable identities", () => {
    expect(appendUnique([{ id: "a" }], [{ id: "a" }, { id: "b" }], (item) => item.id))
      .toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("mounts a bounded range as the fixed-height list scrolls", () => {
    expect(windowRange(1000, 0, 400, 100)).toEqual({ start: 0, end: 7 });
    expect(windowRange(1000, 5000, 400, 100)).toEqual({ start: 47, end: 57 });
  });
});
