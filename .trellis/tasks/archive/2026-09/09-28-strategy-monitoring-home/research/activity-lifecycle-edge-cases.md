# Activity lifecycle edge cases

## Request attribution

The authoritative request decision is created by `RoutingEngine.decide()` and includes request, session, strategy, route, provider, and model identifiers. The session snapshot itself is mutable routing state, so it cannot identify every active request accurately when requests overlap.

- `gateway.py:1111-1145` creates request identity and records intake/request before route resolution. At this point there is no selected route/model. Requests rejected during strategy/model validation may have an intake record but no routing decision or upstream activity.
- `decision.py:198-266` produces one immutable `Decision`; its route/model/strategy should be copied into activity state once routing succeeds. `Decision` includes `request_id`, `session_id`, `strategy`, `route_name`, `provider`, and `model` (`decision.py:78-110`, `570-607`).
- The current `SessionState` holds only the latest route/strategy (`sessions.py:29-51`), and `_persist()` overwrites these on each decision (`decision.py:625-657`). If a request for model A remains in flight while another request for model B is decided in the same session, aggregating activity from the session's route would misattribute A to B. Keep independent per-request records keyed by request ID and carry the decision's model and strategy on each entry.
- `resolve_strategy_name()` pins requests to the existing session strategy unless a named strategy is explicitly requested (`gateway.py:297-311`). Explicit strategy changes may update the session's latest strategy while an older request is active, another reason to preserve strategy per request.

## Intake freshness versus active upstream work

Earlier activity proposals used an intake timestamp from `time.time()` at `gateway.py:1111`. The approved rule uses only live in-flight request membership. `record_intake()` presently stores only `first_request_at`, the earliest request of a session (`sessions.py:101-123`); it does not retain the most recent intake timestamp. The existing dashboard's `latest_request.received_at` comes from the record store, where evidence availability depends on persistence being configured (`dashboard.py:360-395`; `records.py:1057-1134`). That timestamp can support freshness only when evidence is available and can lag asynchronous persistence. Do not retain `last_received_at` for animation. A request has no model attribution until a decision exists.

## Where active tracking belongs

A small process-local registry alongside `GatewayConfig`/`create_app()` is a clean boundary: API projection in `dashboard.py` can read it, and the chat handler updates it using the same resolved decision. Alternatively, extend `MemorySessionStore` because it already owns bounded session lifecycle, locking, TTL, and snapshots (`sessions.py:82-103, 125-181, 200-249`). If extending the store, model request entries must remain a collection, not one active boolean or one route field. Request IDs with idempotent start/finish operations prevent double-decrement; derive count/active by the collection's cardinality. Key entries by session and request ID, and include decision strategy and route/model. Requests without `session_id` cannot appear in the current live-session listing and need no session path activity.

The session store uses monotonic time for TTL (`sessions.py:85-100, 255-256`). Activity is based on registry membership, so no wall-clock timestamp or freshness comparison is required. `FakeClock` in `tests/helpers.py:86-97` remains useful for session TTL tests; request tracking itself is validated by adding and removing request tokens.

## Completion and cancellation

- Synchronous/non-stream completion is performed by `completion(**payload)` at `gateway.py:1257`; its `try` catches failures and returns a 502 at `1258-1298`. Register activity after a decision and before the upstream call; put an idempotent finish in a `finally` around the entire post-decision upstream/response handling so success, exception, and response serialization failures clear it.
- Streaming calls return `StreamingResponse(recorded_stream(), ...)` at `gateway.py:1368-1372`. The generator body does not run until response iteration starts. A tracking `try/finally` placed only inside `recorded_stream()` leaves a gap between construction and first iteration; client disconnect before first iteration can strand activity. The outer HTTP response must own a closeable iterator/context that finishes on body completion or close, or initialize cleanup immediately after upstream response acquisition and close the upstream iterator in its finalizer. Verify Starlette's iteration/close contract locally with tests, since plain `StreamingResponse` doesn't execute the generator body at construction.
- Current stream cleanup at `gateway.py:1315-1353` runs its `finally` once iteration begins, but catches `Exception` only. Cancellation (`asyncio.CancelledError`/generator close) need explicit cleanup semantics; `GeneratorExit` is not an `Exception`, and `CancelledError` inheritance depends on the runtime. Ensure finalization occurs regardless of exception class, then preserve/re-raise cancellation rather than disguising it as provider failure. Existing code may currently record cancellation as `ok=True` in its outcome path; activity cleanup should not depend on outcome correctness.
- A stream that yields no chunks and terminates is complete and inactive. A stream whose first `next()` blocks remains active. If the returned LiteLLM object is not iterable for `stream=True`, failure during iteration or iterator setup still needs cleanup.
- There is no gateway-side conversion from stream to non-stream or fallback response path in the observed completion handler. `completion_payload()` passes the requested stream boolean through directly (`gateway.py:216-248`); adapter fallback behavior is outside this local code and should not alter local lifecycle finalization.

## Bounds, reload, restart

`MemorySessionStore` defaults to 1,800-second TTL and 2,048 sessions (`sessions.py:82-100`), prunes inactive state by `updated_at`, bounds pending intake, and supports configure/eviction (`sessions.py:125-139, 158-181, 231-260`). Active work should pin a session while a request is live, or at minimum preserve its active entry if session expiry runs during a long request. If all activity state is stored inside `SessionState`, outcome handling updates `updated_at` only at completion (`decision.py:404-427`), so an active request beyond configured TTL could be pruned and lose the signal. Keep active entries separately or ensure in-flight status prevents expiry/eviction. On finish, normal session TTL applies.

Catalog reload applies session TTL/max-session configuration through `GatewayConfig.apply_settings()` (`gateway.py:143-152`); catalog swap itself retains the store (`decision.py:447-465`). Activity records should survive such reloads because in-flight requests can outlive the route that started them. Process restart naturally clears process-local active flags, which is correct because no previous process request remains active. Persistent outcomes and records are unnecessary for animation and should not be used to reconstruct in-flight work.

## Superseded proposal: do not extend session rows

This research note was written before the user approved the final separate activity endpoint. Its following additive-session-row proposal is superseded by `../design.md` and the task PRD. Do not add `last_received_at`, `active_requests`, `active_work` or `active_routes` to `/v1/routing/sessions`; do not couple activity to session TTL or session grouping. Use only `GET /v1/routing/activity`, which carries content-free per-destination process activity. Session rows retain the existing latest-session distribution contract.

## Historical proposal (superseded)

The original proposal was:

Keep existing `GET /v1/routing/sessions` pagination and row semantics unchanged; add fields to each safe list row only:

```json
{
  "last_received_at": 1720000000.0,
  "active_requests": 1,
  "active_work": true,
  "active_routes": [
    {"strategy": "task_aware", "route": "provider/model-id", "provider": "provider", "upstream_model": "model-id", "request_count": 1}
  ]
}
```

`active_routes` is a grouped projection of per-request activity (needed to preserve different destinations for overlaps), not historic observations. A row with `active_requests: 0` and no `active_routes` means no current in-flight work; `last_received_at` still supports the recent-intake window. Keep this state independent of `latest_request.ok` and stored outcomes. List rows already project only safe summary fields (`dashboard.py:372-395`), and the endpoint is bearer-authorized (`dashboard.py:352-359`). Strategy/model values are existing routing metadata, not prompt or credential fields.

## Existing test footholds

`tests/test_gateway.py` has fake completion injection and an app request helper (`:40-92`), a concurrent-session test (`:327-375`), stream error test (`:813-849`), stream completion test (`:1789-1819`), provider evidence timing test that queries monitoring during stream iteration (`:1259-1295`), and dashboard session projection/pagination tests (`:1322-1455`). Extend these with blocking iterators and overlap on one explicit `X-JEV-Session-Id`: hold model A open, decide/start model B, inspect both destinations; close/cancel one then ensure only its entry disappears. Add failure before response iteration, cancellation before first chunk, two concurrent requests finishing in either order, no-session request, and TTL/config reload while one request remains in flight. Use synthetic IDs and fake provider functions only; do not invoke network upstreams.
