import { describe, expect, it } from "vitest";

import { playbackStages } from "./route-playback";
import { adjacentEvidenceLinks, locateRouteProgress } from "./route-trace";

describe("packet and stage synchronization", () => {
  it("reaches stages according to edge lengths, not equally spaced stage timers", () => {
    const available = [true, true, true, true];
    const position = locateRouteProgress([20, 200, 20], adjacentEvidenceLinks(available), 0.75);
    expect(position?.segmentIndex).toBe(1);
    expect(playbackStages(available, position, "playing")).toEqual({ activeIndex: 1, visited: [0, 1] });
    expect(playbackStages(available, position, "paused")).toEqual(playbackStages(available, position, "playing"));
  });

  it("never puts the packet or reached markers on missing evidence in any combination", () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const availability = Array.from({ length: 4 }, (_, index) => Boolean(mask & (1 << index)));
      const links = adjacentEvidenceLinks(availability);
      let previousSegment = -1;
      for (let step = 0; step <= 100; step += 1) {
        const position = locateRouteProgress([50, 120, 80], links, step / 100);
        if (position) {
          expect(links[position.segmentIndex]).toBe(true);
          expect(position.segmentIndex).toBeGreaterThanOrEqual(previousSegment);
          previousSegment = position.segmentIndex;
        }
        const stages = playbackStages(availability, position, "playing");
        expect(stages.visited.every((index) => availability[index])).toBe(true);
        if (stages.activeIndex !== null) expect(availability[stages.activeIndex]).toBe(true);
      }
      expect(playbackStages(availability, null, "completed").visited).toEqual(
        availability.flatMap((present, index) => present ? [index] : []),
      );
    }
  });

  it("starts later available edges directly and keeps reset completely unmarked", () => {
    const availability = [true, false, true, true];
    const position = locateRouteProgress([100, 100, 100], adjacentEvidenceLinks(availability), 0);
    expect(position).toEqual({ segmentIndex: 2, segmentProgress: 0 });
    expect(playbackStages(availability, position, "playing")).toEqual({ activeIndex: 2, visited: [0, 2] });
    expect(playbackStages(availability, position, "ready")).toEqual({ activeIndex: null, visited: [] });
  });
});
