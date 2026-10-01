import { describe, expect, it } from "vitest";
import { activityFreshFor, mayReadActivity } from "./activity-gates";

describe("routing activity gates", () => {
  it("only permits visible monitoring reads without a credential prompt", () => {
    expect(mayReadActivity("visible", true, false)).toBe(true);
    expect(mayReadActivity("hidden", true, false)).toBe(false);
    expect(mayReadActivity("visible", false, false)).toBe(false);
    expect(mayReadActivity("visible", true, true)).toBe(false);
  });

  it("uses dispatch time rather than response time for sample freshness", () => {
    expect(activityFreshFor(100, 100)).toBe(10_000);
    expect(activityFreshFor(100, 4_100)).toBe(6_000);
    expect(activityFreshFor(100, 10_100)).toBe(0);
  });
});
