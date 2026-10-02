Installed candidate acceptance: **FAIL**. The run targeted the exact supplied wheel in a fresh private uv tool environment with managed Python 3.12. It made 6 of at most 6 authorized real generation calls.

Started: `2026-10-02T16:00:29.048648+00:00`. Finished: `2026-10-02T16:02:32.127006+00:00`.

Wheel: `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/overlay-final-dist/jev_gateway-0.1.0-py3-none-any.whl`. SHA256: `57e49d26d089d3bbe4b06f2e7b03d0344a11a04e881ed4549f84beb4da4f6914`.

Installed package version: `0.1.0`. LiteLLM: `1.103.2`.

Package byte parity before/after: `54` / `54` files. Source mismatch counts: `0` / `0`. Installed mismatch counts: `0` / `0`.

Package manifest before/after: `1117650fdc38c3f77776b7703f891e8e42347a6f822861b2aaee362928256bb9` / `1117650fdc38c3f77776b7703f891e8e42347a6f822861b2aaee362928256bb9`.

Frozen source manifest before/after: `920ab2f68712f5b5d05345005553412596e41e92ddfb0f8ce562ab5d0e1beda1` / `920ab2f68712f5b5d05345005553412596e41e92ddfb0f8ce562ab5d0e1beda1`. Source HEAD before/after: `16929b38d780bd04385fecb9aaa76d824acf04c7` / `16929b38d780bd04385fecb9aaa76d824acf04c7`.

Frozen source unchanged: `True`. Original auth files unchanged: `True`. Historical evidence unchanged: `True` across `134` files.

All real calls used the saved provider, explicit confirmed model import and ordinary configuration APIs. Price and capability entries copied from the private confirmed handoff remain operator estimates. This run verifies plain text streaming; it does not certify upstream billing, tools, vision, JSON mode or native cross-provider generation.

| Real call | Budget | Transport complete | Visible chars | Finish | Route label | Native outcome model | Input/output/total tokens |
| --- | ---: | --- | ---: | --- | --- | --- | --- |
| ordinary-task_aware | 512 | True | 4 | stop | default | deepseek-flash | 39/21/60 |
| ordinary-quality | 512 | True | 4 | stop | default | deepseek-flash | 39/122/161 |
| ordinary-economy | 512 | True | 4 | stop | default | deepseek-flash | 39/19/58 |
| same-session-after-reinstall | 512 | True | 4 | stop | default | deepseek-flash | 54/51/105 |
| assigned-tag-fresh-session | 512 | True | 4 | stop | draft | deepseek-flash | 39/19/58 |
| single-length-2048 | 2048 | True | 0 | length | draft | deepseek-flash | 51/2048/2099 |

The three ordinary strategies require the exact global model, raw `default` label, `defaulted: true`, nonempty visible output, `stop`, one `[DONE]` and no error event. The restart followup sends the actual first assistant message. The fresh assigned-tag call follows the real overlay edit and reload. The last call requests long harmless repeated visible text at explicit `max_tokens: 2048`; there is no retry or token-budget override.

Ordinary reinstall uv exit: `0`. Baseline/.env/active-overlay SHA256 before: `{".env": "f3ad7cc6ab97cc9b66203fae6dbadb72d0463432b3f6ba6617bc26fc4f7ae00d", "models.json": "846c18eeae295e1941e1815cf5deab47d2baa9dfe21190e5e6c34c69700bba79", "routing-overrides.json": "2c68e1adce739a4ea854ec236af374c4a96d71ba6bd67721a4f53bc29856303d"}`. Original retained row counts: `{"assistant_continuations": 3, "config_versions": 7, "decisions": 3, "outcomes": 3, "requests": 3, "upstream_requests": 3}`.

The ordinary reinstall stops the owned service, keeps all original request/decision/outcome/upstream/assistant-continuation tuples, forces installation of the exact wheel through the same private uv tool command, and runs the normal install initializer. It compares config, credential and active-overlay bytes, permits new SQLite bookkeeping rows, checks installed package parity and launchers, then starts and reloads before the supplied-assistant followup. SQLite file byte identity is not an acceptance condition.

| Preservation scope | Result by table |
| --- | --- |
| immediately_after_reinstall | requests: True (3 original, 3 current), decisions: True (3 original, 3 current), outcomes: True (3 original, 3 current), upstream_requests: True (3 original, 3 current), assistant_continuations: True (3 original, 3 current), config_versions: True (7 original, 7 current) |
| after_followup | requests: True (3 original, 4 current), decisions: True (3 original, 4 current), outcomes: True (3 original, 4 current), upstream_requests: True (3 original, 4 current), assistant_continuations: True (3 original, 4 current), config_versions: True (7 original, 7 current) |
| after_remaining_calls | requests: True (3 original, 6 current), decisions: True (3 original, 6 current), outcomes: True (3 original, 6 current), upstream_requests: True (3 original, 6 current), assistant_continuations: True (3 original, 5 current), config_versions: True (7 original, 8 current) |

Final retained row counts: `{"assistant_continuations": 5, "config_versions": 8, "decisions": 6, "outcomes": 6, "requests": 6, "upstream_requests": 6}`. Final stopped status exit: `4`. Passing checks: `306`; failed checks: `2`.

CLI calls use `jev --home <owned-runtime> --json <command>`. Observed return codes:

| CLI action | Operation | Exit | Expected |
| --- | --- | ---: | ---: |
| install | init | 0 | 0 |
| config | validate | 0 | 0 |
| start |  | 0 | 0 |
| status |  | 0 | 0 |
| config | show | 0 | 0 |
| config | validate | 0 | 0 |
| config | reload | 0 | 0 |
| status |  | 0 | 0 |
| stop |  | 0 | 0 |
| status |  | 4 | 4 |
| install | init | 0 | 0 |
| status |  | 4 | 4 |
| start |  | 0 | 0 |
| status |  | 0 | 0 |
| config | reload | 0 | 0 |
| config | reload | 0 | 0 |
| status |  | 0 | 0 |
| stop |  | 0 | 0 |
| status |  | 4 | 4 |

Cleanup log projection: `{"cleanup_warning_count": 0, "raw_logs_private": true, "total_bytes": 0, "warning_bound": 6}`.

Resource closure scope: the installed SDK interface is inspected and owned process, socket and service logs are checked. Actual `aclose()` execution is not instrumented inside the CLI-owned service. No installed resource method is replaced or simulated.

Recorded failures and execution limits:

- `{"check": "same-session-after-reinstall_finalized_continuation_after_exhaustion", "stage": "same-session-after-reinstall-restart"}`
- `{"check": "single-length-2048_visible_output", "stage": "single-deliberate-length-probe"}`
- Actual aclose execution is not instrumented in the CLI-owned service; interface availability and cleanup logs are observed.

Historical real-stream and budget assertions retain their original results, including reasoning-only length responses. A transport-complete length response with no visible text remains a failed visible-output assertion in this candidate run. Old wheels establish no source parity for this candidate.

Protected evidence: `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/final-installed-business/run-20261002T160029.047834Z`. Safe projections: `runner-result.json`, `results.json`; private raw streams, request/conversation material, config backups, original row tuples and command output remain under `private/`. Files use 0600 and directories/executables use 0700.

This acceptance covers the private installed candidate and ordinary reinstall. Public installer, release replacement, tag publication and actual operator reset are outside this report.
