import { describe, expect, it } from "vitest";

import { adjacentEvidenceLinks, locateRouteProgress, routeStageState } from "../model/route-trace";

describe("available route segments", () => {
  it("connects only adjacent stages with evidence", () => {
    expect(adjacentEvidenceLinks([true, true, false, true])).toEqual([true, false, false]);
    expect(adjacentEvidenceLinks([true, false, false, false])).toEqual([false, false, false]);
    expect(adjacentEvidenceLinks([false, true, true, true])).toEqual([false, true, true]);
  });

  it("walks later available segments without traversing missing gaps", () => {
    const lengths = [100, 20, 80];
    const available = [true, false, true];
    expect(locateRouteProgress(lengths, available, 0.25)).toEqual({ segmentIndex: 0, segmentProgress: 0.45 });
    expect(locateRouteProgress(lengths, available, 0.5)).toEqual({ segmentIndex: 0, segmentProgress: 0.9 });
    expect(locateRouteProgress(lengths, available, 0.75)).toEqual({ segmentIndex: 2, segmentProgress: 0.4375 });
    expect(locateRouteProgress(lengths, available, 1)).toEqual({ segmentIndex: 2, segmentProgress: 1 });
  });

  it("continues across only available links while leaving gaps to be explained statically", () => {
    const links = adjacentEvidenceLinks([true, false, true, true]);
    const position = locateRouteProgress([70, 40, 90], links, 0.5);
    expect(position?.segmentIndex).toBe(2);
    expect(position?.segmentProgress).toBeCloseTo(0.5);
    expect(links[0]).toBe(false);
    expect(links[1]).toBe(false);
    expect(links[2]).toBe(true);
  });

  it("highlights and visits recorded stages without marking missing stages", () => {
    expect(routeStageState([true, false, true, true], 0)).toEqual({ activeIndex: 0, visited: [] });
    expect(routeStageState([true, false, true, true], 0.25)).toEqual({ activeIndex: 0, visited: [] });
    expect(routeStageState([true, false, true, true], 0.5)).toEqual({ activeIndex: 2, visited: [0] });
    expect(routeStageState([true, false, true, true], 0.75)).toEqual({ activeIndex: 3, visited: [0, 2] });
    expect(routeStageState([true, false, true, true], 1)).toEqual({ activeIndex: null, visited: [0, 2, 3] });
    expect(routeStageState([true, false, false, false], 0.5)).toEqual({ activeIndex: 0, visited: [] });
  });

  it("returns no position when no complete evidence link exists", () => {
    expect(locateRouteProgress([100, 50], [false, false], 0.5)).toBeNull();
    expect(locateRouteProgress([0, Number.NaN], [true, true], 0.5)).toBeNull();
  });

  it("clamps progress to the valid route range", () => {
    expect(locateRouteProgress([100], [true], -2)).toEqual({ segmentIndex: 0, segmentProgress: 0 });
    expect(locateRouteProgress([100], [true], 3)).toEqual({ segmentIndex: 0, segmentProgress: 1 });
  });
});
