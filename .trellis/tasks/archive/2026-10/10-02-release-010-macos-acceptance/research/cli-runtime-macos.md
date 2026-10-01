# CLI runtime and macOS acceptance research

This investigation read source and local installation metadata. It did not read runtime configuration, PID contents, or production logs, contact HTTP endpoints, or change services. Installer research belongs to the main agent.

## Observed local metadata

- `/Users/texas/.jev-gateway` exists, uid 501/gid 20, mode 0755. Its `models.json` is 0644; `.env` and `run/gateway.pid` are 0600; `logs/gateway.log` is 0644. The `run` and `logs` directories are 0755. `.env.backup` is absent. All inspected present files are readable by this session.
- `/Users/texas/.local/bin/jev` and `jev-gateway` are absent. `uv tool dir` resolves to `/Users/texas/.local/share/uv/tools`; that directory exists as 0755, uid 501/gid 20, but its `jev-gateway` environment and executables are absent.
- `/Users/texas/.local/state/jev-gateway/install.json` is absent.
- Current PATH selects `/Users/texas/Workspace/jev-llmroute-test/.venv/bin/jev`. `uv` selects `/Users/texas/.local/bin/uv`. A command issued as bare `jev` here therefore does not demonstrate a formal installed tool.
- No operational service error was observed. Existing PID/log files do not establish that a service is alive or healthy.

## Source contracts

- `pyproject.toml:13,22`: Python >=3.12; `jev` enters `jev_gateway.cli.main:main`; `jev-gateway` enters `jev_gateway.gateway:run_gateway`.
- `jev_gateway/cli/paths.py:25`: runtime precedence is explicit `--home`, `JEV_GATEWAY_HOME`, install state's `runtime_dir`, then `~/.jev-gateway`. Install state defaults to `~/.local/state/jev-gateway/install.json`, with `XDG_STATE_HOME` override. Runtime files are `models.json`, `.env`, `.env.backup`, `models.json.bak`, `jev-records.sqlite3`, `run/gateway.pid`, and `logs/gateway.log`.
- `jev_gateway/cli/install_state.py:29,51`: default recorded tool bin is `~/.local/bin` with `UV_TOOL_BIN_DIR` override. Init preserves existing models/env, copies packaged templates only when absent, creates run/log directories, and records provenance atomically with state mode 0600. It applies 0600 to a newly created env; it does not repair an existing env's mode.
- `jev_gateway/cli/process.py:126`: background execution uses the invoking CLI's `sys.executable`, not PATH's Python: `python -m jev_gateway.cli.server --home <resolved-home> --token <marker>`. Child inherits environment plus resolved `JEV_GATEWAY_HOME`, detaches with `start_new_session=True`, and appends stdout/stderr to the runtime log. PID state is 0600.
- `jev_gateway/cli/server.py:9` sets the home before importing gateway. `gateway.py:159,1585` uses explicit home or cwd and constructs the app at module import. Direct `jev-gateway` has cwd fallback, while `jev start` supplies the resolved CLI runtime home.
- `catalog.py:267`: default bind is 127.0.0.1:8000. Storage paths resolve relative to the catalog directory (`gateway.py:165`). Declared provider credentials must exist (`catalog.py:888`).
- `cli/main.py:137`: `start` waits up to 10 seconds for ownership plus reachable `/healthz`. `start --wait 0` returns starting without health verification. `status` requires owned process and reachable health. Plain `restart` stops and starts without health wait. `restart-if-running` verifies identity, validates before stopping, then waits for health; absent/dead process is a no-op.
- `cli/process.py:21`: ownership uses `ps -ww -p PID -o args=` and `ps -p PID -o stat=`, then `shlex.split`; stop refuses mismatched ownership. Windows is explicitly unsupported; Darwin is not rejected.

## Failures to investigate

1. Confirmed local installation gap: default formal executables/tool environment/state are absent, while checkout PATH supplies `jev`. Acceptance must call the installed absolute executable from outside the repository.
2. Confirmed source limitation: paths with spaces can fail ownership verification. `tests/test_cli_process.py:69` reads actual unquoted `ps` arguments and asserts `_owned(...) is False` for a home with spaces. The preceding mocked quoted-path test passes. This affects status/start polling/stop/update restart and is relevant to custom macOS homes. No service was launched here to reproduce it.
3. Hypothesis: direct `jev-gateway` invoked outside the runtime without `JEV_GATEWAY_HOME` loads the wrong cwd catalog; this follows the source path rules but was not executed.
4. Hypothesis: cold installed startup may exceed the 10-second health deadline; timeout leaves the child running. Startup configuration errors or address conflicts can instead produce `start_failed`. Source confirms these behaviors; there is no observed macOS traceback.
5. Hypothesis: proxy environment can interfere with health checks because `cli/health.py:11` uses `httpx.get` with default environment handling. Verify in an isolated environment if health reports unreachable despite a listening child.

## HTTP configuration and lifecycle boundaries

- Provider CRUD: GET `/v1/provider-configuration`; POST `/v1/provider-configuration/validate`; PUT `/v1/provider-configuration` (`gateway.py:742,778,783`). Delete is an operation within PUT, not an HTTP DELETE route. Body contract is `expected_revision` plus operations: upsert/delete for llm/decision providers, and confirmed model import. Credentials use keep/set/clear (`provider_config.py:183`; `.trellis/spec/backend/provider-configuration.md`).
- Routing overlay: GET, PUT, DELETE `/v1/routing/configuration`; POST `/v1/routing/configuration/validate` (`gateway.py:862,957,977,1025`).
- POST `/v1/routing/reload` reloads the catalog without process restart (`gateway.py:1077`). `/healthz` and `/dashboard` support readiness/UI checks. There are no HTTP service start/stop/restart routes in gateway/dashboard source. Service lifecycle is CLI-owned.
- Provider and routing writes require a configured gateway key and matching Bearer authentication; absent key produces 403 `config_writes_disabled`, wrong key 401. Provider stale revision produces 409. Provider validation has no write/activation. Storage changes require restart. Host/port cannot change the bound socket through reload (`GatewayConfig.apply_settings`).

## Acceptance commands for the main agent

Use an absolute installed `jev` executable and an isolated home/state/tool installation. Do not run these lifecycle or write steps against the existing home during research.

1. Installed `jev --json --version`, `jev --help`, and package/interpreter metadata should establish v0.1.0, Python >=3.12, installed entry point, and cwd independence.
2. `jev --home <isolated-home> --json config path`, `config validate`, and `doctor`; filter output to presence/validity/provenance, without printing config or credential values.
3. `jev --home <isolated-home> --json start --wait 30`, then `status`; assert `/healthz`, `/v1/models`, `/dashboard`, and referenced bundled JS/CSS are reachable. Use fake local credentials and no generation calls.
4. Exercise provider GET, validate, PUT upsert/import/delete, revision conflict, and routing validate/apply/reset against the isolated runtime. Assert validation leaves disk bytes unchanged, committed mutations survive restart, and missing/wrong gateway auth is refused. Keep request/response bodies out of shared logs.
5. `config reload`, `restart`, then `status` (restart alone does not prove readiness), followed by `restart-if-running` and `stop`. Verify stopped update is a no-op and data/config hashes remain stable. Include a runtime path with spaces as an explicit ownership regression probe.
6. `uninstall --dry-run`; isolated actual uninstall must preserve runtime by default. Purge requires explicit confirmation. Do not uninstall the existing user environment.

Existing checks: `tests/test_cli_home.py`, `test_cli_install_state.py`, `test_cli_process.py`, `test_cli_main.py`, `test_cli_review_regressions.py`, and `test_cli_templates.py` cover path/state/lifecycle/template contracts. `scripts/validate-release.py` validates tag/version, wheel metadata, both entry points, Python requirement, source parity, bundled assets/templates, and checksums. It generates artifacts and is not a read-only smoke command. `.github/workflows/release.yml` builds frontend, runs pytest/pyright/build/validation on Ubuntu, then publishes four assets. It contains no installed-tool or macOS smoke stage and refuses an already-existing Release. The CLI spec requires a throwaway-home installed-tool smoke but no standalone smoke helper was found among the top-level scripts.
