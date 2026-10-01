# Installed dependency timeout analysis

## Scope and limits

Inspected installed sources under `/Users/texas/Workspace/jev-llmroute-test/.venv/lib/python3.14/site-packages/` (all references below are relative to this root). Distribution metadata confirms LiteLLM 1.102.0, OpenAI 2.54.0, HTTPX 0.28.1, httpcore 1.0.9, Starlette 1.6.0. This establishes this checkout's behavior, not incident-process versions or settings. No runtime environment values, provider configuration, request data, logs, or database were read.

Scope: ordinary synchronous `litellm.completion(model='openai/gpt-6-luna', api_base=custom URL, stream=True)`. Provider `openai` reaches `_complete_custom_openai` (`litellm/main.py:5749-5775`). Explicit Responses bridging or `EXPERIMENTAL_OPENAI_BASE_LLM_HTTP_HANDLER` changes this path (`litellm/main.py:1060-1063,2596-2636`); incident overrides remain unknown.

## Timeout resolution

`completion()` defaults `timeout=None`, resolves it, then stores it in `ctx.timeout` (`litellm/main.py:5003,5373-5380,5658-5687`). Resolution precedence is:

1. Explicit call/model `timeout`.
2. `kwargs['timeout']`.
3. `kwargs['request_timeout']`.
4. Explicit global `litellm.request_timeout`.
5. **600.0 seconds** when none was configured.

Evidence: `litellm/litellm_core_utils/completion_timeout.py:17-69`. OpenAI preserves an explicit `httpx.Timeout` object (`litellm/utils.py:2439-2448`).

The package global's **6000.0** default is a sentinel, not this chat path's default. `REQUEST_TIMEOUT` explicitly sets the global; a runtime global differing from 6000 also counts as explicit. Explicit 6000 is honored when the explicit-set flag is true (`litellm/constants.py:505-521`; `litellm/litellm_core_utils/request_timeout_resolver.py:20-29`). Provider-config omission alone cannot establish the incident's effective timeout.

LiteLLM passes the resolved value both to `OpenAI(...)` and per-request `.create(..., timeout=timeout)` (`litellm/llms/openai/openai.py:425-444,506-520,1031-1057`). Thus this path's default scalar becomes **connect/read/write/pool = 600 seconds each** (`openai/_base_client.py:606-617`; `httpx/_client.py:370-377`; `httpx/_config.py:117-138`). OpenAI's standalone default `Timeout(600, connect=5)` (`openai/_constants.py:8-10`) does not supply a 5-second connect limit here.

HTTP/1.1 reads reuse the read timeout for each blocking network read; socket code sets that timeout before `recv` (`httpcore/_sync/http11.py:196-219`; `httpcore/_backends/sync.py:124-128`). This is a read-operation inactivity limit, not a request-wide deadline. Total stream age can exceed 600 seconds. Network bytes, including SSE comments, can keep reads progressing without yielding application content.

## Retries and exception conversion

The ordinary OpenAI adapter defaults `max_retries` to **2**, yielding up to **3 opening attempts** (`litellm/llms/openai/openai.py:709-712,771-773`). Caller `num_retries` overrides `max_retries`; Router-tagged calls set it to zero (`litellm/main.py:5308-5312`). SDK opening timeout/connection retries occur around request sending; HTTP 408/409/429/5xx are also ordinarily retryable, subject to response headers. Backoff is exponential with jitter; accepted `Retry-After` values can override it (`openai/_base_client.py:797-860,1055-1159`). HTTPX transport retries default to zero (`httpx/_transports/default.py:142-147`). LiteLLM's additional wrapper retries require configuration; `litellm.num_retries` defaults to `None` (`litellm/__init__.py:533`; `litellm/utils.py:1766-1795`).

**Those retries do not restart an already-returned stream.** OpenAI's stream iterator reads response bytes without a retry loop (`openai/_streaming.py:45-63,109-111`). LiteLLM returns the stream before external iteration (`litellm/utils.py:1686-1709`).

The cited `streaming_handler.py:2228` HTTPX timeout clause belongs to **async `__anext__`**. Sync `__next__` catches generic exceptions and invokes `_handle_stream_fallback_error` (`litellm/litellm_core_utils/streaming_handler.py:1914-1931,2101-2106,2398-2470`). HTTPX preserves the lower-level exception's text (`httpx/_transports/default.py:96-128`). LiteLLM's mapping depends on that text:

- `The read operation timed out` maps to `litellm.Timeout` (`litellm/litellm_core_utils/exception_mapping_utils.py:2406-2420`). Its synthetic status 408 makes the stream handler raise it directly (`litellm/exceptions.py:355-374`; `streaming_handler.py:2452-2460`).
- Bare `timed out` or an empty message can map to `APIConnectionError`, then `MidStreamFallbackError` (`exception_mapping_utils.py:488-499`; `streaming_handler.py:2462-2469`). That wrapper enables Router fallback; it performs no retry itself.

## Optional duration cap and Starlette

`LITELLM_MAX_STREAMING_DURATION_SECONDS` defaults to **None**, meaning no cap (`litellm/constants.py:84-90`). When configured, elapsed wall time starts at wrapper creation, after the opening request on this path. Sync checks occur at entry to `__next__`; they cannot interrupt a blocked read (`litellm/llms/openai/openai.py:1052-1068`; `streaming_handler.py:249,323-336,1918`). Starlette's stream iteration adds no 600-second timer (`starlette/responses.py:222-281`; `starlette/concurrency.py:41-59`).

## Offline verification

Isolated subprocesses used a minimal synthetic environment, local cost-map mode, disabled telemetry/logging callbacks, socket/DNS blockers, and HTTPX MockTransport. Both exited 0; network attempts were zero. Full LiteLLM calls confirmed timeout fields 600/600/600/600 and SDK retries 2. After one synthetic chunk, SSL-style timeout text produced `Timeout`; bare/empty text produced `MidStreamFallbackError(APIConnectionError)`. Each made exactly one request. An SDK pre-header timeout made three attempts. Resolver precedence and synthetic cap expiry also passed. No live provider calls occurred.

## Incident interpretation

Supplied durations 620.615, 660.528, 631.870, 659.898 seconds exceed 600 by 20.615, 60.528, 31.870, 59.898 seconds. Failures within roughly 55ms at 23:47:40.98 despite a 39.913-second age spread argue against identical independent 600-second deadlines from request start.

A common stall followed by 600-second read expiry is consistent: blocked reads would begin near 23:37:40.98. It is unproven. Scheduling delay, an enabled duration cap, upstream timeout responses, or differing overrides remain possible. HTTP/2 can propagate one read failure to shared streams (`httpcore/_sync/http2.py:433-455`), but the default sync client has HTTP/2 disabled (`litellm/llms/openai/common_utils.py:331-346`; `httpx/_client.py:648-650`). Shared HTTP/2 must not be assumed.

Needed evidence: incident versions, sanitized resolved timeout components/cap/retry settings, request/header/last-network-read timestamps, original exception classes and cause chain, attempt counts, and negotiated HTTP version/connection correlation. `Timeout` alone cannot distinguish provider slowness from network/proxy failure or an application duration cap.
