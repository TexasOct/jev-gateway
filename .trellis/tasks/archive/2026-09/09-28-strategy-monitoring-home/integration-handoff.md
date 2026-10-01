# Shared shell integration handoff

Current task `.trellis/tasks/09-28-strategy-monitoring-home` is implementing the monitoring activity UI. The shell child `.trellis/tasks/archive/2026-10/09-28-dashboard-shell-visual-system` owns `frontend/src/App.tsx`, `frontend/src/api.ts`, and `frontend/src/i18n.tsx` integration, per its design/implementation plan. These are shared dirty files, so monitoring must not edit them in parallel.

## Required integration

1. Add typed `RoutingActivityPath` / `RoutingActivityPayload` and `api.routingActivity(signal?)` for `GET /v1/routing/activity` in `frontend/src/api.ts`.
2. In `App.tsx`, own `routingActivity`/error/sample state, non-overlapping 3-second activity-only polling while monitoring is visible and authenticated, 10-second request timeout/staleness, abort/generation guards, hidden-tab/navigation/auth handling, monotonic remaining-window adjustment, instance-change handling and activity-only retry callback. This must not call the full session/provider refresh or reset detail/list state.
3. Pass `activity`, `activityError`, explicit-instance-reset signal if needed, and `onRetryActivity` to `MonitoringView`.
4. Add any shared translation catalog entries to `i18n.tsx` only if monitoring uses its typed translator contract; otherwise keep monitoring-specific copy in the view's local `copy(en, zh)` helper to avoid extra shared file edits.
5. Coordinate handoff back to the monitoring child before running the final full frontend verification. Do not edit monitoring view/CSS in parallel with the shell owner's shared integration.

Monitoring implementation is currently in progress. Backend endpoint and initial isolated monitoring-view work already exist in this worktree. Please confirm ownership before touching these files, then report completion so monitoring can finish the dependent UI wiring and verify end to end.
