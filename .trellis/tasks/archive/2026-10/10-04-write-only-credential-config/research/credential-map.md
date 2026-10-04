# Credential configuration source map

Research inspected checked-in source, specs, and task planning artifacts. No runtime `.env`, runtime catalog, database, logs, or actual secrets were read. Line references describe the inspected working tree. No tests were run. `task.py current --source` returned no active pointer; the caller explicitly assigned this existing task, so research stayed here without changing task activation.

## Install defaults and web initialization

`jev_gateway/cli/install_state.py:46` owns `init_runtime()`. It copies packaged `models.example.json` to runtime `models.json` and `env.example` to runtime `.env` only when each destination is absent. It sets the new `.env` to mode `0600`, creates runtime directories, and preserves existing operator files.

`jev_gateway/templates/models.example.json:2` has no `gateway.api_key_env`. Its LLM provider definitions at line 215 reference `DEEPSEEK_API_KEY` and `OPENAI_API_KEY`. `jev_gateway/templates/env.example:1` supplies non-empty replacement placeholders for those names and `JEV_OPENROUTER_API_KEY`. These are checked-in examples, not configured credentials. The decision section is disabled at `models.example.json:11` and references `DECISION_API_KEY` at line 19.

Missing LLM credentials currently block startup. `jev_gateway/catalog.py:888` resolves a referenced variable and raises if it is missing or blank. `provider_from_dict()` at line 960 invokes that resolution; the OpenAI-compatible branch at lines 967-970 also requires a resolved key. Placeholder values pass presence validation but would fail real upstream authentication. `jev_gateway/gateway.py:434` loads configuration when constructing the app, and line 1586 constructs the module-level app immediately. An absent required provider key therefore fails before Dashboard can initialize it.

Decision credentials behave differently: `jev_gateway/catalog.py:1444` validates the reference without resolving it as a startup requirement. `jev_gateway/strategy/decision_provider/__init__.py:46` returns early when disabled and skips providers missing a credential at lines 56-62.

There is also an authorization constraint. `jev_gateway/gateway.py:722` requires an existing gateway key for configuration writes. The default installation has none, so Dashboard reads can work while validate/apply/discovery/metadata return `403 config_writes_disabled`. No current provider operation sets `gateway.api_key_env`. Startup tolerance alone will not enable first-time web initialization.

## Exact owner map

| Concern | Source owner | Current behavior |
| --- | --- | --- |
| Runtime paths | `jev_gateway/cli/paths.py:30`, `:50` | Explicit home, `JEV_GATEWAY_HOME`, install-state runtime directory, then `~/.jev-gateway`; sibling `models.json` and `.env` |
| Server startup | `jev_gateway/cli/process.py:115`, `jev_gateway/cli/server.py:14`, `jev_gateway/gateway.py:159`, `:179`, `:1589` | Managed process supplies home before importing gateway; standalone server uses the same path rules |
| Credential snapshot | `jev_gateway/provider_config.py:71`, `jev_gateway/gateway.py:183` | Immutable per-load mapping, ordered dotenv interpolation; local `.env` overrides inherited environment; no global environment mutation |
| File credential mutation | `jev_gateway/provider_config.py:101` | Env-name validation, bounded non-empty single-line values, duplicate-assignment removal, managed literal marker for interpolation-shaped values |
| Atomic files and backup | `jev_gateway/config_transaction.py:27`, `:39`, `:99`; `jev_gateway/provider_config.py:284` | Cooperative lock, recovery block, protected `.env`/backup/journal, catalog backup and transaction |
| Provider and system safe types | `jev_gateway/catalog.py:127`, `:190`, `:281`, `:334` | References and presence only; resolved API keys omitted |
| Static credential rules | `jev_gateway/catalog.py:898`, `:921`, `:940` | Literal JSON API keys rejected; credential-shaped provider params use `param_env` |
| Provider commands | `jev_gateway/provider_config.py:182`, `:202`, `:221`, `:236`, `:250` | Revisioned import/upsert/delete for LLM and decision providers; credential `keep/set/clear`; no gateway/system operation |
| Shared-reference protection | `jev_gateway/provider_config.py:255` | Credential mutation rejects shared env references |
| Candidate validation | `jev_gateway/provider_config.py:272` | Validates baseline and overlay with candidate credential mapping before commit |
| Read and write API | `jev_gateway/gateway.py:718`, `:736`, `:743`, `:779`, `:784` | Bearer guard, write availability flag, safe generic errors, provider snapshot/validate/apply |
| Discovery and metadata API | `jev_gateway/gateway.py:789`, `:803`, `:815`; `jev_gateway/provider_config.py:293`, `:319` | Temporary candidate credentials remain in memory; metadata lookup uses public sources |
| Upstream discovery transport | `jev_gateway/model_discovery.py:65`, `jev_gateway/discovery_network.py:99`, `:143`, `:167` | Credential headers; URL/network/redirect/size checks and TLS verification |
| Gateway browser credential | `frontend/src/shared/api/client.ts:36`, `frontend/src/app/App.tsx:30`, `:42`, `:148` | Module-memory Bearer token; cleared on auth failure; entered token trimmed |
| Provider browser credential | `frontend/src/features/providers/ProviderView.tsx:23`, `:43`, `:70`, `:85`, `:103`, `:108` | Password input and keep/set/clear; secret cleared on save/leave; candidate form retains it while open |
| Save/discovery orchestration | `frontend/src/features/providers/useProviderManagement.ts:76`, `:107` | Stale-request cancellation; validate then apply; write-availability check |
| Model import | `frontend/src/features/providers/model.ts:16`, `:88`, `:101`; `frontend/src/features/providers/ProviderModels.tsx:71` | Explicit confirmed metadata; normal UI writes omit advanced params/param_env and backend preserves omitted existing fields |
| Settings composition | `frontend/src/app/AppShell.tsx:230`, `:237` | Appearance settings only; no gateway credential form |
| Browser persistence | `frontend/src/shared/i18n/index.tsx:7`, `:40`, `:53` | Confirmed storage use is locale; Bearer token remains memory-only |
| CLI secret acquisition | `jev_gateway/cli/main.py:53`, `:62`, `:76`; `jev_gateway/cli/secrets.py:14` | Provider commands; env/stdin/no-echo prompt, no raw-key argument |
| CLI credential operations | `jev_gateway/cli/providers.py:128`, `:143` | LLM login/logout; local file writes/removal, presence result; exported env can still supply a removed local key |
| CLI safe inspection | `jev_gateway/cli/config_ops.py:48`, `:55`; `jev_gateway/cli/main.py:203` | Redacted config show; paths without values; no first-class gateway or decision credential setup |
| Configuration reload | `jev_gateway/gateway.py:1091`, `:1148` | Re-reads credential/catalog snapshot; storage change may require restart; bind host/port applies at process startup |

## Readback and error boundaries relevant to this task

Provider GET, validation, and apply project safe catalog views. `jev_gateway/gateway.py:736` maps invalid commands and unexpected failures to fixed messages. `tests/test_provider_management_api.py:133` covers hostile payload/secret exclusion and no file creation after rejected writes. `tests/test_provider_config_regressions.py:57` covers literal credential round-trip without response echo or environment mutation.

Import/history/export must continue to serialize the safe catalog projection. The existing provider revision at `jev_gateway/provider_config.py:91` uses a process-keyed HMAC over catalog, overlay, and credential file bytes; it does not expose a plain secret digest. Credential backups and recovery files still contain values on disk and must stay protected. This research did not independently enumerate every routing version/export implementation; add explicit response tests when extending credential fields rather than assuming those routes inherit the new safe projection.

Retained request evidence is owned by `jev_gateway/records.py:486`, `:533`, `:810`, `:829`, `:941`; history routes are in `jev_gateway/dashboard.py:370`, `:440`. The gateway supplies API-key and provider `param_env` field names to upstream-payload sanitization at `jev_gateway/gateway.py:1367`. Sanitization is name-based. Client content capture intentionally retains prompt/tool content when enabled, so it is not a general scrubber of secrets embedded in arbitrary neutral fields. `gateway.py:107` permits extra chat fields. Keep credential setup commands separate from request evidence capture.

`jev_gateway/gateway.py:1419` avoids raw upstream exception wording, clears exception chaining, and raises a generic error. `jev_gateway/logging/config.py:66` renders safe traceback locations. Discovery candidate keys are used in header transport and never persisted by preview. No separate connection-probe endpoint was found beyond discovery/metadata/validation. Browser runtime and bundled assets were not independently verified.

## Scope overlap and implementation recommendations

The existing `09-30-unified-settings-provider-config` PRD at lines 19-27, design at lines 11-24, and implementation plan at line 23 cover Provider & models navigation, Settings composition, appearance/locale behavior, and reuse of existing provider APIs. They retain the gateway-key write guard and memory-only browser authentication. They do not plan a new gateway bootstrap endpoint. Coordinate edits to `AppShell.tsx`, `ProviderView.tsx`, provider hooks, and i18n; this task should own missing credential initialization contracts and backend/CLI behavior.

1. Specify how an unconfigured server is initialized securely. Local CLI/file bootstrap is already possible in principle; remote unauthenticated credential writes need an explicit authorization design. Do not silently remove the existing write guard.
2. Permit an unconfigured catalog to start for setup, with absent LLM credentials represented as missing presence. Exclude unavailable providers from dispatch and return a safe actionable error when none can serve. Audit catalog validation and router selection together so startup tolerance does not produce downstream null-key failures.
3. Remove non-empty credential placeholders from new-install credential defaults once startup can tolerate missing keys. Preserve existing operator files during init and upgrades.
4. Keep `models.json` as credential references and `.env` as the file value source for server operators. Document exact home selection, dotenv interpolation and managed literal behavior, local-file precedence over inherited environment, and reload/restart behavior.
5. Extend credential commands for gateway/system credentials and, if needed, `param_env`. Return presence and references only. Define keep/set/clear when inherited environment still supplies a key, shared-reference rules, gateway-key rotation/auth continuity, and backup retention.
6. Reuse provider write-only UI conventions. Clear sensitive form state after success/cancel/auth failure, avoid browser persistence, and show presence plus missing/setup status without readback. A presence flag currently counts install placeholders as configured, which is another reason to change defaults.

## Validation owners and useful commands

Backend cases belong in `tests/test_provider_management_api.py`, `tests/test_provider_config.py`, `tests/test_provider_config_regressions.py`, `tests/test_cli_managed_credentials.py`, `tests/test_records.py`, and `tests/test_gateway.py`. Add install defaults, start with missing LLM keys, first initialization authorization, file-only startup, inherited/local precedence, literal values, rotation/clear, and no-echo assertions across read/validate/apply/discovery/import/history/export/error paths. Verify failed transactions leave catalog and credentials consistent.

Frontend cases belong near `frontend/src/features/providers/model.test.ts:67` and existing app/API/provider tests. Verify no secret storage, successful form clearing, missing-credential presentation, stale preview cancellation, and reconnect after gateway-key rotation. Follow existing `tests/test_gateway.py:906` bundled-asset checks when changing shipped Dashboard code.

Relevant docs: `docs/http-api.md:199`, `docs/models-config.md:76`, `docs/cli.md:112`, `README.md:107`. Relevant contracts: `.trellis/spec/backend/provider-configuration.md:31`, `.trellis/spec/backend/dashboard-routing-config.md:565`, `.trellis/spec/backend/cli-lifecycle.md:41`.

Candidate backend command: `uv run pytest tests/test_provider_management_api.py tests/test_provider_config.py tests/test_provider_config_regressions.py tests/test_cli_managed_credentials.py tests/test_records.py tests/test_gateway.py`. Frontend commands: `npm --prefix frontend test -- features/providers shared/api app features/appearance`, `npm --prefix frontend run lint`, and `npm --prefix frontend run build`. Confirm script/filter behavior before execution. These commands were not run during research.
