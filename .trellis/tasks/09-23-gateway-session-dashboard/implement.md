# Gateway session dashboard implementation plan

## 1. Extend live-session inspection

- Add an atomic `MemorySessionStore.snapshots()` method that prunes expired
  entries and returns detached serializable snapshots.
- Test complete listing, TTL pruning, detached output, and ordering inputs with
  `FakeClock`.

## 2. Add upstream-request evidence

- Add `upstream_requests` schema and index in `jev_gateway/records.py`.
- Add `UpstreamRequestRecord` and extend `RecordStore`, `NullRecordStore`,
  `_UnavailableRecordStore`, `_SqliteBackend`, and `SqliteRecordStore`.
- Include upstream rows in counts and retention pruning.
- Add recursive payload sanitization with explicit secret fields and
  `capture_content` behavior.
- Add tests for successful persistence, existing-database initialization,
  pruning, content opt-out, secret redaction, unknown runtime objects, and queue
  ordering.

## 3. Add session-oriented evidence queries

- Add one batched latest-evidence query for a tuple of live session IDs.
- Add a newest-first per-session query based on requests with left joins to
  decisions, upstream requests, and outcomes.
- Decode stored JSON defensively.
- Test latest-row selection, rejected/in-flight rows, full joined evidence,
  session isolation, disabled storage, and degraded storage.

## 4. Capture the real LiteLLM request

- Build `completion_payload()` once per routed request.
- Resolve the selected provider's `param_env` names as explicit secret fields.
- Sanitize and enqueue upstream-request evidence before calling LiteLLM.
- Reuse the unchanged original payload for the real call.
- Test adapter-transformed messages, reasoning effort, stream flag, provider
  arguments, failed upstream calls, secret absence, and `capture_content=false`.

## 5. Harden upstream error handling

Land this step before the provider-observation work in step 6.

- Replace `error.message = str(error)` on the failure path with a fixed
  gateway-authored message. Keep `error.code`, `error.type`, and the
  no raw exception chain in the public error path.
- Drop the `error_message=str(error)` argument from the outcome call so the
  column stays NULL. Keep `error_type`; leave the column and
  `OutcomeRecord.error_message` in place and run no migration.
- Add `redact_secret_text` in `jev_gateway/records.py` beside `_SECRET_PARTS` and
  `_secret_field`, sharing that vocabulary and the `_SAFE_TOKEN_COUNT_FIELDS`
  exemption.
- Render DEBUG upstream failures with safe frame locations and bounded type,
  without the raw exception wording or source lines. Override
  `GatewayFormatter.formatException` so pretty, compact, and JSON traceback
  rendering follows the same rule. A pattern redactor may mask recognizable
  text elsewhere, but cannot guarantee arbitrary exception text is safe.
- Clamp `error_type` to `[A-Za-z0-9_]{1,64}` at the response, disk, and log
  sites.
- Add the regression tests from the research note:
  1. `tests/test_gateway.py`: extend `test_upstream_failure_becomes_a_gateway_error`
     so completion raises `RuntimeError("Authorization: Bearer test-key-small")`.
     Assert 502, `error.code == "upstream_error"`, the fixed message, and that
     `test-key-small` and `Bearer` appear nowhere in `response.text`.
  2. `tests/test_gateway.py`: after the same call, read `error_message, error_type`
     from `outcomes` and assert NULL plus `"RuntimeError"`, then assert
     `b"test-key-small"` is absent from the database file bytes.
  3. `tests/test_gateway.py`: assert the session-requests body contains no
     `test-key-small`, no `Bearer`, and no `"error_message"` key.
  4. `tests/test_logging_config.py`: format one credential-bearing `exc_info`
     record through `GatewayFormatter` in pretty, compact, and JSON; assert the
     credential is absent and the mask marker is present.
  5. `tests/test_gateway.py`: with `caplog` at DEBUG, drive the failed request and
     assert no captured record carries the credential.
  6. `tests/test_records.py`: unit-test `redact_secret_text` on
     `Authorization: Bearer sk-abc`, `api_key=xyz`, `token=...`, and
     `password=...`; assert `max_tokens` and `total_tokens` stay intact, and
     ordinary text is unchanged.
  7. `tests/test_gateway.py`: drive a streaming failure whose iterator raises with
     the credential; assert no log record carries it and `outcomes.error_message`
     stays NULL.
  8. Optional: assert dashboard `storage.error` text cannot be influenced by a
     provider exception.

## 6. Add fixed-window provider observations

- Add `idx_upstream_requests_created_at` and a provider-summary query to the
  record-store protocol, all store implementations, and `_SqliteBackend`.
- Submit the query with `wait=True` through the existing writer queue. Filter a
  fixed inclusive-start, exclusive-end 15-minute window on
  `upstream_requests.created_at`, left-join outcomes by `decision_id`, and group
  by provider.
- In the dashboard layer, merge retained rows with the active catalog so every
  configured provider appears. Derive attempts from submitted upstream requests,
  completed/succeeded/failed/incomplete-evidence counts, average observed latency,
  latest completed outcome, and neutral observed condition.
- Preserve retained, best-effort, and degraded semantics: queue loss and process
  failure can leave evidence incomplete; a missing outcome is not active work;
  disabled or degraded storage returns null metrics and condition, never zeros.
- Test grouping, zero-traffic configured providers, exact window boundaries,
  streaming completion, null latency, incomplete evidence, queue ordering,
  disabled/degraded states, and summary privacy.

## 7. Add the dashboard router and page

- Create `jev_gateway/dashboard.py` with a cycle-free router factory.
- Add `GET /dashboard`, `GET /v1/routing/providers/summary`,
  `GET /v1/routing/sessions`, and
  `GET /v1/routing/sessions/{session_id}/requests`.
- Include the router from `create_app()` using the active gateway config and
  existing authorization callback.
- Implement a compact "Retained outcomes, last 15 minutes" provider table above
  the existing two-column session view. Reuse the existing manual Refresh control,
  in-memory Bearer form, empty/error states, session selection, and expandable
  request stages.
- Write dynamic values through DOM text APIs and add defensive response headers.
  Do not add polling, charts, arbitrary ranges, controls, or health wording.
- Test shell headers/content, authentication, provider summary semantics,
  live-only listing, latest model enrichment and fallback, detail ordering,
  missing session, storage-disabled, and degraded-storage responses.

## 8. Document the feature

- Add a concise Dashboard section to `README.md` with URL, authentication flow,
  retained-evidence and privacy limits, and the fixed 15-minute provider summary.
  Extend the privacy wording so the redaction promise covers exception text in
  the 502 body, storage, and logs.
- Update `docs/routing-design.md` evidence storage to include sanitized upstream
  requests, dashboard query semantics, retained/best-effort limitations,
  incomplete-evidence meaning, and neutral observed-condition labels. Record that
  upstream failures store `error_type` only and return a fixed gateway-authored
  502 message, including the pre-existing-database limitation.
- Update `docs/models-config.md` only if the new evidence row or
  `capture_content` behavior needs clarification. Do not add dashboard or
  provider-observation configuration.
- Update backend Trellis specs if implementation reveals a durable convention
  not already captured.

## 9. Validate

Run focused checks while iterating:

```bash
uv run pytest -q tests/test_sessions.py
uv run pytest -q tests/test_records.py
uv run pytest -q tests/test_gateway.py
```

Run final checks:

```bash
uv run pytest -q
uvx pyright
uv build
```

Use active LSP diagnostics on every changed Python file. Inspect the rendered
HTML response and exercise the dashboard APIs through `httpx.ASGITransport`.

## Risk and rollback points

- Do not let raw provider secrets reach an evidence record, even transiently.
- Do not let upstream exception text reach the 502 body, `outcomes.error_message`,
  or rendered logs. Gateway-authored text and formatter masking are the only
  boundaries; do not relax them to make debugging easier.
- The fixed 502 message changes one existing test expectation on purpose. Do not
  restore the upstream wording to keep that test green.
- Do not call SQLite from request threads; all reads and writes go through the
  existing writer queue.
- Do not change routing behavior while refactoring payload construction.
- Do not expose historical-only sessions as live sessions.
- Do not present retained outcomes as provider health, reachability, uptime, load,
  or true concurrency. The only allowed condition labels describe completed
  retained evidence.
- If the dashboard query shape makes the existing writer thread unsafe, stop and
  revise the design rather than adding a second connection.
- The additive table, index, and routes permit file-by-file rollback without data
  loss.
