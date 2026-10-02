The new installed-wheel real upstream acceptance is **REWORK**. The repaired stream persistence passes: after shutdown, all nine outcomes retain native model `deepseek-flash`, finish reason, input/output/total tokens and `ok: true`; seven assistant continuations remain durable. Two bounded real streams ended with `length` and `[DONE]` but no assistant text, so their nonempty-response assertions remain failed. Later successes do not replace those failures. This report does not approve publication.

The tester wrote only this report inside the repository. All acceptance programs, installations, private connection data and evidence are under `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/real-post-rework/`. Product code, operator runtime and auth source files were preserved. No other agent was launched.

The tested artifact is `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/post-rework-dist/jev_gateway-0.1.0-py3-none-any.whl`, SHA256 `74046d1c13b59f02c1af653980cd2cb36ff069a87e53ee3fb02daeb445d1a274`. Installation through isolated `uv tool install --force --python <private-managed-python> --managed-python <wheel>` took 11653.94 ms and exited 0. `UV_OFFLINE` was explicitly unset. The interpreter was copied from the earlier acceptance's known managed Python directory into the new sandbox; the package and tool environment were installed fresh from the new wheel.

All 54 `jev_gateway/` wheel files matched both the installed package and the current checkout at installation. They still matched after shutdown. The sorted package manifest digest is `f0dab5d4f55e008c495af3fd62474fbdf6fd7314d11ca5166244f5313b46e9a4`. Tested `jev_gateway/gateway.py` SHA256 is `6e878c7e5c53bb3b75aedd18c84994d029f0aefc201e142c7d9c40069e0c5b77`. Source HEAD was `16929b38d780bd04385fecb9aaa76d824acf04c7` with the task's changes present; the package parity and digests identify those tested bytes more precisely than HEAD alone.

| Package | Installed version |
| --- | --- |
| Python | 3.12.11 |
| jev-gateway | 0.1.0 |
| litellm | 1.103.2 |
| fastapi | 0.142.2 |
| starlette | 1.7.0 |
| uvicorn | 0.54.0 |
| httpx | 0.28.1 |
| pydantic | 2.13.5 |
| openai | 2.54.0 |

Installed package origin was `real-post-rework/tools/jev-gateway/lib/python3.12/site-packages/jev_gateway/__init__.py`. Every CLI/service invocation used the absolute installed executable `real-post-rework/bin/jev`, and acceptance Python used the absolute installed tool interpreter. Commands ran from `real-post-rework/outside/`, with `PYTHONPATH`, `PYTHONHOME`, inherited virtual-environment settings and inherited `JEV_*` variables removed. UV tool/bin, managed Python, cache, XDG config/state and HOME paths were isolated. The actual service used `http://127.0.0.1:53915`, separate from port `8000`.

The private connection was copied from the explicitly authorized `real-stream/private/connection.json`. It retained the existing `openai-completions` transport, configured as JEV provider type `openai`, upstream model `deepseek-flash`, canonical ID `real-acceptance/deepseek-flash`. The endpoint passed HTTPS/hostname/userinfo/query/fragment validation; endpoint and credential values are omitted. Relevant original Pi model/auth files were hashed privately without parsing their auth contents. Both hashes remained unchanged. All 27 hashed earlier evidence files remained byte-identical, including the earlier report's failed-stream evidence and protected connection. No old harness was executed.

Actual configuration and business coverage was as follows:

| Flow | Observed result |
| --- | --- |
| Empty packaged template initialization and installed service startup | Passed. No LLM providers, models, decision-provider instances or upstream assignments; `task_aware`, `quality`, `economy` retained. |
| Actual `GET /v1/setup` and same-origin local `POST /v1/setup` | Passed. Protected printable ASCII management key activated; authorized HTTP reconnect worked; `.env` mode `0600`. |
| Real provider SAVE before models | Passed. Validate preserved file bytes; PUT advanced the revision and activated a credentialed provider with zero models. Setup advanced to the model step. |
| Actual upstream discovery | Passed. HTTP 200, supported and complete, two candidates, authorized model present, zero warnings, no configuration/evidence writes. |
| Actual metadata lookup | Completed with no applicable public metadata. One lookup item, zero sources/known fields, `metadata_not_found` and `serving_endpoint_unmatched`; no configuration/evidence writes. |
| Explicit confirmed model import | Passed. One discovered model imported with `confirmed: true`, a manual confirmation envelope and empty tags. |
| Global default save / clear / restore | Passed. Exact canonical ID saved, null cleared it, then the same exact ID was restored. |
| Cleared default with empty pool | Passed. Preview returned controlled `503 setup_incomplete` without additional generation/evidence rows; editable configuration remained usable. |
| Direct config EDIT and installed CLI activation | Passed. Saved provider timeout changed from 45 to 35 and display name changed. Active hash stayed unchanged before reload. `config validate` and `config reload` succeeded, preserving edited config and credential bytes. |
| All three packaged strategy previews | Passed. Each selected the exact global default with `label == tier == default` and `defaulted: true`; no request/upstream evidence was created. |
| Actual nonstream business request | Passed through virtual `economy`: nonempty text, `stop`, usage `39/19/58`, 995.48 ms. |
| Actual SSE through all three strategies | Nonempty `stop` streams passed for `task_aware`, `quality` and a later bounded `economy` diagnostic. The first 64-token economy stream failed the nonempty-response assertion. |
| Actual same-session followups | Passed using the actual assistant message privately, first within the process and then across two service restarts. HTTP monitoring retained four requests in that session. |
| Session LIST and retained source | Passed. Detail and LIST had exact global route, label `default`, `defaulted: true`. HTTP retained request decisions and all nine durable decisions carried the explicit source. |
| New stream outcome persistence | Passed after shutdown. Native returned model, non-null finish reasons and all token fields matched delivered SSE usage on every stream. |
| Completed assistant continuation persistence | Passed after shutdown. Seven rows for seven nonempty completed responses; exact message keys and provider origins verified. Empty responses had no replayable assistant key. |
| Nonempty real length response | Failed. The deliberate 128-token length request ended cleanly with usage and `[DONE]`, but no assistant text. |
| Cleanup and preservation | Passed. Owned service exited, port closed, CLI status exited 4 with `not_running`, SQLite integrity `ok`, credentials absent from records/logs, protected modes verified, old evidence and auth sources unchanged. |

Import confirmation used routing estimates already present in the private connection: input/output USD per million `0.3/1.2`, context window `1000000`, output limit `384000`, reasoning `true`, temperature `true`, tools/vision/JSON mode `false`, and an empty effort list. These values establish an explicitly confirmed acceptance configuration. They do not certify pricing, limits or optional capabilities of this serving endpoint. Only ordinary plain-text generation and SSE were exercised. Stored cost values are calculations from those estimates, not upstream billing evidence.

The first run lasted from `2026-10-02T11:48:56.239366+00:00` to `11:49:43.228704+00:00`. Supplementary restart/length diagnostics ran from `11:52:15.523025+00:00` to `11:52:36.515674+00:00`. Final live monitoring collection ran from `11:56:34.703983+00:00` to `11:56:54.773895+00:00`. Corrected post-stop verification completed at `11:59:48.939021+00:00` without generation.

Exactly nine generation attempts ran: one nonstream request and eight streams. Each used a harmless synthetic prompt and an output-token limit of 64 or 128. Actual SDK transport used `openai/deepseek-flash`, timeout 35 and `num_retries: 0`; all eight streams requested `stream_options.include_usage: true`. No fake transport, protocol substitution, automatic retry or forced canonical diagnostic was used. The later economy request was a separately recorded higher-budget diagnostic. Total upstream-reported usage was 406 input, 422 output and 828 total tokens.

| SSE observation | Limit | JSON chunks | Text characters | Finish / DONE | Input/output/total tokens | First chunk ms | Total ms |
| --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| Initial `task_aware` | 64 | 29 | 4 | stop / yes | 39/27/66 | 140.38 | 826.42 |
| Same-session continuation | 64 | 47 | 4 | stop / yes | 54/45/99 | 326.89 | 715.93 |
| `quality` | 64 | 25 | 4 | stop / yes | 39/23/62 | 139.54 | 830.91 |
| First `economy`, failed nonempty assertion | 64 | 67 | 0 | length / yes | 39/64/103 | 137.25 | 1303.75 |
| Same-session after restart | 128 | 53 | 4 | stop / yes | 54/51/105 | 459.91 | 1101.66 |
| Additional `economy` diagnostic | 128 | 21 | 4 | stop / yes | 39/19/58 | 117.97 | 942.83 |
| Deliberate length request, failed nonempty assertion | 128 | 131 | 0 | length / yes | 49/128/177 | 458.54 | 900.71 |
| Monitoring followup after second restart | 128 | 48 | 4 | stop / yes | 54/46/100 | 545.70 | 1365.31 |

Every stream returned HTTP 200 and `text/event-stream; charset=utf-8`, with zero error events. The decoder processed usage frames and read through EOF after `[DONE]`. Client-facing model values echoed the requested virtual model; headers reported exact canonical route and native upstream model. Durable `returned_model` was `deepseek-flash`, which proves native metadata was retained independently of the virtual model echo. Delivered `stop`/`length` and prompt/completion/total counts matched each correlated stored outcome. The two empty responses were completed transport outcomes (`ok: true`, no error type), while their stronger business assertions failed.

The concrete failure in both cases is upstream output-limit exhaustion without replayable assistant content: 64 output tokens for the first economy request, 128 for the deliberate long-output request. Neither showed an HTTP error, SDK exception or missing terminator. A reasoning-capable model consuming its budget before visible content is plausible, but this harness did not retain/count raw reasoning deltas, so it does not certify that explanation. A later economy success at 128 does not establish reliability at 64. The first failed assertion and the deliberate length assertion remain in `results.json`, with the initial result preserved separately. No further billed requests were used to search for a passing length example.

After service/store shutdown, retained row counts were:

| Table | Rows |
| --- | ---: |
| requests | 9 |
| decisions | 9 |
| outcomes | 9 |
| upstream_requests | 9 |
| config_versions | 6 |
| assistant_continuations | 7 |

Every outcome has `finish_reason` of `stop` or `length`, positive `prompt_tokens` and `completion_tokens`, matching `total_tokens`, native `returned_model`, `ok: true` and null error type. All nine decisions have `signals_json.defaulted == true`, tier `default`, exact global route and config hash `5cf25201d89e0d488e4abe6d0f132d17`. The prior active hash was `5aa3e5b29f44c532e64d8000c4f887f0`. The registered safe configuration recomputes to the new hash, retains exact `defaults.default_model`, edited display name and configured timeout marker. Edited `models.json` SHA256 was `98e5d9af2627f8633337adb00145822c7efefb471a902b9317b607d15354d4cc`. Actual timeout 35 is independently confirmed in every stored SDK submission.

Each nonempty stream's actual assistant message key matched durable provider-origin rows. The short replies had key `c5b2691d206c3d48cf0305c71a831dfcfe7aa6e4a6e9dd7e82239005b8d3e1c4`; duplicate occurrences in the same session were retained and matched using the installed continuation owner's occurrence semantics. Origin provider type was `openai`. Its generic adapter stores an empty opaque payload, which is expected for this configured transport even though the upstream model is named DeepSeek.

After stopping the actual service, a read-only SQLite backup was reopened through the installed `SqliteRecordStore`. The installed generic adapter preserved the actual supplied assistant and hydrated matching durable key/origin rows into a fresh session. The actual SDK submission for the restarted followup contained the supplied assistant unchanged. A separate local preparation through the installed DeepSeek adapter added its existing known-cross-provider reasoning marker from those real durable OpenAI-origin rows. This local preparation did not call another upstream. Native DeepSeek reasoning-payload capture, a real cross-provider network switch and opaque-ID-only history reconstruction were not tested. JEV's unsupported native `previous_response_id` resolver is not claimed.

The final session detail and LIST both showed exact global route, label `default`, source `true`, two live turns, no switches/failures/truncations, and four retained same-session requests across the observed process restarts. The retained request API exposed the same source and active config hash. Historical monitoring rows were read independently of live-session counts.

Verification recorded 51 passing business/configuration assertions, two preserved failed business assertions, 33 non-SSE HTTP calls (32 responses of 200, one expected 503), 16 recorded lifecycle/config CLI calls, and 30 passing final post-stop checks. Each of the two post-stop verifier passes also ran one read-only CLI status check. Those post-stop checks cover metadata correlation, continuation rows/reopen, source/hash, actual SDK arguments, credential redaction/absence, old evidence/auth preservation, package/artifact parity, protected modes and owned-process cleanup. They do not change the overall `REWORK` result.

One post-stop harness check initially expected numeric timeout 35 inside the safe config-version provider projection. The installed `ProviderProfile.as_dict()` deliberately replaces provider parameter values with `[configured]`. The first verifier result remains in `results-before-projection-correction.json`. The corrected check verifies the exact default, recomputed hash, edited display name and timeout marker, while keeping the separate actual-SDK timeout assertion. This was a tester projection correction with zero extra generation. Initial product/business failures were not removed or weakened.

The entire new directory tree was checked with mode `0700` for directories and `0600` for private/nonexecutable files; installed executable files use owner-only mode `0700`. Connection, management-key handoff and runtime `.env` are `0600`. Actual credential values were absent from SQLite dumps, safe result projections, CLI/HTTP outputs and service/harness logs. Authorized credential copies remain only in protected connection/runtime secret files. CLI confirmed `not_running`, the owned port was closed and the final owned service process had exited. All three detached acceptance harness processes also exited. All 54 package files and the wheel hash still matched; current checkout parity had zero mismatches.

Evidence and parent handoff paths are relative to the protected root above:

- `installation.json`: fresh installation, versions, wheel/source/installed parity and artifact digest.
- `results.json`: final safe results, both failures, all streams, delivered/stored token fields, native models, row counts and post-stop checks. Overall status remains `REWORK`.
- `results-initial.json`: untouched initial failure.
- `results-before-monitoring.json`: preserved supplementary result including the second failure.
- `results-before-projection-correction.json`: first post-stop verifier result before the protected-parameter projection correction.
- `handoff.json`: nonsecret paths, exact model/provider identity and new artifact digest.
- `private/connection.json`, `private/management-key`, `private/import-model.json`: protected connection/setup/import handoff for the parent's later public installed-operator acceptance. Read privately in code; never print these files.
- `private/streams.json`: actual supplied/returned assistant history and private correlation IDs. It is not a public report artifact.
- `private/auth-source-hashes.json`, `private/old-evidence-snapshot.json`: private source-preservation proofs.
- `runtime-home/jev-records.sqlite3`: real durable evidence; integrity `ok` after shutdown.
- `private/durable-replay.sqlite3`, `private/durable-replay-verified.sqlite3`: consistent reopened copies used for installed-adapter verification.
- `discover-private.py`, `install-isolated.py`, `run-real.py`, `supplement.py`, `collect-monitoring.py`, `verify-after-stop.py`: adapted acceptance programs. They use the new root; installation uses the post-rework wheel. Initial/supplement programs intentionally require fresh/preserved state and should not be blindly rerun over this evidence.
- `private/*-stdout.log`, `private/*-stderr.log`: protected execution logs. They were scanned for the actual credentials and are not copied into this report.

Parent/developer follow-up is to assess the two zero-content output-limit results and resolve the unmet nonempty-length acceptance before claiming a clean real-business pass. The stream persistence omissions reported against the old wheel were not reproduced in this new wheel. Browser, independent source review, current macOS installed smoke, full source regressions, publication and public operator reset remain parent-owned. The parent-reported 936 backend, 261 unit, 116 browser and Pyright-zero results were not rerun by this tester and are not substituted for real upstream evidence.
