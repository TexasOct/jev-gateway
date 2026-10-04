# Credential configuration verification

Worktree: `/Users/texas/Workspace/jev-credential-config`

Branch: `feat/write-only-credential-config`

Base: `dbcc14f`

## Requirement evidence

| Requirement | Evidence | Result |
| --- | --- | --- |
| R1: browser initialization and both provider kinds | `credential-default-install.spec.ts` used a newly installed wheel, default templates and an empty protected store. `credential-live-server.spec.ts` initialized gateway auth, saved LLM and decision keys and received matching credentials at two real local HTTP transports. `test_provider_set_keep_clear_pending_catalog_and_decision_skip` exercises SET/KEEP/CLEAR for both kinds; CLI and Provider regressions cover replacement. | Pass |
| R2: write-only forms and responses | Live browser tests reopen saved fields, refresh and reconnect with an empty connection field. Provider/gateway read, validation and write projections exclude keys. Six delayed validation/write/catalog cases confirm immediate provider input clearing; gateway pending/cancel and early-401 rotation cases pass. URL, cookies and both browser storage APIs exclude test keys. | Pass |
| R3: file-only server operation | `test_credential_live_server.py` removes declared secret environment variables, supplies JSON keys, authenticates inbound and both transports, edits all three keys, reloads with the old active gateway key and restarts successfully. The documented minimal JSON is parsed strictly and validated through the actual CLI. Final installed-wheel acceptance proves JSON-only startup/reload/restart on managed Python 3.12 with Node.js absent from PATH. | Pass |
| R4: compatibility and precedence | Credential tests cover JSON > local dotenv > captured process mapping, literal `${NAME}`, immutable snapshots and no process mutation. Existing dotenv interpolation/managed-literal, CLI login/logout and additional transport-reference regressions pass. Ten new guard cases cover own transport consumers, proposed bindings, later operations and CLI dry runs with unchanged files/runtime. Independent follow-up confirms KEEP preserves advanced fields and unshared SET/CLEAR still work. | Pass |
| R5: initialization, failures and concurrency | Real default install starts with pending providers. Bootstrap rejects public listeners, non-loopback peers, invalid Host/Origin and forwarding headers. Rotation requires the current key; stale revisions, invalid inputs and injected persistence/activation errors retain disk/runtime. Loss of a declared gateway key rejects startup/reload/candidate activation and keeps active auth. | Pass |
| R6: persistence and privacy | Store/backup permissions are `0600`; recovery uses the protected transaction path. Privacy regressions scan safe reads, model/strategy views, sessions/requests, SQL history and logs. Live transport tests also scan database/log/catalog content; browser tests verify no secret persistence. Installed default server logs exclude the submitted key; final installed-wheel checks confirm backup modes and upgrade/uninstall preservation. | Pass |
| R7: executable documentation | English/Chinese README, CLI/API/models/install/release docs and seven-section credential code-spec updated. `docs/credentials.md` JSON blocks load through `load_catalog` and `jev --home ... config validate` with secret env variables removed, with no value echo. | Pass |

## Completed gates

All commands ran in the isolated worktree unless a frontend cwd is shown.

| Gate | Result | Evidence |
| --- | --- | --- |
| `uv run pytest -q` | 841 passed in 43.72s after the shared-reference fix | `frontend/node_modules/.cache/credential-final-pytest.log` |
| `uvx pyright` | 0 errors, 0 warnings | `frontend/node_modules/.cache/credential-final-pyright.log` |
| `npm --prefix frontend run test` | 33 files, 238 tests passed | `frontend/node_modules/.cache/frontend-unit-final.log` |
| `npm --prefix frontend run lint` | 0 errors; 4 existing fast-refresh warnings | `frontend/node_modules/.cache/frontend-lint-final.log` |
| `npm --prefix frontend run build` | Pass; existing bundle-size warning | `frontend/node_modules/.cache/frontend-build-final.log` |
| `scripts/build-frontend.sh --check` | Dashboard bundle current | Command output |
| `npm exec -- tsc --project tests/tsconfig.json --noEmit` in `frontend/` | Pass, including the installed-default spec | Command output |
| Credential and existing Provider Playwright specs, preview port 4183 | 56 passed in 13.8s | `frontend/node_modules/.cache/credential-final-browser.log` |
| Real gateway browser flow, no route mocks | 1 passed in 2.1s after the shared-reference fix | `frontend/node_modules/.cache/credential-final-live-browser.log` |
| Fresh installed-default browser setup | 1 passed in 1.1s | `frontend/node_modules/.cache/default-installed-browser/browser.log` |
| `uv build` | Wheel and sdist built | `frontend/node_modules/.cache/credential-final-build-wheel.log` |
| Document JSON and actual CLI validation | Pass; no secret echo | `frontend/node_modules/.cache/credential-doc-example-validation.log` |
| Final installed-wheel smoke | 102/102 checks, native exit 0, 59.83s; current wheel digest matches | `frontend/node_modules/.cache/credential-installed-final/evidence/checks.json` |
| `git diff --check` | Pass | Command output before staging |

The live gateway browser fixture recorded exactly one decision request to
`/evaluate` and one LLM request to `/v1/chat/completions`; both reported
`key_matches:true`. File-only reload/restart recorded three such pairs. Each
fixture owns its home, ports and processes; both browser server processes stopped
after their tests. The installed-default screenshot was opened and inspected:
gateway presence is shown, saved key inputs are absent and provider controls are
usable.

The initial document probe found an invalid compact strategy example. It was
corrected to include top-level policy/tier routes, then both strict parsing and
real CLI validation passed. The live-browser harness now accepts the editor's
discard confirmation explicitly and verifies that cancellation closes the field.

## Independent acceptance

The full-scope read-only review confirmed the inspected privacy/runtime/frontend
contracts and identified the invalid document example plus an own-provider
transport-reference exclusion bug. Both are fixed. The guard now counts every
transport occurrence and checks the completed candidate before persistence.
Focused Provider/CLI tests passed (133), followed by the 841-test full suite and
clean Pyright. `credential-guard-recheck` returned PASS, independently reran 14
focused cases, extracted the headless JSON example for strict parsing, and proved
that KEEP permits unrelated changes while preserving advanced fields and files.

The prior installed wheel passed 102 checks, audited by `credential-wheel-check`.
After rebuilding for the guard fix, the main tool's 60-second execution ceiling
interrupted a repeat run. No matching smoke process remained. This is incomplete
evidence. `credential-final-wheel` then returned PASS for the rebuilt wheel in a
new private runtime/tool directory. All 102 checks and 23 command logs passed;
current source-to-wheel parity and before/after SHA256 equality were confirmed.
Both test gateways were stopped. Main independently inspected the fresh checklist,
digest and audit files. This fresh run is the installed acceptance evidence.

Final wheel SHA256:
`c0a1ed4247c83d1eeca6567fb171aeeac7dd21d9021c806de6e1fcbec4eaa8dd`.

Native exit, timestamps, digest and isolated command evidence are in
`frontend/node_modules/.cache/credential-installed-final-smoke-run.json`,
`credential-installed-final-evidence-audit.json` and
`credential-installed-final-wheel-audit.json`. The latter two names share the
same cache directory. Private test homes and logs are excluded from commits.

Every PRD acceptance item has passing implementation/runtime/browser/package
evidence. Implementation is committed as `015d384`. The task is archived and its
delivery recorded in the isolated workspace journal; unrelated shared-checkout
work and private test material are excluded.
