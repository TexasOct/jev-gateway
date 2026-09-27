# Incident analysis: four long-lived stream timeouts

## Executive finding

The evidence confirms four streamed requests to configured provider `openai`, model `gpt-6-luna` (`openai/gpt-6-luna` in the LiteLLM payload), through API base `https://claude.texasoct.tech/v1`. They started over about 39.9 seconds and all failed within about 62 ms near 23:47:41 UTC+08:00, after 620.6–660.5 seconds. The requests had no saved per-call or provider timeout/retry overrides.

The installed LiteLLM version in this checkout defaults this path to a **600-second HTTPX read timeout per blocking read**, not a 600-second total request limit. If all four streams stopped receiving bytes near 23:37:41, they could have reached that read timeout together at 23:47:41. That fits the measured timing, but no last-read timestamps were captured, so it remains a hypothesis.

A short power-log check found only display-sleep assertions at the failure time; it found no system Sleep/Wake/DarkWake transitions in the checked interval. Machine sleep is unsupported as an explanation. Nearby successful calls to the same endpoint/model show the incident was not a persistent total outage, though they cannot rule out a transient backend, proxy, or connection-specific stall.

**Root cause is unconfirmed.** The evidence points to a shared timing/stall condition. It does not identify whether that was in the reverse proxy, network path, or upstream service. Do not interpret the gateway's ASGI `RuntimeError` as an independent application failure.

## Failure sequence

1. Gateway calls synchronous `litellm.completion(**payload)` and receives a stream iterator.
2. Starlette begins sending the response; `recorded_stream` advances that iterator in a worker thread.
3. Iterator advancement raises LiteLLM `Timeout` (the original cause was intentionally not preserved in the supplied ASGI traceback).
4. Gateway records `ok=0`, elapsed latency, `error_type=Timeout`, and a null error message, then raises the fixed message `RuntimeError("Upstream provider request failed.")`.
5. Since streaming headers have already been sent, Starlette/Uvicorn logs an ASGI exception rather than returning a new JSON 502. The traceback shows this generic wrapper at `jev_gateway/gateway.py:1345`, not the underlying timeout trigger.

The installed OpenAI adapter allows two retries while opening the request by default, but its iterator does not restart a stream once returned. The timeout during stream consumption was not automatically retried by that adapter. Incident-time installed package versions and process settings were not preserved, so this behavior is established for the inspected checkout, not conclusively for the historical process.

## What the records establish

- All four decision IDs join to saved decision, upstream-request, and outcome rows.
- All are `stream=1`, `ok=0`, `error_type=Timeout`, and `error_message=NULL`.
- Stored latencies: 620.615, 660.528, 631.870, and 659.898 seconds. Their timestamps are recorded in `research/runtime-evidence.md`.
- All use the same config hash and saved endpoint. Config snapshot provider `params` and `param_env` are empty. The five-second `decision.timeout_seconds` is not the chat request timeout.
- Payloads contain no timeout or retry overrides. Null usage/token fields do not tell us whether a partial stream was sent; chunk/first-byte/last-byte information was not recorded.
- Other requests to `gpt-6-luna` succeeded immediately around this interval. This argues against a sustained total outage, not a transient common service/proxy stall.

## What remains unknown

The process-resolved HTTP timeout components and retry policy at incident time, the exact installed versions then running, the original exception/cause chain, whether stream bytes were received, the last successful upstream read time, HTTP version/connection grouping, and upstream/proxy status or request IDs are missing. Without these, a shared idle-read timeout, proxy deadline, upstream backend stall, or a distinct local timeout cannot be distinguished.

## Recommended next steps

1. Ask the operator of `claude.texasoct.tech` to correlate the four calls by timestamp/model and safe request identifiers, checking upstream/proxy status and connection termination around 23:37:41–23:47:41 UTC+08:00.
2. If the event recurs, record at request submission the resolved connect/read/write/pool timeout values, retry count, `LITELLM_MAX_STREAMING_DURATION_SECONDS`, package versions, and selected transport protocol. Add first-byte and last-byte timing plus a chunk count; retain neither prompt/body data nor credentials.
3. Preserve only safe original exception class/cause categories or transport status details for streams. Do not enable raw LiteLLM debug dumps or expose provider exception messages, which may carry credentials or user content.
4. Avoid raising the timeout or adding automatic replay as an immediate mitigation. A longer read timeout only waits longer through an idle stream, and replay can duplicate cost or produce duplicate/partial output. Consider an explicit per-read timeout or keepalive policy only after the proxy/upstream owner confirms the relevant behavior.

## Verification performed

- Read-only SQLite correlation and saved snapshot/payload inspection.
- Installed-source inspection and isolated HTTPX MockTransport probes, with socket/DNS access blocked; zero network attempts.
- Existing tests: `.venv/bin/python -m pytest -q tests/test_gateway.py::test_upstream_failure_does_not_persist_or_log_provider_exception_text tests/test_gateway.py::test_stream_failure_has_safe_logs_and_null_persisted_message tests/test_gateway.py::test_upstream_failure_bounds_exception_type` → `3 passed in 0.12s`.
- No live provider request or application-code/configuration change.
