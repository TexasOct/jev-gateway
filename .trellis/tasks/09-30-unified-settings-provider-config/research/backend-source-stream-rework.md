# Backend decision source and completed-stream rework

The assigned backend changes are implemented and pass synthetic regression checks. Global-default source now survives selection, escalation, decisions, previews, sessions and retained request evidence. Completed streams retain assistant continuation metadata and outcome fields after successful ASGI delivery. The session-list projection still needs the parent-owned integration patch described below. No installed-wheel, native browser, real upstream or publication acceptance is claimed by this report.

## Changed files and ownership

This delegate changed these product and test files:

- `jev_gateway/strategy/contracts.py`: appended backward-compatible `StrategyOutcome.defaulted: bool = False`.
- `jev_gateway/strategy/policy.py`: propagated selection source through outcomes, preserved it while keeping a session model and when rebuilding escalation candidates, and retained `empty_tag_default` reason evidence.
- `jev_gateway/decision.py`: appended `Decision.defaulted: bool = False`; added preview/decision serialization, session/event propagation, persisted source in existing decision signals, and separated global-default reasoning from a configured literal `default` label.
- `jev_gateway/sessions.py`: appended nullable `SessionState.defaulted`, preserved detached-copy behavior and exposed known source in snapshots.
- `jev_gateway/records.py`: projected a strict optional boolean from existing `signals_json` into retained decision detail and latest-session decision evidence. No schema or database-column migration was added.
- `jev_gateway/gateway.py`: exposed the active safe global defaults in routing configuration; collected SDK stream outcome metadata before model echo; finalized successful capture after terminal ASGI delivery; closed iterator resources and recorded unsuccessful interruption/incomplete outcomes without finalizing capture.
- `tests/test_empty_tag_default.py`: source, literal-label, event eviction, reasoning collision, escalation/matrix evidence, API detail and safe routing-default projection regressions.
- `tests/test_records.py`: persisted source round trips, compatibility with absent/nonboolean source, preservation of other signal keys and unchanged schema.
- `tests/test_stream_evidence.py`: new typed synthetic SDK stream and ASGI delivery regressions, including durable provider replay after store reopen.

The shared worktree already contained task changes. Git's whole-file diff includes those earlier changes and must not be attributed entirely to this delegate. No Provider/setup/env owner files, frontend, docs/specs, generated assets or operator files were edited. This report is the only task-artifact write.

## Source contract and frontend JSON paths

An actual global-default selection has `defaulted: true`. An ordinary configured label, including the literal label `default`, has `defaulted: false`. The flag describes selection source, not whether the selected model happens to equal `defaults.default_model`. Manual selections retain the existing manual routing behavior and are ordinary selections.

| Surface | JSON path | Contract |
| --- | --- | --- |
| `POST /v1/routing/preview` | `preview[].defaulted` | Explicit boolean for new previews, next to `label`, `tier` and `reason` |
| `GET /v1/routing/decisions/{decision_id}` | `defaulted` | Explicit boolean in `Decision.as_dict()` |
| `GET /v1/routing/sessions/{session_id}` | `defaulted` | Known live-session source; omitted for legacy state whose source is still unknown |
| Same live-session detail | `events[].defaulted` | Present on new decision and switch events |
| `GET /v1/routing/sessions/{session_id}/requests` | `session.defaulted`, `session.events[].defaulted` | Same live snapshot contract |
| Same retained request detail | `requests[].decision.defaulted` | Optional strict boolean decoded from existing `signals_json` |
| Store's `latest_session_evidence()` | `[session_id].latest_decision.defaulted` | Optional strict boolean for internal safe latest-decision projection |
| `GET /v1/routing/configuration` | `defaults.default_model` | Canonical model reference or null, using `catalog.defaults.as_dict()` |
| Existing `GET /v1/routing/policy` / Provider projection | `defaults.default_model` | Existing catalog/defaults projection; unchanged by this delegate |

New stored decisions write `signals_json = {"defaulted": true|false}`. The recorder still stores other signal keys supplied by other callers unchanged. The safe evidence decoder exposes only a genuine boolean source; absent fields, invalid JSON, string values and numeric values remain unknown. Older records are not rewritten. Existing frontend `SignalProjection` keys should remain intact when the frontend adds its optional source property.

Keep the raw label canonical as `default` in API evidence. Frontend localization can apply Default/默认 when the explicit flag is true, preserve a user label when false, and use reason-marker/configured-label compatibility handling when source is absent. No new response header was added. Existing route/label/reason headers continue to report the selected result.

### Required parent integration: session list

`jev_gateway/dashboard.py:393` owns a safe field allowlist for `GET /v1/routing/sessions`. It currently discards the snapshot's `defaulted`, and lines around 400 copy retained decision fields without copying their source. This file is outside the dispatched ownership, so this delegate left it unchanged. The HTTP session-list response has no new `data[].defaulted` yet; the internal latest evidence field in the table above does not reach that response.

The parent should add `defaulted` to the snapshot's safe list projection, preserving optionality for legacy snapshots, and copy `latest_decision.defaulted` only when it is a boolean. Match the chosen label's source when retained evidence overrides the live list label. Cover both storage-backed and memory-only lists with global and literal `default` results. Then the frontend can consume `data[].defaulted`. This is a remaining integration requirement for R4, not a passed HTTP contract in this report.

The remote agent mesh was unavailable (`list_peers` returned “Not in a session”), so no source-contract message could be sent to frontend delegate `b7374b6f`. The table above is the handoff.

## Continuation and reasoning behavior

Current/pinned selections carry the session's known boolean. A legacy state without the field can infer global source from a retained `empty_tag_default` decision marker or from tier `default` when no literal `default` label is configured. An ordinary literal `default` label without such evidence stays ordinary. After the next decision, the boolean lives on the session itself. Regression loops run 45 continuation decisions, beyond the 40-event limit, with both sources in the same label catalog and verify that eviction cannot change the source.

Escalation now copies `candidate.defaulted` when rebuilding `Selection`. An escalation into an empty pool reports `output_truncated:empty_tag_default`, and a matrix retains its prefix, for example `decision_matrix:fake:rule_1:output_truncated:empty_tag_default`. Initial literal-default selection and capability widening regressions remain present and pass.

Global-default reasoning uses `policy.reasoning.fallback` before clamping against the chosen model's declared ladder. It does not consult the ordinary literal `default` label or its label/tier effort mappings. Ordinary literal-default routing still uses that configured label's effort. Existing reasoning modes, client-effort handling and undeclared-ladder behavior remain in force. The collision regression verifies global `medium` and ordinary literal `high`, including subsequent pins and previews.

Parent docs/specs should state this explicit source contract and reasoning distinction. The earlier review's conditional reasoning wording is superseded by the current dispatch requirement and these regressions.

## Completed-stream evidence

`gateway.py` observes each SDK chunk through the existing serializer/capture path before applying the client-facing requested-model echo. It retains the first choice's non-null finish reason, the latest available usage mapping, and the observed native model. Usage-only final chunks do not erase an earlier finish reason. Outcome recording uses the existing engine/store owner for tokens, cost, finish reason, returned model, latency and session truncation/failure counters.

A successful capture requires SDK iterator exhaustion, a finish reason and successful delivery of the terminal ASGI body frame. The response wrapper calls `response_capture.finish()` once after those conditions hold. The stream activity token remains active until delivery ends. Resource close and outcome recording have once-only guards.

An SDK exception, incomplete natural exhaustion, disconnect or failed ASGI send does not finalize accumulated assistant capture. Failures preserve bounded error types and existing safe stream-failure logging; upstream iterator errors still end without `[DONE]` or an injected error event. Interrupted outcomes use `StreamInterrupted`; naturally exhausted streams without a finish reason use `StreamIncomplete`. A naturally exhausted incomplete iterator retains the established SSE encoder's `[DONE]` behavior, but it is not recorded as successful and does not create an assistant continuation. Partial observed metadata can remain in a failed outcome, alongside `ok: false`.

The regressions cover:

- Typed SDK assistant deltas, `stop` and `length`, plus a final usage-only chunk; native returned model is retained while SSE echoes the requested virtual model.
- Exact assistant message key, one durable continuation, correct provider origin, outcome token counts/cost and truncation counters.
- SQLite/store reopen and a follow-up prepared through the DeepSeek adapter: saved DeepSeek reasoning returns, and a known OpenAI-origin message receives the existing cross-provider marker.
- SDK failure before finish and after STOP/usage, incomplete iterator exhaustion, client disconnect, send failure before the first body, ordinary data send failure, `[DONE]` send failure and terminal empty-frame send failure.
- No capture finalization or completed assistant rows on failed/interrupted paths; one failed outcome and iterator close; activity cleanup.
- No outcome/continuation before terminal-frame delivery, exactly one capture finalization afterward and activity retained until that point.

### `previous_response_id` scope

JEV currently exposes Chat Completions and preserves extra LiteLLM parameters. It has no native `previous_response_id` resolver or Responses endpoint. The regression includes a synthetic `previous_response_id` on the follow-up and proves unchanged forwarding alongside actual durable assistant-history replay through the provider adapter. It does not claim opaque-ID-only history reconstruction by JEV or upstream acceptance of that extra parameter. Adding such a resolver would require a separate contract and is outside this rework.

## Verification

All commands ran from `/Users/texas/Workspace/jev-llmroute-test`. Tests used the existing virtual environment, fake provider credentials, temporary catalogs/databases, mocked LiteLLM and in-process ASGI calls. `PYTHON_DOTENV_DISABLED=1`, `LITELLM_LOCAL_MODEL_COST_MAP=true`, `PYTHONDONTWRITEBYTECODE=1` and `UV_OFFLINE=1` were set for pytest. Pyright used its cached tool through `uvx --offline`; no dependency download was needed.

Final backend regression command:

```sh
PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true \
PYTHONDONTWRITEBYTECODE=1 UV_OFFLINE=1 .venv/bin/python -m pytest -q \
  tests/test_empty_tag_default.py tests/test_stream_evidence.py \
  tests/test_records.py tests/test_gateway.py tests/test_decision.py \
  tests/test_sessions.py tests/test_provider_adapters.py tests/test_activity.py \
  tests/test_decision_matrix.py tests/test_decision_strategy.py \
  tests/test_routing_strategies.py tests/test_custom_labels.py \
  tests/test_reasoning.py tests/test_routing_overlay.py \
  --deselect=tests/test_gateway.py::test_dashboard_shell_is_content_free_and_data_api_requires_bearer_auth
```

Result: **350 passed, 1 deselected**, exit 0, 3.50 seconds. The deselected shell test explicitly requests the frontend-build fixture; frontend/build-wheel gates belong to the parent. The initial narrower run passed 80 cases. Follow-up runs added ASGI terminal-frame coverage. Temporary Pyright findings concerned only typing in the new tests and were corrected.

Final focused typecheck command:

```sh
UV_OFFLINE=1 uvx --offline pyright \
  jev_gateway/strategy jev_gateway/decision.py jev_gateway/sessions.py \
  jev_gateway/records.py jev_gateway/gateway.py \
  tests/test_empty_tag_default.py tests/test_records.py tests/test_stream_evidence.py
```

Result: **0 errors, 0 warnings, 0 informations**, exit 0. After the final test-only type narrowing, `tests/test_stream_evidence.py` was rerun: **13 passed**, exit 0, 0.51 seconds. `git diff --check` also passed with exit 0. There is no repository-configured backend lint command; Pyright, regression tests and whitespace checking were used.

Read the dispatched task artifacts, every implement-manifest entry, applicable backend/spec guides, embedded humanizer instructions and both `global-init-integration-check.md` and `real-stream-acceptance.md`. Reviewed full selection, capture, continuation, nonstream, evidence-query and ASGI bodies before editing. A read-only source review identified the terminal empty-frame edge case; the implementation and new failure regression address it.

## Remaining parent gates

Integrate the session-list source projection and frontend consumers, then rerun the complete backend/frontend/type/browser gates against the final source. Rebuild a fresh final wheel and verify source/wheel parity. Repeat installed real-stream acceptance against that artifact, including retained continuation count and outcome finish/usage/native-model fields. Native browser and Ubuntu/macOS installed-wheel/public release gates remain parent-owned. The earlier 896-test/full-wheel pass predates this rework and does not certify the final source.

No commit, push, merge, publication, operator file write, real auth-file read or network call was performed by this delegate.
