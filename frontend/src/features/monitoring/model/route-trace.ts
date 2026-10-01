export function adjacentEvidenceLinks(availability: readonly boolean[]): boolean[] {
  return availability.slice(0, -1).map((available, index) => available && availability[index + 1] === true);
}

export interface RoutePosition {
  segmentIndex: number;
  segmentProgress: number;
}

export interface RouteStageState {
  activeIndex: number | null;
  visited: number[];
}

export function locateRouteProgress(
  lengths: readonly number[],
  available: readonly boolean[],
  progress: number,
): RoutePosition | null {
  const segments = lengths
    .map((length, index) => ({ index, length }))
    .filter(({ index, length }) => available[index] === true && Number.isFinite(length) && length > 0);
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (totalLength === 0) return null;

  const target = Math.max(0, Math.min(progress, 1)) * totalLength;
  let traversed = 0;
  for (const [order, segment] of segments.entries()) {
    if (target < traversed + segment.length || order === segments.length - 1) {
      return {
        segmentIndex: segment.index,
        segmentProgress: Math.max(0, Math.min((target - traversed) / segment.length, 1)),
      };
    }
    traversed += segment.length;
  }
  return null;
}

export function routeStageState(availability: readonly boolean[], progress: number): RouteStageState {
  const sequence = availability.flatMap((available, index) => available ? [index] : []);
  if (sequence.length === 0) return { activeIndex: null, visited: [] };

  const normalized = Math.max(0, Math.min(progress, 1));
  const stagePosition = Math.min(Math.floor(normalized * sequence.length), sequence.length - 1);
  return {
    activeIndex: normalized < 1 ? (sequence[stagePosition] ?? null) : null,
    visited: normalized >= 1 ? sequence : sequence.slice(0, stagePosition),
  };
}
