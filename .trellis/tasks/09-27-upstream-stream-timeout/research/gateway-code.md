# Gateway streaming failure path

## Scope

Read-only inspection of the current working tree. These findings explain local gateway behavior; they do not establish the upstream server's cause of failure. No application code or configuration was changed.

## Verified code path

- `jev_gateway/gateway.py:106-123`: `ChatCompletionRequest` preserves extra LiteLLM parameters through Pydantic `extra="allow"`. Caller-supplied timeout/retry arguments therefore need checking in recorded upstream payloads, even when the provider has no overrides.
- `jev_gateway/gateway.py:212-248`: `completion_payload` merges request arguments, then provider transport arguments, then the selected provider-qualified model and stream flag. Provider transport overrides matching caller keys.
- `jev_gateway/gateway.py:1222-1257`: the latency timer starts before importing LiteLLM, preparing/recording the payload, and calling synchronous `completion(**payload)`. This measures gateway upstream-path elapsed time, not exclusively network read time.
- `jev_gateway/gateway.py:1260-1298`: an exception before `completion` returns produces a safe HTTP 502 with code `upstream_error` and records a failed outcome.
- `jev_gateway/gateway.py:1315-1372`: after `completion` returns, `recorded_stream` iterates the upstream stream. An iteration exception logs `routing stream failed` with the bounded original class name, logs safe frame locations at DEBUG, removes the untrusted exception cause/context, and raises `RuntimeError("Upstream provider request failed.")`. The response has entered streaming, so this cannot become a fresh JSON 502 response.
- `jev_gateway/gateway.py:1346-1353`: the stream's finally block calls response capture finalization and records `ok`, elapsed latency, and `error_type`. It does not pass usage counts, a chunk count, or a first-token timestamp to `record_outcome`.
- A failure at the first iterator step and a failure after multiple chunks use the same error path. The generic ASGI traceback alone cannot distinguish them.
- There is no gateway-level retry or alternate-model fallback around this call/iteration. This does not imply that LiteLLM or the OpenAI SDK performs no retries before streaming starts.

## Error safety

`.trellis/spec/backend/error-handling.md` requires fixed client-facing errors, NULL persisted provider exception messages, and frame-only DEBUG tracebacks. Raw upstream exception text can contain credentials or request content. Diagnosis must preserve this boundary rather than enable unrestricted LiteLLM verbose logging.

## Existing regression coverage

`tests/test_gateway.py` contains tests for safe immediate upstream failures, bounded exception class names, and an iterator that yields a chunk then raises. A focused invocation checks those existing cases without contacting a real provider. Results are recorded in the final incident analysis.

## Evidence gaps

The gateway does not persist first-byte time, last upstream byte time, chunks sent, transport timeout phase, upstream request ID, or HTTP/proxy status for this stream exception path. Streaming token columns being NULL is not evidence that no output was produced. Provider identity `openai` is a configured label/protocol, not proof that the request was sent directly to OpenAI's public API.
