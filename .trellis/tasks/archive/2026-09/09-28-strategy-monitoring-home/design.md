# Strategy-first monitoring design

## Boundaries and decisions

Retain the existing strategy browser and latest-session distribution. Add a separate, content-free activity projection whose only purpose is to determine which model connections currently have at least one in-flight request. Non-stream requests are active during the synchronous upstream call. Streams remain active through upstream wait, chunk gaps and response delivery until completion, failure or cancellation. Request completion ends activity; there is no trailing 60-second recent-arrival window.

Use a new read-only `GET /v1/routing/activity` endpoint rather than repeatedly traversing session/evidence pages for activity. This avoids coupling a long-running stream to session TTL/eviction or resetting detail lists during polling. Existing sessions/requests response shapes, TTL, cursor ordering and persistence stay unchanged. No SQLite migration, new dependency or persisted configuration is required.

## Backend ownership and lifecycle

Added a focused `jev_gateway/activity.py` module containing a lock-protected process-local registry. The app owns one instance, preserves it across catalog reloads, replaces it on process restart and clears it at shutdown. `gateway.py` updates it; `dashboard.py` projects it through the existing authorization dependency. Do not put monitoring behavior in strategy implementations or block upstream serving on storage/monitoring failure.

Once an immutable decision provides strategy, route, provider and upstream model, register the request against that destination. Do not use mutable `SessionState.route` later for attribution. A selected model creates activity even without a session ID and does not increment session distribution. Requests without a selected model do not create an attributed model-path signal. Empty results mean no observed in-flight requests on attributed model paths, not global gateway idle. Unknown model attribution remains unknown and cannot be called inactive from an empty result.

The registry keeps an idempotent set of all in-flight requests keyed by immutable destination and request token. It does not retain completed request timestamps. Register after routing chooses a destination and before upstream submission. Non-stream requests finish after the synchronous upstream attempt. Stream tokens stay present through response delivery, including header waits and chunk gaps. Synchronous error cleanup and ASGI response-level cleanup both finish a token, including when iteration never starts, sending fails or the client disconnects. Cleanup is idempotent. Registry bounds are independent of session retention. Capacity or instrumentation failures keep chat serving while marking activity incomplete and suppressing path claims. TTL eviction does not delete active tokens. Catalog reload preserves original destinations; restart and shutdown clear process-local state.

## Read-only activity contract

`GET /v1/routing/activity` returns safe aggregate path metadata, not individual request/session IDs or contents:

```json
{
  "object": "routing.activity",
  "scope": "process",
  "instance_id": "opaque-per-process-id",
  "complete": true,
  "paths": [
    {
      "strategy": "task_aware",
      "route": "recorded-route-name",
      "provider": "provider-id",
      "upstream_model": "model-id",
      "in_flight_requests": 1,
      "in_flight_streams": 1
    }
  ]
}
```

`in_flight_requests` is the number of tracked unfinished upstream requests on that exact path, including streaming and non-streaming calls; `in_flight_streams` is retained for diagnostics. The UI uses in-flight state as a boolean and does not present it as a session count. Return paths only while they have at least one tracked request; `paths: []` with `complete: true` means no observed in-flight requests on attributed model paths. Missing/unsupported response, failure, invalid values or `complete: false` means unknown, not idle. The endpoint is bounded and does not paginate or read retained request bodies. It follows the same configured Bearer authorization as other monitoring reads, uses no-store caching, and exposes no prompt, keys, raw exceptions or adapter state.

Activity is scoped to the serving process, consistent with existing memory sessions. Do not claim cluster-wide coverage. If consecutive activity reads return different `instance_id` values, disable motion and show an inconsistent-worker warning until an explicit full refresh establishes a new sequence. Shared multi-worker aggregation is deferred.

## Session distribution remains separate

Continue enumerating `/v1/routing/strategies` and walking all `/v1/routing/sessions` cursors for current-session counts, deduplicating by session ID. Preserve unknown strategy/model attribution and existing partial/error/storage distinctions. Counts are one per TTL-retained session, attributed to its latest known model, separate from in-flight request activity. Use wording such as `Current sessions` and `当前会话`; reserve `Active`/`活跃` for the in-flight request state. Label counts as the last completed session read. The initial monitoring load and explicit full refresh/retry read strategies, sessions and provider observations. Background activity polls do not reload distribution, providers or detail. An activity-only refresh restarts only the activity sequence; explicit full refresh is the recovery action after a process-instance change. Existing explicit full-refresh list reset behavior remains separate from the quiet polling guarantee.

Do not use `/v1/routing/configuration` to enumerate strategies; it describes editable `task_aware` only. Configured model possibilities, where supported, remain separately labelled. New activity-only model rows may appear when a stream's model differs from the session's latest selection or the session was evicted. Label those rows as activity observed separately from the session distribution; do not invent or increment session counts. Preserve unregistered strategies observed during reload rather than silently relabelling their activity.

## Frontend transport and freshness

`api.ts` owns the typed activity request. `App.tsx` (or a narrow hook invoked there) owns its lifecycle and passes state into `MonitoringView`; presentational diagram code never fetches credentials or records. Keep activity loading independent from provider observations, SQLite availability and the existing session walk.

Poll activity every 3 seconds after the preceding read settles, without overlapping requests, only while monitoring is visible and credentials are usable. On return to monitoring or document visibility, request a fresh sample before showing motion. Stop/cancel on hidden state, navigation, unmount and authentication failure. Generation guards reject old responses across manual refresh, credential change or visibility changes. Manual refresh can restart the activity sequence but must not make background polling reset selected session/request, detail cursor, virtual-list epoch, scroll or focus.

Use a 10-second freshness limit for activity snapshots from dispatch; failure or incomplete data suppresses activity immediately. A request timeout at that limit aborts the read. After ten seconds without a successful refresh, activity is unknown/stale, not idle. A new successful sample can resume motion. This freshness guard only covers monitoring transport, not request duration; it must never expire a server-tracked in-flight request.

The expected stream-end UI delay is the next successful poll, not per-chunk real time. A slow/failed monitor connection can suppress motion without claiming the upstream stopped. No long-lived SSE/WebSocket transport is needed for this release.

## Diagram and interaction

Use `research/magpie-route-reference.png` for composition: compact strategy selection, a centered strategy node, and individual curved branches to model rows. For built-in strategies with resolvable policy labels, derive separately labelled configured-possible model destinations from the already authenticated policy/catalog read; never count them as observed sessions or infer them from an activity response. For custom strategy kinds whose destination set cannot be resolved safely, display only observed/activity destinations and state that configured possibilities are unavailable. Retain activity paths for a strategy removed by catalog reload under its original strategy name in a separate historical-in-flight group; do not relabel them to the current registry. Replace the current pair of generic divider links with real SVG paths using measured local node anchors. Use the same path geometry for a static low-contrast stroke and the moving accent overlay. Recompute after resize, locale/text wrapping and destination changes; at 390px/320px use a deliberate stacked arrangement with connected endpoints. SVG is decorative; HTML labels and a concise legend carry the meaning.

Only verified active model paths animate. Session/strategy selection alone never starts activity motion. Other branches remain visible and static. Use a subdued moving dot or dash; speed is constant and conveys no rate, token delivery or measured timing. The shared incoming connector can remain static. Reduced-motion mode shows static active-path emphasis and equivalent text. Provide an accessible pause-motion control for sustained animation without hiding state. Keep request-evidence replay separate and unchanged.

Keep neutral shared surfaces, the saved theme accent, light/dark support and existing controls. Monitoring is not a draggable/zoomable canvas. Keep session/request lists and observations in secondary disclosure with their current loading/error/empty/privacy and virtual-window contracts.

## Ownership, compatibility and rollout

The shell task owned and implemented shared `App.tsx` and `api.ts` integration through an explicit Trellis channel handoff; monitoring owned view, styles, helpers and tests. This child owns activity module/gateway/dashboard integration and public API documentation. Preserve unrelated dirty files; do not change shared files concurrently without an explicit handoff.

Old clients ignore the added endpoint. A new frontend connected to an old backend receives activity unavailable and renders static paths, not inferred activity. The release build packages matching frontend/backend. No schema migration or startup backfill occurs. Publish the activity scope and response contract in `docs/http-api.md`, and record final executable invariants in the dashboard spec after implementation.

## Verification and rollback

Use only fake upstreams and synthetic browser data. Verify lifecycle before/after first iteration, ASGI send failure, cancellation including `CancelledError` and generator close, parallel targets, capacity failure, storage off, reload and session TTL eviction. Test requests with no session ID, unknown model attribution without a false idle claim, and process `instance_id` changes causing warning/static paths until explicit refresh establishes a new sequence. Verify requests remain active until completion/error/cancellation with no time-based expiry, old-backend fallback, stale reads, auth/visibility races and no policy/replay calls. Browser tests must inspect actual path endpoints and changing active markers, not only screenshots.

Rollback only reviewed monitoring/activity hunks, including the optional read endpoint and matched frontend client. Retain the current session distribution and unrelated dashboard work; never reset the worktree. No persistent data rollback is required.
