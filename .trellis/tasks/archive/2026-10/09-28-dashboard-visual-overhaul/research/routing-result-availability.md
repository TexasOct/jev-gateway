# Monitoring strategy distribution data availability

## User request

The monitoring home simple view should lead with each strategy's current model distribution and live session load, using a Magpie-inspired visual and animation. The user confirmed that current live sessions are sufficient for the first release, and session/request detail belongs in a secondary view. Historical aggregates are out of scope.

## Existing data that can support a live view

- `GET /v1/routing/strategies` returns every registered strategy and the default name, even when there are no live sessions. Use it for the browse list. `GET /v1/routing/configuration` reports only the editable `task_aware` policy and its resolved labels/models; it cannot enumerate all strategies or report actual usage. `/v1/routing/policy` exposes catalog definitions for more strategies but not pre-resolved per-strategy model pools; custom strategy kinds may not be representable as the same policy graph.
- `GET /v1/routing/sessions` reports live in-memory sessions, each with latest strategy, route/model, label, turn count and update time where known. Following every cursor page allows the client to group current live sessions by strategy and selected model. This is a current-session snapshot, not lifetime or rolling-window traffic. Sessions can expire or be evicted, pagination may drift, and the default page size is 30.
- Selected-session request detail returns retained request decision/upstream/outcome fields. It can show recorded results for that live session, not a global per-strategy history browser.
- The provider summary is provider-scoped over a 900-second window. It cannot be attributed to strategy/model without new aggregation data.

## Missing capability

There is no current API for all retained decisions aggregated or browsed by strategy/model, and no per-strategy/model aggregate outcome or latency endpoint. The durable `decisions` store contains strategy/provider/upstream-model/time fields, but they are not exposed via a global history query. `Decision.candidates` is a catalog snapshot and must not be treated as models considered or traffic distribution.

## Safe presentation boundary

Without backend/API changes, the monitoring home can list all registered strategies and show counts of currently live sessions by latest known strategy and selected model after loading all session pages. Any configured model pools must be derived only when the strategy representation supports them and labeled separately from observed counts. A live-session count is not a routed-request count; the same session can make several requests or switch models, and its row shows only the latest known selection. Label the scope explicitly, for example “Current live sessions”. Selected-session recorded request outcomes can be inspected separately. Strategies/models with no live sessions must show zero only when the full current-page walk completed; before completion or when session storage is unavailable, show loading/unavailable rather than zero. Never imply provider health, request probability, quota, historical share, or aggregate success rate from this data.

Any future all-history grouping per strategy/model needs separate backend/API approval, retention/window definitions, and privacy limits. Avoid collecting prompt content for such an aggregate.

## Source verification

Audited `frontend/src/api.ts`, `jev_gateway/dashboard.py`, `jev_gateway/records.py`, `jev_gateway/sessions.py`, `jev_gateway/decision.py`, `jev_gateway/gateway.py` and relevant dashboard tests. No actual SQLite data, logs, secrets or live gateway were read.
