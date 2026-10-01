# Gateway request and stream activity lifecycle

Scope: source inspection only. `python3 ./.trellis/scripts/task.py current --source` reported no active pointer. Findings below use the supplied task directory and current repository code. No code was changed.

## Lifecycle evidence

1. `POST /v1/chat/completions` derives a session ID, captures `received_at`, and calls `MemorySessionStore.record_intake(session_id, received_at)` before routing. The request is persisted before strategy/model validation, so invalid routing requests can have request evidence without any decision or upstream request. See `jev_gateway/gateway.py:1102-1170`, `jev_gateway/sessions.py:97-119`.
2. Strategy resolution and `engine.decide(...)` produce a `Decision`; `_persist` stores/updates the in-memory session and appends a bounded decision event. Thus a live session and its latest decision can appear before upstream execution begins. The session store is process-local, TTL-based, and bounded by `max_sessions`. See `jev_gateway/gateway.py:1138-1215`, `jev_gateway/decision.py:176-254,542-591`, `jev_gateway/sessions.py:90-245`.
3. The gateway starts its elapsed-time clock immediately before payload preparation and the LiteLLM call. With recording enabled, it records a sanitized upstream request before `completion(**payload)`. The upstream call returns synchronously for both response modes. A non-stream failure records an unsuccessful outcome and returns HTTP 502. See `jev_gateway/gateway.py:1224-1302`.
4. For streaming, the gateway logs `routing stream started` only after LiteLLM returns a stream iterator, then returns a `StreamingResponse`. The iterator consumes chunks later, during response delivery. Its `finally` block calls response-capture finish and records the outcome, including disconnect/error termination. Until that iterator finishes, no outcome row has been recorded. A successful stream records outcome only after the iterator reaches completion. See `jev_gateway/gateway.py:1304-1370`, `sse_chunks` at `jev_gateway/gateway.py:369-385`.
5. For non-streaming, the response has already returned before result extraction, capture, and successful outcome recording. The outcome is recorded before the JSON response is returned. See `jev_gateway/gateway.py:1372-1401`.

## What can authoritatively mean active

The existing API/data cannot reliably identify in-flight work:

- `MemorySessionStore` exposes live session snapshots, but its `updated_at` is set during decision persistence and outcome handling. A session may remain live for its TTL after work ends. It has no active-request or active-stream field. `turn_count` and decision events describe routing, not execution.
- Persisted requests and upstream submissions are written before the upstream call; missing outcomes therefore mean incomplete evidence, not active work. The database has no active lifecycle state or completion marker beyond the outcome row. Retention, recorder failure, cancellation, and process termination can also leave evidence incomplete.
- A stream iterator starts after the HTTP handler returns its response object. Instrumenting only the synchronous handler boundary would mark the stream inactive too early. Chunk observation is available in `sse_chunks`, but it is called when a chunk is consumed and is not itself a durable event feed.
- Provider summary's `incomplete_evidence` is submission count minus outcome count. It must not be interpreted as active work.

Relevant source: `jev_gateway/sessions.py:26-78,90-245`; `jev_gateway/records.py:56-129,1187-1241`; `jev_gateway/dashboard.py:177-186,299-350`; prior contract `.trellis/tasks/09-27-dashboard-visual-language/research/monitoring-data-contract.md`.

## Recommendation for monitoring activity contract

Add process-local active-request instrumentation owned by the gateway/engine, with a stable request or decision ID, session ID when present, strategy, selected route/provider/model, start time, and lifecycle phase. Make one atomic begin operation after a decision is known and before upstream submission. End it in `finally` for all pre-response failures and non-stream responses. For streaming, keep the entry active from upstream submission through iterator termination, removing it in the stream generator's `finally`, including client disconnects and iteration errors. Ensure failures between begin and creation/consumption of the response iterator also clean up.

Expose active entries as read-only monitoring state and join/group that state onto the live sessions response (or another explicitly defined read-only endpoint). An active stream should be represented as authoritative only while its response iterator is still running. A non-streaming request can be labeled active while the synchronous upstream call is executing, though a normal synchronous list endpoint may not be queryable during that same worker thread; this limitation should be explicit. In particular, don't infer active status from recent timestamps, absent outcome rows, unfinished recorder writes, or retained session TTL.

For model-path animation, derive activity only from active lifecycle entries. A stream can update its last-observed-chunk time if a separate UI needs a chunk heartbeat; that timestamp proves observed delivery only. Remove active entries on every terminal path without a time-based expiry while a request is in progress.

## Constraints and risks

- State is per process. If the gateway is deployed with multiple workers, an in-memory registry only reports activity visible to the worker serving the monitoring request. Either document single-worker scope or use a shared coordination store for cross-worker authority.
- A client disconnect must trigger iterator cleanup; validate Starlette/ASGI cancellation behavior in tests. Also cover exceptions before iterator iteration starts, upstream errors, normal completion, and no-session requests.
- Keep activity separate from durable request/outcome evidence. Recorder availability or failure must not block request serving or falsify live process state.
- Do not expose prompts, credentials, arbitrary provider payload, or raw exception text in active entries.

## Evidence references

- `jev_gateway/gateway.py:1102-1248`: request intake, routing decision, upstream submission setup.
- `jev_gateway/gateway.py:1257-1302`: upstream call and synchronous failure path.
- `jev_gateway/gateway.py:1304-1370`: stream response and terminal outcome handling.
- `jev_gateway/gateway.py:1372-1401`: non-stream response and outcome.
- `jev_gateway/decision.py:176-254,313-372,542-591`: decision, outcome recording, and in-memory session updates.
- `jev_gateway/sessions.py:26-78,90-245`: session snapshot fields, TTL, pending intake, and bounds.
- `jev_gateway/records.py:56-129,309-374,1048-1175,1187-1241`: evidence schema, asynchronous/best-effort writer contract, retained joins, and provider summary.
- `.trellis/tasks/09-27-dashboard-visual-language/research/monitoring-data-contract.md`: existing UI evidence boundaries and warning against treating incomplete evidence as active.
