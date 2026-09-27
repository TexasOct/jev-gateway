# Investigate upstream streaming timeout failures

## Goal and user value

Determine, from the supplied logs and available project evidence, why concurrent streaming requests to the configured OpenAI provider timed out, and distinguish gateway behavior from upstream/network behavior. Record concrete follow-up actions without changing application code unless separately approved.

## Confirmed evidence

- On 2026-09-26 around 23:47:40–23:47:41, multiple routing streams for provider `openai`, model `gpt-6-luna`, logged `error_type: Timeout`.
- The logs show different decision IDs, indicating multiple requests failed in the same short interval.
- In `jev_gateway/gateway.py`, `recorded_stream` catches an exception while iterating the upstream response, logs a safe error type, finalizes response capture and outcome recording, then raises the generic `RuntimeError("Upstream provider request failed.")`.
- Starlette/ASGI subsequently logs that generic RuntimeError while streaming the response. This traceback is a consequence of the upstream stream failure, not its root cause.
- The repository-local `jev-records.sqlite3` contains all four listed decision and outcome rows. Each is `ok=0`, `error_type=Timeout`, `error_message=NULL`; latency is 620.615–660.528 seconds (average 643.2 seconds). The four decision timestamps are between 23:36:40 and 23:37:20 UTC+08:00; outcomes completed about 10–11 minutes later, matching the supplied log times.
- The incident decisions reference config hash `db3018290cfcefc4971288d9f4cd585b`. Its saved `config_versions` snapshot (captured 2026-09-24) specifies provider `openai`, type `openai`, API base `https://claude.texasoct.tech/v1`, with no provider timeout/retry parameters or environment-mapped provider params. The selected model has no timeout/retry fields. The current `models.json` also has empty provider `params` and `param_env` for this provider, but is not proof of runtime values at the incident.
- The gateway request model permits extra LiteLLM parameters. All four stored upstream request payloads were inspected for `timeout`, `request_timeout`, `stream_timeout`, `max_retries`, `num_retries`, and `retry`; none of those keys was present.
- The supplied traceback and outcome rows do not preserve raw provider exception text, chunk count, first-byte timing, last-byte timing, HTTP status, or proxy/upstream request identifiers. They cannot establish whether the timeout came from an idle read timeout, a service/edge timeout, a network interruption, or another local timeout wrapper.
- A `pmset` check found display-sleep assertions at 23:47:41–42, but no system sleep/wake event in the checked window; this does not support machine sleep as the cause.
- In the installed LiteLLM 1.102.0 path, absent overrides resolve to a 600-second timeout passed as a scalar to OpenAI/HTTPX, which applies 600 seconds per connect/read/write/pool operation. During HTTP/1.1 streaming, read timeout is per blocking read, not total request duration. An idle read timeout is compatible with, but does not prove, a common stall affecting the four streams. There is no evidence that these requests shared one TCP connection.
- The installed OpenAI adapter defaults to two retries before a stream is returned. Those retries do not restart an already-returned stream. Incident process versions/settings are not retained, so these installed defaults are not proof of effective incident values.

## Scope

- Correlate all supplied decision IDs with retained local decisions, upstream submissions, outcomes, and configuration snapshot.
- Inspect gateway stream error handling and the exact installed LiteLLM/OpenAI/HTTPX timeout and retry behavior for the synchronous OpenAI streaming path; verify behavior offline.
- Identify verified facts, compatible hypotheses, ruled-out explanations, remaining evidence needs, and safe next steps.

## Out of scope

- Do not change gateway timeout, retry, logging, or response behavior in this investigation.
- Do not retry upstream requests or access external provider credentials/services.
- Do not infer provider availability or model validity from the model name alone.

## Acceptance criteria

1. Explain the failure sequence, including why the ASGI RuntimeError appears and why it is not sufficient root-cause evidence.
2. Trace the effective timeout/retry configuration for the affected provider request, or state precisely which configuration source/value is unavailable.
3. Correlate decision IDs with retained gateway outcomes/logs if those records are available, without exposing secrets or request content.
4. Separate verified conclusions from hypotheses and list the minimal additional evidence needed to distinguish upstream latency from gateway/network timeout.
5. Record safe, practical next steps; make no product-code changes.

## Evidence limits and deliverables

The retained SQLite records and installed dependency sources answer the local behavior questions. Incident-time safe DEBUG tracebacks, resolved transport settings, and first/last-byte timings are unavailable. A definitive upstream/proxy root cause requires evidence from the configured endpoint; this limitation does not authorize live requests or configuration changes.

Reports: `research/gateway-code.md`, `research/runtime-evidence.md`, `research/dependency-timeouts.md`, and `research/analysis.md`. Three existing credential-safe gateway error regression tests passed locally. No application code, provider configuration, or upstream service was changed.
