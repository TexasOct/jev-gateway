import type { RoutePosition, RouteStageState } from "./route-trace";

/** Stage emphasis follows the same weighted, available edge as the packet. */
export function playbackStages(
  availability: readonly boolean[],
  position: RoutePosition | null,
  state: "ready" | "playing" | "paused" | "completed",
): RouteStageState {
  const present = availability.flatMap((available, index) => available ? [index] : []);
  if (state === "ready") return { activeIndex: null, visited: [] };
  if (state === "completed") return { activeIndex: null, visited: present };
  if (position === null) return { activeIndex: present[0] ?? null, visited: [] };
  const reached = position.segmentIndex + (position.segmentProgress === 1 ? 1 : 0);
  return {
    activeIndex: availability[reached] ? reached : null,
    visited: present.filter((index) => index <= reached),
  };
}
