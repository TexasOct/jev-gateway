# SDK stream cleanup rework

The remaining P2 SDK cleanup gap is fixed in source. `gateway.py` awaits the SDK's async-only `aclose()` after stream delivery ends, shields cleanup from AnyIO cancellation, and waits for an executing worker iterator before closing it. Sync `close()` remains supported. Focused offline checks passed: 211 tests with one frontend-build test deselected, and Pyright reported no findings for the two changed Python files.

This delegate edited only `jev_gateway/gateway.py`, `tests/test_stream_evidence.py`, and this report. Both Python files already contained parent/delegate work at dispatch; their full Git diff includes those earlier changes. No commit, package upgrade, frontend build, static output, operator write, credential read, external network call, real generation request or publication occurred.

## Installed source evidence

Read the full `CustomStreamWrapper.aclose()` body from both installed LiteLLM versions:

| Version | Exact source path | Method line |
| --- | --- | --- |
| 1.102.0, checkout environment | `/Users/texas/Workspace/jev-llmroute-test/.venv/lib/python3.14/site-packages/litellm/litellm_core_utils/streaming_handler.py` | 407 |
| 1.103.2, real acceptance installation | `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/real-post-rework/tools/jev-gateway/lib/python3.12/site-packages/litellm/litellm_core_utils/streaming_handler.py` | 381 |
| 1.103.2, regular installed CLI environment | `/Users/texas/.local/share/uv/tools/jev-gateway/lib/python3.12/site-packages/litellm/litellm_core_utils/streaming_handler.py` | 381 |

Versions were verified through checkout package metadata and installed `litellm-1.103.2.dist-info/METADATA`. These wrappers have `aclose()` and no synchronous `close()` method. Each body detaches `completion_stream`, enters `anyio.CancelScope(shield=True)`, awaits the provider's `aclose()` when present, or invokes the provider's `close()` and awaits a non-null result. It catches provider close failures internally and restores consumer correlation context afterward.

Read `BaseModelResponseIterator.aclose()` in both environments at `litellm/llms/base_llm/base_model_iterator.py:73`: it delegates to an attached `http_response.aclose()`. Also inspected checkout `openai/_streaming.py:123` and `:233`: OpenAI's synchronous stream closes its HTTPX response synchronously; its asynchronous stream awaits response closure. HTTPX distinguishes sync and async byte streams in `_models.py:961` and `:1065`. The gateway now invokes the public wrapper interface and leaves provider/HTTPX resource ownership with the SDK. These source reads establish the interface contract; they do not certify every provider's connection cleanup in a real request.

The checkout has Starlette 1.6.0 and AnyIO 4.15.1. Read `starlette/responses.py` and `starlette/concurrency.py` to confirm synchronous iteration uses AnyIO workers, and `anyio/from_thread.py` plus `anyio/to_thread.py` to confirm the worker-to-loop bridge and cancellation behavior. The route remains `def chat_completions(...)` at `jev_gateway/gateway.py:1298`.

## Code contract

All product paths below are relative to `/Users/texas/Workspace/jev-llmroute-test`.

- `jev_gateway/gateway.py:1527`: async `close_stream_response()` prefers callable SDK `aclose()`, falls back to callable `close()`, and awaits any returned awaitable under cancellation shielding. Its once-only marker is set when a callable interface is selected. Close exceptions retain the existing warning and bounded `_safe_error_type()` without raw exception text.
- `jev_gateway/gateway.py:1555`: if response-capture preparation fails after the upstream stream exists, the synchronous FastAPI worker calls `anyio.from_thread.run(close_stream_response)`. Activity cleanup remains in a `finally` block. No `asyncio.run()` is introduced in runtime code.
- `jev_gateway/gateway.py:1610`: the recorded generator retains outcome observation and failure recording, and no longer calls or marks SDK resource closure. Successful capture still requires SDK exhaustion, a finish reason and successful terminal ASGI delivery. Incomplete exhaustion, SDK failure and interruption never finalize capture.
- `jev_gateway/gateway.py:1662`: `next_stream_body()` holds a lock around one generator advance. `stream_content()` performs that advance in an AnyIO worker. `close_stream_body()` takes the same lock, so cancellation cannot close an executing generator or mutate its SDK resource while `next()` still runs.
- `jev_gateway/gateway.py:1679`: `ActivityStreamingResponse.__call__()` sets the interruption signal, waits off-loop for generator closure, then awaits SDK closure inside its shielded async finalizer. It clears activity and preserves the existing once-only outcome and terminal-delivery checks. SDK failures keep their bounded original error type; interrupted deliveries use `StreamInterrupted`.
- The response-constructor exception path closes the unstarted generator and bridges awaited SDK cleanup back to the ASGI loop with `anyio.from_thread.run()`. It records one unsuccessful `StreamInterrupted` outcome and clears activity.

Cleanup errors remain best effort. A close exception after a fully delivered, exhausted stream does not turn successful delivery into a failed outcome or discard its completed continuation. Provider exception logging, native-model observation, usage/finish metadata, model echo and continuation replay contracts remain as implemented before this rework.

## Regression coverage

`tests/test_stream_evidence.py:62` adds `AsyncSDKStream`, a synchronous iterable with only async `aclose()`. Its close body records entry and loop identity, reaches an async cancellation checkpoint, then increments a separate completed-close counter. Tests assert one entered close and one completed close, so an unawaited coroutine or cancelled cleanup cannot pass by setting a flag. The fixture has no `close()` method. Existing `SDKStream` sync-close cases remain in the same parameterized regressions.

The normal completion matrix still verifies OpenAI/DeepSeek capture, `stop`/`length`, usage-only final chunks, native returned model, requested-model SSE echo, truncation counters and durable continuation replay after store reopen. Terminal delivery coverage checks that capture and outcome are absent while the final ASGI frame is being sent, then finalize once afterward.

Failure coverage runs both close interfaces through SDK failure before completion, SDK failure after stop/usage, incomplete exhaustion, disconnect, response-start failure, ordinary body-send failure, `[DONE]` send failure and terminal empty-frame failure. Every failed stream has no completed assistant capture, one failed outcome and empty activity.

Additional regressions cover:

- `test_cancelled_scope_shields_actual_sdk_close`: a still-cancelled AnyIO scope reaches the SDK's async checkpoint and completes cleanup on the ASGI loop.
- `test_task_cancellation_waits_for_executing_sdk_iterator_before_aclose`: direct asyncio task cancellation leaves a synthetic `next()` blocked in a worker. Closure remains unstarted until that worker is released; the SDK asserts worker exit before `aclose()` starts. The cancelled request saves no continuation and records one interruption outcome.
- `test_route_worker_closes_sdk_if_stream_response_cannot_be_prepared`: capture-construction and response-construction failures use an actual AnyIO worker, close both interface forms once, preserve the preparation exception and clear activity. Response-construction failure retains one interruption outcome; capture-construction failure retains its prior outcome behavior.
- `test_async_sdk_close_failure_is_bounded_and_does_not_mask_delivered_stream`: a close exception produces one type-only warning, omits its synthetic private text and preserves a successfully delivered outcome and continuation.

## Validation commands and results

Commands ran from `/Users/texas/Workspace/jev-llmroute-test`. Pytest used synthetic provider keys, mocked LiteLLM, temporary SQLite/configuration files and in-process ASGI. Dotenv loading and bytecode writes were disabled. Pytest's cache plugin was disabled. Pyright used the existing offline uv tool cache.

Initial focused stream run:

```sh
PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true \
PYTHONDONTWRITEBYTECODE=1 UV_OFFLINE=1 .venv/bin/python -m pytest -q \
  -p no:cacheprovider tests/test_stream_evidence.py
```

Result: **34 passed**, exit 0, 1.15 seconds.

Final focused stream/gateway/activity/continuation/evidence run:

```sh
PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true \
PYTHONDONTWRITEBYTECODE=1 UV_OFFLINE=1 .venv/bin/python -m pytest -q \
  -p no:cacheprovider tests/test_stream_evidence.py tests/test_gateway.py \
  tests/test_activity.py tests/test_sessions.py tests/test_provider_adapters.py \
  tests/test_records.py tests/test_decision.py \
  --deselect=tests/test_gateway.py::test_dashboard_shell_is_content_free_and_data_api_requires_bearer_auth
```

Result: **211 passed, 1 deselected**, exit 0, 3.20 seconds. The deselected test requests the frontend-build fixture. No full-suite or frontend-build run was started by this delegate.

```sh
UV_OFFLINE=1 uvx --offline pyright jev_gateway/gateway.py tests/test_stream_evidence.py
```

Result: **0 errors, 0 warnings, 0 informations**, exit 0.

```sh
git diff --check -- jev_gateway/gateway.py tests/test_stream_evidence.py
```

Result: exit 0. Final source and test bodies were reviewed after these checks.

## Parent handoff

The source fix is ready for independent review and integration. The backend error-handling/quality specs should capture the public async-only SDK close interface and require a fixture that asserts awaited completion; spec edits belong to the parent under the current ownership boundary.

The existing candidate wheel SHA256 `74046d1c13b59f02c1af653980cd2cb36ff069a87e53ee3fb02daeb445d1a274` predates this backend change and cannot certify the final source. Parent work remains: finish its frontend implicit-choice/drawer geometry changes, run integrated checks, build a fresh wheel, verify source/wheel parity, then rerun native/layout, installed-wheel and real-stream acceptance against that artifact. This report claims source-level synthetic validation only.
