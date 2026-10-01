# Runtime evidence: upstream stream timeouts

## Sources and scope

The repository-local `jev-records.sqlite3` retains all four incident decisions, upstream request submissions, and outcomes. SQLite connections used read-only URI mode. JSON was processed locally and only selected safe metadata was emitted; no credentials, message content, tool arguments, or response bodies are included here. Times below use explicit UTC+08:00, matching the supplied gateway logs.

## Incident records

| Decision ID | upstream submission, September 26 | outcome recorded | elapsed seconds |
| --- | --- | --- | ---: |
| `dec-626e49b83a2f455f` | 23:36:40.483 | 23:47:41.005 | 660.528 |
| `dec-6f7e2e8e5b264e10` | 23:36:41.148 | 23:47:41.046 | 659.898 |
| `dec-c15c9a8800e04947` | 23:37:09.175 | 23:47:41.039 | 631.870 |
| `dec-b6b93844bc2a40bf` | 23:37:20.373 | 23:47:40.984 | 620.615 |

The submission spread is about 39.9 seconds; outcome timestamps span about 62 ms. These are outcome-recording times, which differ slightly from the preceding gateway error-log times. Mean elapsed time is 643.228 seconds. All four have `stream=1`, `ok=0`, `error_type=Timeout`, and `error_message=NULL`.

The gateway starts its elapsed timer before preparing and submitting the upstream call, so this is not an isolated network-read measurement. Its streaming outcome path does not record first-byte time, last-byte time, chunk counts, or usage. Null token columns therefore do not establish that the streams produced no content.

## Incident configuration and request evidence

All four decisions reference config hash `db3018290cfcefc4971288d9f4cd585b`. The saved configuration snapshot was captured at 2026-09-24 15:01:38.919 UTC and identifies `/Users/texas/Workspace/jev-llmroute-test/models.json` as its source.

The snapshot specifies provider ID/type `openai` and API base `https://claude.texasoct.tech/v1`, with empty provider `params` and `param_env`. Stored upstream request metadata also identifies this endpoint. Thus `openai` in the gateway log denotes the configured provider/protocol; it does not establish a direct request to OpenAI's public API. The separate home-directory catalog is not the incident's configuration evidence.

The four stored upstream payloads have no `timeout`, `request_timeout`, `stream_timeout`, `max_retries`, `num_retries`, or `retry` override. Current provider configuration also has no such transport settings, but current configuration alone cannot prove historical process state. The five-second `decision.timeout_seconds` is a classifier/decision-provider setting, not the chat upstream stream timeout.

See `dependency-timeouts.md` for the installed synchronous LiteLLM path. The absence of recorded overrides supports its default-timeout explanation, but historical environment/global overrides and incident-process versions are not captured in these records.

## Nearby outcomes, independently checked

An exact window from 20 seconds before the earliest incident outcome through 20 seconds after the latest contains:

- Four failed `openai/gpt-6-luna` outcomes, all `Timeout`.
- Four successful `openai/gpt-6-luna` outcomes, with elapsed times 20.535–53.249 seconds.
- One successful `openai/gpt-6-sol` outcome.

A broader fixed interval, September 26 23:20–23:50 UTC+08:00, contains 118 successful `gpt-6-luna` outcomes (8.1–185.5 seconds, mean 44.2 seconds), the four incident timeouts, 16 successful `gpt-6-astra`, 16 successful `gpt-6-sol`, and two successful `deepseek-flash` outcomes.

These are retained outcome counts. They do not measure all provider traffic, but they argue against a persistent blanket failure of this model or endpoint. Successful neighboring requests do not rule out a stalled subset of connections or an upstream backend pool problem.

## Log and power evidence

The retained repository gateway log files predate September 26 and contain no matching incident decision IDs. They do not provide the original safe DEBUG traceback for this event.

A separate power-log check parsed the event-class field rather than searching for the substring `Sleep`. The entries at 23:47:41 and 23:47:42 are `Assertions` mentioning `PreventUserIdleDisplaySleep`. There are no actual `Sleep`, `Wake`, or `DarkWake` entries in the checked 23:35–23:49 window. These assertions provide no evidence that machine sleep caused the timeouts. The earlier investigator's substring classification was rejected.

## Interpretation and remaining evidence

Verified: four long-lived streaming calls to the same configured endpoint/model ended together, despite different submission times. Other calls to that model succeeded nearby. None of the saved requests specifies a timeout or retry override.

Not established: whether the four streams emitted bytes, when each last received network data, whether a proxy/backend shared stall occurred, the original transport exception/cause chain, or the incident process's resolved timeout configuration.

Under the installed default of 600 seconds per blocking read, a common read stall beginning near 23:37:41 would fit failures near 23:47:41. This time is inferred by subtraction, not an observed last-byte timestamp. Correlate proxy/backend logs over 23:36:40–23:47:41, especially around 23:37:41, before attributing the event to an upstream service or network component.

## Reproduction notes

- Join `decisions`, `upstream_requests`, and `outcomes` by the four supplied IDs, selecting timestamps, provider/model, stream flag, success, latency, and bounded error type.
- Look up `config_versions` by the decisions' config hash. Print only source, capture time, provider type, safe endpoint host/path, and timeout/retry settings.
- Parse stored upstream payloads in memory and inspect only allowlisted timeout/retry fields.
- Aggregate nearby outcomes with explicit epoch bounds and explicit UTC+08:00 conversion. Do not use an ambiguous timezone abbreviation such as CST.
- For power logs, retain timestamp, numeric UTC offset, event class, and selected assertion labels only. Display-sleep assertions are not system sleep transitions.
