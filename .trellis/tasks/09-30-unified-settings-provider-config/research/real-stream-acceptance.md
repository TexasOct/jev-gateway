# Installed-wheel real upstream acceptance

Historical installed acceptance of wheel SHA256
`104f4c2fee12385bd8d2a94d0b51df7515ecf87d184f387631a76040f957445c`,
before the stream persistence rework. Both original omissions and failed
assertions below are retained. `real-post-rework-acceptance.md` records the later
SHA740 artifact's metadata and durable-continuation verification, including its
own two failed nonempty-response assertions. Neither report certifies the later
SDK-close/frontend follow-up, replacement release or public reinstallation.

The requested initialization, provider discovery/import, global default, reload and same-session OpenAI-compatible stream flows passed against the specified installed wheel. Two completed real streams selected `real-acceptance/deepseek-flash` and retained the final label `default`. Extended evidence checks found two product omissions: successful streams do not finalize assistant continuation capture, and their retained outcomes omit finish reason, usage and returned model. The initial failed assertion remains in the evidence. This report does not grant publication approval.

## Tested artifact and source

- Wheel: `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/final-dist/jev_gateway-0.1.0-py3-none-any.whl`.
- SHA256: `104f4c2fee12385bd8d2a94d0b51df7515ecf87d184f387631a76040f957445c`.
- Installed package: `0.1.0`, managed Python `3.12`, LiteLLM `1.103.2`.
- Installed origin: `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/real-stream/tools/jev-gateway/lib/python3.12/site-packages/jev_gateway/__init__.py`.
- Source checkout: `/Users/texas/Workspace/jev-llmroute-test`, HEAD `16929b38d780bd04385fecb9aaa76d824acf04c7`, with task changes present. HEAD alone does not identify the tested wheel's source.
- All 54 `jev_gateway/` wheel files matched both the installed package and the checkout byte for byte at installation time. The sorted package-file SHA256 manifest has digest `2d48353bb434043d8ea64a4b2607346b65b5c8f8057685b4fbb227ca3e253344`.
- Tested `jev_gateway/gateway.py` SHA256: `14ecf795ff8df225fda46acbd272bb86e575d2c9521e5dc1d23447fa4e401996`. Its installed bytes still matched the wheel after verification.
- Verification ran on 2026-10-02, from `10:05:57.127367+00:00` to `10:06:29.234923+00:00`; post-stop checks followed without more generation requests.

## Isolation and credential handling

The sandbox is `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/real-stream/`. It has its own UV tool directory, executable directory, managed interpreter, cache, XDG configuration/state, user home and runtime home. CLI commands ran from its `outside/` directory with `PYTHONPATH`, `PYTHONHOME`, virtual-environment settings and inherited `JEV_*` variables removed. The service bound only `127.0.0.1:61203`, separate from the ordinary port `8000`.

The existing API-key connection came from `/Users/texas/.pi/agent/models.json` and `/Users/texas/.pi/agent/auth.json`. Private code selected `openai-completions`, configured as JEV provider type `openai`, with upstream model `deepseek-flash`. The connection URL passed HTTPS, host, userinfo, query and fragment checks. Endpoint and credential values are omitted from this report. Neither agent source file changed; before/after hashes were compared privately. No OAuth credential was refreshed or mutated. Codex source files were checked for existence only; their contents and operator JEV files were not needed.

The sandbox, `private/` and runtime home have mode `0700`; `private/connection.json` and runtime `.env` have mode `0600`. API/CLI results and service logs were checked for the actual credential values; none were found. SDK evidence uses `[REDACTED]`. Exported results contain no response text, bearer values, session IDs or request IDs. The private database contains the gateway's ordinary records for this harmless synthetic conversation, as determined by the packaged content-capture defaults.

## Actual flows

| Flow | Result | Evidence |
| --- | --- | --- |
| Exact wheel installed through isolated `uv tool install --force --python 3.12 --managed-python` | Passed | Python/package identity and 54-file installed/source parity |
| Fresh packaged template and startup | Passed | No provider/model/decision-provider instances; `task_aware`, `quality`, `economy` retained; installed CLI starts the real service |
| Real `GET /v1/setup` and same-origin local `POST /v1/setup` | Passed | Initial absence state; generated printable ASCII management key activates and reconnects; `.env` is `0600` |
| Real credential saved through provider HTTP transaction | Passed | Validate leaves both files unchanged; PUT changes opaque revision and activates provider before any model exists |
| Actual upstream discovery | Passed | `POST /v1/provider-discovery`: HTTP 200, supported and complete, two candidates, selected model present, no warnings; no configuration or evidence writes |
| Actual public metadata lookup | Completed with no applicable metadata | HTTP 200, one lookup item, zero sources and known fields; `metadata_not_found`, `serving_endpoint_unmatched`; no writes |
| Confirmed model import | Passed | Selected discovered model imported explicitly with `confirmed: true` and a confirmation envelope; exactly one model becomes available |
| Global default configuration | Passed | Guarded revision transaction saves canonical `real-acceptance/deepseek-flash`; model has no strategy tags |
| CLI `config reload` | Passed | Files and revision unchanged; default, provider type, endpoint-match boolean and effective credential presence retained |
| Effective SDK properties | Passed | Retained submissions use `openai/deepseek-flash`, `stream: true`, `max_tokens: 64`, saved `timeout: 45`, `num_retries: 0`; endpoint matches privately and key is redacted |
| All three strategy previews | Passed | Each selects the same global model with `label == tier == default`; request/upstream counts unchanged |
| Initial real `task_aware` stream | Passed | HTTP 200 SSE; valid JSON chunks, nonempty text, `stop`, `[DONE]`, zero error events and default route headers |
| Real continuation in the same JEV session | Passed | Client replays the first assistant text in memory; second stream completes; same session/header, route and default label; two healthy turns, no switches/failures/truncations |
| Retained request/session success evidence | Passed | HTTP monitoring returns two requests; durable SQLite requests/decisions/outcomes/upstream submissions each number two, with both outcomes successful and decisions `default` |
| Durable assistant continuation capture | Failed extended check | Zero assistant-continuation rows even after orderly shutdown; see product finding below |
| Retained stream finish reason/token usage/returned model | Unavailable | Both outcomes leave these fields NULL although SSE delivered finish reason and usage; see product finding below |
| Owned-service cleanup | Passed | `jev stop` succeeded; subsequent status exits 4 with `not_running`; owned port closed |

Provider discovery was actual and complete. Import used manual metadata confirmation because no applicable serving-channel metadata was available. Confirmed routing estimates came from the existing Pi model configuration: USD/million input `0.3`, output `1.2`, context window `1000000`, output limit `384000`, reasoning `true`. Tools, vision and JSON mode were explicitly limited to `false`; temperature was configured `true` and the effort list empty. These values establish the import contract and acceptance setup. They do not certify upstream billing, model limits or optional capabilities. Only plain-text streaming was exercised. No pricing or capability claim was inferred from an unmatched public source.

## Stream observations

Each request used the virtual model `task_aware`, a short harmless ping, `stream: true`, `max_tokens: 64` and `stream_options.include_usage: true`. Exactly two generation requests ran. There was no canonical-model diagnostic or generation retry.

| Observation | Initial stream | Same-session continuation |
| --- | --- | --- |
| HTTP/content type | 200, `text/event-stream; charset=utf-8` | 200, `text/event-stream; charset=utf-8` |
| JSON SSE chunks, excluding `[DONE]` | 21 | 41 |
| Accumulated text length | 4 characters | 4 characters |
| Finish reason / terminator | `stop` / `[DONE]` | `stop` / `[DONE]` |
| First JSON chunk | 1163.17 ms | 156.81 ms |
| Total client duration | 1554.99 ms | 556.54 ms |
| SSE prompt/completion/total tokens | 39 / 19 / 58 | 54 / 39 / 93 |
| Stream error events | 0 | 0 |
| Route / final label | `real-acceptance/deepseek-flash` / `default` | `real-acceptance/deepseek-flash` / `default` |

SSE `model` was `task_aware`, consistent with the gateway's requested-model echo. `X-JEV-Model` reported native `deepseek-flash`; the retained SDK submissions identified `openai/deepseek-flash`. Session, request and decision header presence were checked privately without exporting their values.

After service shutdown, SQLite integrity was `ok`. Durable row counts were `requests: 2`, `decisions: 2`, `outcomes: 2`, `upstream_requests: 2`, `config_versions: 5`, `assistant_continuations: 0`.

## Product findings for the parent/developer

1. **Completed streams do not finalize assistant continuation capture.** In `jev_gateway/gateway.py`, `recorded_stream()` around line 1543 passes `response_capture.observe` to `sse_chunks()` but never calls `response_capture.finish()` after successful completion. `ResponseCapture.finish()` in `jev_gateway/provider/base.py` is the path that saves accumulated streaming assistant messages. The tested wheel produced two successful streams and zero durable continuation rows after shutdown. The plain OpenAI-compatible follow-up succeeded using client-supplied history; this does not prove durable opaque replay or a later provider switch works. Product files were preserved.
2. **Streaming outcome metadata is not retained.** The stream `record_outcome()` call around `jev_gateway/gateway.py:1583` supplies `ok`, `latency_ms` and `error_type`, without finish reason, usage or returned model. Both successful retained outcomes had NULL finish reason, token counts and returned model while the client received the values shown above. Request/session success and route evidence are present. Token accounting and truncation/finish evidence remain unavailable. Product files were preserved.

A read of `HEAD:jev_gateway/gateway.py` confirmed both omissions also exist in HEAD `16929b38d780bd04385fecb9aaa76d824acf04c7`; this is source-history evidence, not proof of acceptance in a previous release. The installed gateway file still matched the tested wheel after all checks. The tester did not change product code or weaken the failed assertion.

To reproduce against this preserved installation, use its protected connection and management-key handoff, start the installed service, send an explicit-session `task_aware` request with the stream options above, replay the returned assistant text in that session and stop the service. Inspect only the safe columns with read-only SQLite:

```sql
SELECT COUNT(*) FROM assistant_continuations;
SELECT ok, finish_reason, prompt_tokens, completion_tokens, total_tokens,
       returned_model
FROM outcomes;
SELECT tier, route, turn_index FROM decisions;
```

The existing private database already reproduces the missing durable data; another billed call is unnecessary to inspect the finding. A product fix and rebuilt wheel would need a bounded retest owned by the parent/developer.

## Evidence and handoff

- Full safe result: `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/real-stream/results.json`.
- Original result with the extended failed assertion: `real-stream/results-initial.json`. Its `success: false` is preserved. The final safe result separately records `requested_flows_passed: true` and `overall_status: requested_flows_passed_with_product_findings`.
- Installation/parity: `real-stream/installation.json`.
- Nonsecret parent handoff: `real-stream/handoff.json`.
- Credential handoff: `real-stream/private/connection.json`, mode `0600` under `private/` mode `0700`. It contains credentials and must be consumed privately in code, never printed or read into tool output.
- Confirmed import payload: `real-stream/private/import-model.json`.
- Management-key handoff: `real-stream/private/management-key`, mode `0600`.
- Acceptance programs: `real-stream/discover-private.py`, `install-isolated.py`, `run-real.py`, `verify-after-stop.py`.

Post-stop verification corrected a tester projection that initially failed to recognize the uppercase `[REDACTED]` marker. The original combined assertion requiring two assistant-continuation rows remains failed; it was not removed, skipped or rerun with a weaker condition. Verification after shutdown added SDK-property, redaction, credential-absence, durable-row, port-closure and permission evidence without further generation.

This tester wrote only this report inside the repository. Product files and other-agent auth stayed read-only. No commit, push, publication, public installation or operator-config deletion ran. Public artifact replacement, local operator reset and public-installer acceptance remain with the parent. Native browser acceptance is separate. The preserved protected connection is ready for the parent's post-install stream test.
