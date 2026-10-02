The transport and budget investigation is **PASS within its diagnostic scope**. The 128-token paired probe directly observed an upstream budget boundary: both direct HTTP and JEV delivered reasoning only, exhausted all 128 reported reasoning tokens, finished with `length`, and delivered `[DONE]`. The installed SDK and JEV serializer preserved every captured visible and reasoning character during offline replay. No content-loss defect was found in the exercised path.

The real-business acceptance remains **REWORK for nonempty length output**. The previous report's two failed business assertions and all nine attempts remain untouched. The single additional long-output probe at 512 also returned reasoning only and failed its nonempty-length assertion. The three ordinary short-response probes at 512 all passed. These results do not certify the new frontend wheel, publication, or the public installation.

The exact historical 64-token failure cannot be attributed retrospectively from retained data: that harness did not retain reasoning deltas. Its original `length`, zero visible characters, usage `39/64/103`, and failed assertion remain recorded. This investigation's same-shape 64-token direct and JEV calls both produced visible text. The observed upstream boundary at 128 and 512, together with exact SDK/serializer replay, supports budget-sensitive upstream behavior; it does not invent missing evidence for the original 64-token call.

All new programs and evidence are under `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/real-budget-analysis/`. This report is the tester's only repository write. No product, static, Git, operator-runtime, or auth-source edits were made. No delegate was launched.

The reused absolute installed interpreter was `real-post-rework/tools/jev-gateway/bin/python`, Python 3.12.11. The absolute CLI was `real-post-rework/bin/jev`; every invocation supplied the new absolute `--home`. Python ran with `-I -B` from `real-budget-analysis/outside/`. HOME, XDG config/state and JEV runtime paths were isolated. The owned service used `http://127.0.0.1:49898`, separate from port `8000`, and has stopped. No installation or dependency change was needed; `UV_OFFLINE` was unset in the projected execution environment.

Installed versions were jev-gateway 0.1.0, LiteLLM 1.103.2, OpenAI 2.54.0 and HTTPX 0.28.1. Installed and current `jev_gateway/gateway.py` were identical at preflight, SHA256 `6e878c7e5c53bb3b75aedd18c84994d029f0aefc201e142c7d9c40069e0c5b77`. The reused installation belongs to the earlier wheel SHA256 `74046d1c13b59f02c1af653980cd2cb36ff069a87e53ee3fb02daeb445d1a274`. During final verification, concurrent work changed the checkout's gateway to SHA256 `398aabaeb6a0e566c85b88932b48966b015d4c16ee12a13ed39169632aed480f`, including stream cleanup and cancellation handling. The installed tested backend remained unchanged. AST comparison confirmed `completion_payload()`, `response_data()` and `sse_chunks()` were unchanged in that current source. This investigation certifies the tested diagnostic path and makes no acceptance claim about the later backend or new frontend artifact.

The runtime started from the installed empty template and used normal local management-key setup, provider SAVE, explicit confirmed model import, and global-default SAVE. The private connection and import handoff were read in code and copied into protected new files. No auth refresh or protocol substitution occurred. The route remained `real-acceptance/deepseek-flash`, provider type `openai`, native model `deepseek-flash`, empty model tags and explicit global-default source.

Exactly eight external generation calls ran, consuming the authorized cap: two paired short-budget probes (four calls), three ordinary 512-token strategy probes, and one optional bounded long-output probe. There were no retries or further calls after the optional assertion failed. The historical failed prompts were harmless synthetic single-user messages and were reused privately for their corresponding pairs. The ordinary probes reused the 64-token prompt shape. The optional probe requested repetitive harmless visible output. Request messages, generated text, raw reasoning, upstream endpoint and credential values are omitted here.

| New call | Budget | JSON chunks | Reasoning characters | Visible characters | Finish / DONE count | Input/output/total tokens | Reported reasoning tokens |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |
| `pair64-direct` | 64 | 16 | 40 | 4 | stop / 1 | 39/15/54 | 12 |
| `pair64-jev` via economy | 64 | 21 | 62 | 4 | stop / 1 | 39/19/58 | 16 |
| `pair128-direct` | 128 | 130 | 535 | 0 | length / 1 | 49/128/177 | 128 |
| `pair128-jev` via task_aware | 128 | 131 | 524 | 0 | length / 1 | 49/128/177 | 128 |
| `ordinary-task_aware` | 512 | 30 | 86 | 4 | stop / 1 | 39/28/67 | 25 |
| `ordinary-quality` | 512 | 37 | 124 | 4 | stop / 1 | 39/35/74 | 32 |
| `ordinary-economy` | 512 | 19 | 53 | 4 | stop / 1 | 39/17/56 | 14 |
| `bounded-visible-length` via task_aware | 512 | 515 | 2155 | 0 | length / 1 | 51/512/563 | 512 |

Every call returned HTTP 200 with `text/event-stream`, one `[DONE]`, EOF, zero error events, zero invalid events and zero events after DONE. The decoder consumed the complete stream through EOF. `analysis`, `thinking` and `reasoning` text lengths were independently zero in all eight streams; the observed reasoning text came from `delta.reasoning_content`. Aggregate upstream-reported usage was 344 input, 882 output and 1226 total tokens. No billing claim is made.

Source delta keys were counted separately from nonempty text. The table below lists occurrences, including empty values; nonempty content chunks were two for each visible response and zero for each empty response.

| Call | `role` occurrences | `content` occurrences | `reasoning_content` occurrences | Nonempty reasoning chunks |
| --- | ---: | ---: | ---: | ---: |
| `pair64-direct` | 1 | 16 | 16 | 12 |
| `pair64-jev` | 1 | 2 | 17 | 16 |
| `pair128-direct` | 1 | 130 | 130 | 128 |
| `pair128-jev` | 1 | 0 | 129 | 128 |
| `ordinary-task_aware` | 1 | 2 | 26 | 25 |
| `ordinary-quality` | 1 | 2 | 33 | 32 |
| `ordinary-economy` | 1 | 2 | 15 | 14 |
| `bounded-visible-length` | 1 | 0 | 513 | 512 |

The pair members are separate real generations. Their reasoning text and chunk counts may differ. Exact text equality is established by replaying the same captured direct stream, not by comparing those independent generations.

The relevant SDK semantics were verified against the installed version and observed request body. `gateway.completion_payload()` preserves the client's `max_tokens`; the profile contributes `timeout: 35` and `num_retries: 0`, and uses SDK model `openai/deepseek-flash`. Both historical failed submissions and all six new JEV submissions had `max_tokens`, `messages`, `stream`, `stream_options`, `model`, `api_base`, `api_key`, `timeout` and `num_retries`. They had no `max_completion_tokens` or `reasoning_effort`. Every new stored budget and message list matched the actual client request. No client token limit was overridden.

LiteLLM's installed `OpenAIGPTConfig.map_openai_params()` and `transform_request()` supplied the direct HTTP body. Its keys were exactly `model`, `messages`, `max_tokens`, `stream`, and `stream_options`; `include_usage` was true. The endpoint remained the authorized base plus `/chat/completions`. The OpenAI transport treats timeout and retries as client settings rather than body fields. Offline interception of the actual installed SDK request proved full body equality with each direct request, including the private messages and token limit. The `openai/` SDK selector became the native wire model. Sources are installed `litellm/llms/openai/chat/gpt_transformation.py:220` and `:477`, `litellm/llms/openai/openai.py:1013` and `:1189`, and `jev_gateway/gateway.py:243`.

Offline replay made zero external requests. A local HTTPX MockTransport returned each protected captured upstream SSE stream to the installed OpenAI client and actual `litellm.completion()`. The returned iterator passed through installed `gateway.sse_chunks()` with its native observation callback. The replay did not change live transport or product code. It proves these serializer and SDK properties for real captured source frames:

| Captured source | Raw / SDK / serialized visible characters | Raw / SDK / serialized reasoning characters | Raw / serialized JSON chunks | Exact text equality | Finish and usage |
| --- | --- | --- | --- | --- | --- |
| 64-token direct stream | 4/4/4 | 40/40/40 | 16/17 | Passed for all measured fields | stop, 39/15/54, reasoning 12 preserved |
| 128-token direct stream | 0/0/0 | 535/535/535 | 130/131 | Passed for all measured fields | length, 49/128/177, reasoning 128 preserved |

All SDK choices/deltas were exactly equal before and after JEV serialization. Native model remained available to the observation callback before the virtual-model echo. SDK normalization omitted empty content/reasoning values and adjusted finish/usage framing. It also normalized provider-specific prompt-cache usage fields, while preserving input/output/total and reasoning-token counts. JEV's `response_data()` and `sse_chunks()` did not drop observed text. The first offline run encountered a tester-only `AttributeError` when calling a nonexistent `CustomStreamWrapper.close()`. That log is preserved; the harness now uses the same optional callable close check as JEV. Repeating offline replay added no real generation calls and did not change any failed business assertion.

Post-shutdown correlation used each actual `X-JEV-Request-Id` and decision/session headers privately, retaining the real IDs only in protected correlation files. All six JEV outcomes matched delivered finish and input/output/total counts, had `ok: true`, native `returned_model: deepseek-flash`, and null error type. All six decisions retained exact global route, tier `default`, `defaulted: true`, and the active configuration hash. Stored SDK credentials were redacted; actual credential values were absent from the database. These completed transport outcomes do not imply successful nonempty business assertions.

| New durable table | Rows |
| --- | ---: |
| requests | 6 |
| decisions | 6 |
| outcomes | 6 |
| upstream_requests | 6 |
| assistant_continuations | 4 |

The 64-token JEV response and the three ordinary 512-token responses each had one continuation matching the exact actual visible assistant key and provider origin `openai`. The two empty JEV length responses had zero continuation rows. This checks successful response capture separately from outcome metadata and rules out a missing continuation for the new nonempty responses. A new same-session network followup was not added: the previous nine-attempt evidence already verifies supplied-assistant followups across service/store restarts and remains byte-identical.

The diagnostic results contain 67 passing checks and one preserved failed check, `single_optional_length_has_visible_length_done`. The ordinary short-answer strategy check passed for all three strategies with the configured 512 budget. The long-output check failed because the endpoint reported all 512 completion tokens as reasoning tokens and supplied zero visible characters. No fallback text, reasoning-to-answer merge, token override or retry was introduced. The original report remains REWORK with two failed assertions, seven continuations and nine outcomes. A product rework request would require evidence of lost source content; this investigation found none. A real nonempty `length` example remains an acceptance gap for the parent to acknowledge.

The six installed CLI invocations exited as expected: init, validate, start, running status and stop exited 0; final status exited 4 with `not_running`. The owned PID exited, the owned port closed, SQLite integrity was `ok`, and private logs contained no actual credentials. A snapshot of 8980 existing evidence/package/auth files remained unchanged after both live calls and offline replay. New directories are mode `0700`; new files, including runtime credentials, raw SSE, messages and correlation data, are mode `0600`. Actual credential values occur only in the expected protected connection, management-key, runtime `.env`, and configuration-transaction `.env.backup` files. Raw captures remain protected to reproduce the parser and serializer comparisons. No raw response or reasoning is included in this report.

The first final verification preserved two findings: its expected-file list omitted the normal protected `.env.backup`, and the current source no longer matched the installed backend. The corrected final projection explicitly includes the transaction backup and records the source divergence as an observation while checking the unchanged installed digest and payload/serializer functions. The initial verification is preserved in `final-verification-initial.json`. Neither correction changes a generation result, failed business assertion or tested artifact identity.

The external work began at `2026-10-02T12:29:22.714452+00:00`; post-stop verification completed at `12:31:05.197272+00:00`, and successful offline replay verification completed at `12:33:27.575949+00:00`. Evidence paths relative to the new protected root are:

- `preflight.json`: historical failure projections, backend identity, exact call cap and preservation count.
- `results.json`: all eight new aggregate results, 67 passing checks, the failed optional business assertion, six correlated durable outcomes, offline comparisons and explicit diagnostic/business scope.
- `final-verification.json`, `final-verification-initial.json`: final cleanup, secret-file and preservation checks, current source divergence, and the preserved initial verifier findings.
- `private/current-backend-diff.patch`: captured installed/current backend difference, retained for the parent without modifying either file.
- `preflight.py`, `probe.py`, `replay.py`: bounded acceptance programs. Generation stages refuse duplicate call names. Do not rerun them over existing evidence.
- `private/preservation-before.json`: hashes of the previous evidence, installed package and relevant auth sources. Read privately.
- `private/connection.json`, `private/import-model.json`, `private/management-key`, `private/probe-seeds.json`: protected connection/import/setup and synthetic prompt handoffs. Never print.
- `private/*-request.json`, `private/*.sse`, `private/*-correlation.json`: private requests, complete raw SSE and actual message/request/decision/session correlation. Inspect only in code and emit aggregates.
- `private/verify-stdout.log`, `private/replay-stdout.log`, `private/replay-first-stderr.log`: protected verification output and preserved initial offline harness failure.
- `runtime-home/jev-records.sqlite3`: six real JEV request/decision/outcome/submission rows and four durable continuations after service shutdown.

Publication, the parent's new wheel/frontend acceptance and operator reset remain outside this tester's scope. Full source/browser regressions and the previous 51 configuration assertions were not rerun.
