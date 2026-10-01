# Strategy-first monitoring home

## Goal

Make strategy-level routing results the main monitoring view. Show current session distribution and Magpie-style model connections that animate while requests to those paths are in progress. Keep session/request evidence accessible as secondary detail.

## Background and confirmed scope

This child belongs to `09-28-dashboard-visual-overhaul`. The user approved extending scope with read-only backend activity monitoring and chose animation on individual model connections, leaving inactive connections still. The supplied visual reference is saved as `research/magpie-route-reference.png`. Existing session rows represent TTL-retained in-memory sessions, not necessarily requests currently executing. Session distribution and path activity therefore have different meanings.

## Requirements

- R1. List every registered strategy, including strategies with no current sessions. Show current session counts by latest known strategy and selected model. Read every cursor page, deduplicate stable session IDs and distinguish unknown attribution, incomplete results, storage failure and verified zero. Counts describe sessions, never request volume or historical traffic.
- R2. Use the supplied Magpie composition for explicit strategy-to-model branch connections. Only a model path with verified activity animates; other paths remain static. Keep configured possibilities separate from observed destinations. Do not invent model pools for custom strategy kinds.
- R3. A model path is active while at least one request on that exact path is in progress, with or without a session ID. This includes waiting for the upstream response and intervals without chunks while a stream remains open. Stop the activity animation when all requests on that path finish, fail, or are cancelled. The endpoint reports `in_flight_requests` and `in_flight_streams`; do not use a recent-arrival window.
- R4. Bind activity to the actual request's selected strategy/model, including overlapping streams to different models in one session. Do not move an older stream to the session's latest destination. Activity without known model attribution remains explicitly unknown, never counts as verified idle, and must not light an arbitrary model path.
- R5. Add a bounded, content-free, process-local read-only activity endpoint, separate from session distribution. It must work without retained evidence storage and clean up on success, failure, disconnect/cancellation and process shutdown. Preserve routing, transport, outcome semantics and session TTL/eviction; do not retain session history for animation.
- R6. Refresh activity automatically while monitoring is visible. Treat snapshots as unknown when stale or refresh fails, and avoid overlapping reads or resets of selected session/request detail, list scroll and keyboard focus. State the observation scope; motion does not encode request count, throughput, chunk timing or provider health.
- R7. Keep session list, selected-session request detail, retained evidence, provider observations and existing playback available secondarily, preserving loading, empty, error, privacy and pagination behavior. Support English/Chinese, both color schemes, keyboard and small screens. Reduced motion retains complete static connections and textual activity state.

## Acceptance criteria

- [ ] AC1 (R1): Registered strategies with no sessions remain selectable. Complete counts require all pages; duplicate IDs, unknown attribution, incomplete traversal and storage failure do not become false zeroes. Activity endpoint success is independent of session-evidence storage status.
- [ ] AC2 (R2, R3): With two model paths and a request in progress only on one, only that model connection moves. The activity indication stops after its last request completes, fails, or is cancelled, on the next successful activity refresh.
- [ ] AC3 (R3, R5): A request that remains in progress continues to animate without a time-based expiry. Non-stream requests animate only while their upstream call is in progress. Stream requests remain active while awaiting or delivering chunks and stop when their iterator terminates.
- [ ] AC4 (R4): Two concurrent requests to different models in one session animate both actual paths. Finishing one stops only that path if it has no other in-flight requests. Distinct activity path counts are not summed into the existing latest-session distribution total.
- [ ] AC5 (R5, R6): Evidence storage disabled or unavailable does not prevent authoritative in-memory activity. An old backend without the activity endpoint, unreadable/incomplete activity or stale data shows unknown and no false live motion. Unknown target activity is distinguishable from verified idle. TTL eviction, reload and restart do not leave permanently animated paths.
- [ ] AC6 (R6, R7): Activity-only automatic refresh does not reset the session list epoch or reload provider data; it preserves selection, detail pagination, scroll and focus, stops when the page is hidden or monitoring is left, and respects authentication failure and stale-response guards. A changed process instance disables motion until explicit refresh starts a new sequence.
- [ ] AC7 (R2, R7): Desktop and 390px/320px layouts visibly connect the intended nodes in both schemes/locales. Reduced motion retains the same activity information without motion. Existing secondary evidence remains usable.
- [ ] AC8 (R5, R7): Browsing, refreshing and animation perform no policy writes or request replay; API output contains no prompts, keys, continuation payloads or raw upstream errors. Network-free backend/frontend tests and synthetic browser checks verify the contract.

## Dependencies and ownership

Reuse the current shared shell/tokens and preserve all unrelated uncommitted changes. This child owns monitoring presentation, grouping/activity logic and backend activity instrumentation. Shared `App.tsx`, `api.ts` and `i18n.tsx` integration must have one writer, coordinated with `09-28-dashboard-shell-visual-system` before implementation. No parallel edits to those files or broad rewrites of shared styles.

## Out of scope

Historical routing aggregates, request-volume distribution, per-strategy success rates, inferred provider health, shared multi-process telemetry, changes to session/evidence retention or database schema, policy semantics, credential persistence, strategy-canvas redesign, deployment and publication.

## Planning status

Planning is approved and implementation has started. The remaining browser verification and final review are tracked in `implement.md`.
