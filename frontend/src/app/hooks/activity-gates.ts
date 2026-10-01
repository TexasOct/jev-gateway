export const ACTIVITY_REQUEST_TIMEOUT_MS = 10_000;

/** A sample expires ten seconds after dispatch, including time spent in flight. */
export function activityFreshFor(dispatchedAt: number, now: number): number {
  return ACTIVITY_REQUEST_TIMEOUT_MS - (now - dispatchedAt);
}

export function mayReadActivity(visibility: DocumentVisibilityState, active: boolean, needsKey: boolean): boolean {
  return visibility === "visible" && active && !needsKey;
}
