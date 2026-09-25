# Technical design: curl installer and `jev` CLI

## Boundaries

Three layers, in dependency order:

1. `scripts/install.sh` — POSIX `sh` bootstrap. Resolves the reference to install,
   ensures `uv` exists, installs the tool, then hands off to the CLI for runtime
   initialization. It owns no JSON logic.
2. `jev_gateway/cli/` — the `jev` command. Owns argument parsing, output
   contracts, runtime-directory resolution, install state, process lifecycle,
   and catalog mutation.
3. `jev_gateway/catalog.py` and `jev_gateway/routing_overlay.py` — existing
   parsing and atomic-write helpers. The CLI consumes them and adds no new
   parsing rules.

`jev_gateway/gateway.py` is **not** importable from the CLI. It executes
`app = create_app(load_gateway_config())` at module import, so any import would
load a catalog, resolve secrets, and fail hard in a bare shell. The CLI launches
the server as a subprocess instead of importing it. `jev_gateway/dashboard.py`
is import-safe (it imports `fastapi` and `records` only) and supplies
`browsable_host()` and `static_directory()` for reuse.

## Command surface

Global flags: `--home PATH`, `--json`, `--quiet`, `--verbose`, `--version`, `-h`.

| Command | Purpose |
| --- | --- |
| `jev doctor` | Install, runtime, catalog, and credential-presence report |
| `jev status` | Process state plus an HTTP liveness probe |
| `jev start [--foreground] [--wait SECONDS]` | Start the server in the background (or foreground) |
| `jev stop [--timeout SECONDS] [--force]` | Stop the background server |
| `jev restart` | `stop` then `start` |
| `jev logs [-n N] [--follow]` | Tail the background server log |
| `jev config path` | Resolved `models.json`, `.env`, record, pid, and log paths |
| `jev config show` | Redacted effective configuration summary |
| `jev config validate` | Full catalog load; report the validation error |
| `jev config reload` | `POST /v1/routing/reload` against the running server |
| `jev provider list` | Providers with model counts and key presence |
| `jev provider add PRESET [flags]` | Add a provider and its models |
| `jev provider login ID [flags]` | Set or rotate the API key declared by a provider |
| `jev provider logout ID [flags]` | Remove the provider's stored key without deleting its catalog entry |
| `jev provider remove ID [--force]` | Remove a provider and its models |
| `jev install init` | Create the runtime directory from packaged templates |
| `jev uninstall [--dry-run] [--purge] [--yes]` | Remove owned files |

Mutating commands (`provider add`, `provider login`, `provider logout`,
`provider remove`, `install init`, `uninstall`) accept `--dry-run` and print the
planned actions without writing.

## Runtime directory resolution

First match wins:

1. `--home PATH`
2. `JEV_GATEWAY_HOME`
3. `runtime_dir` recorded in the install state file
4. `$HOME/.jev-gateway`

This keeps `JEV_GATEWAY_HOME` authoritative for the server and lets the
installer record a non-default choice without exporting it into every shell.
`--home` is a CLI-only override: it does not change what an already-running
server loaded.

Derived paths, all relative to the resolved home:

| Path | Purpose |
| --- | --- |
| `models.json` | Catalog (existing behavior) |
| `.env` | Secrets named by the catalog (existing behavior) |
| `.env.backup` | Previous `.env`, written only when a secret is upserted |
| `models.json.bak` | Previous catalog, written on each successful catalog write |
| `run/gateway.pid` | Background server PID |
| `logs/gateway.log` | Background server stdout and stderr |

## Install state

Machine-scoped, not runtime-scoped, because one tool installation exists per
machine:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/jev-gateway/install.json
```

```json
{
  "version": 1,
  "installed_at": "2026-09-24T00:00:00Z",
  "method": "isolated",
  "ref": "main",
  "tool": "jev-gateway",
  "tool_bin_dir": "/home/user/.local/bin",
  "runtime_dir": "/home/user/.jev-gateway",
  "source": "git+https://github.com/TexasOct/jev-gateway@main"
}
```

`jev uninstall` reads this file to learn exactly which paths it owns. A missing
or unreadable state file is not fatal: uninstall reports `install_state_missing`,
still removes the known `jev`/`jev-gateway` executables when present, and never
guesses at paths outside those two names.

Absent state, `jev doctor` reports the installation as `unmanaged` rather than
inventing metadata.

## Installer design

`scripts/install.sh`:

```sh
curl -fsSL https://raw.githubusercontent.com/TexasOct/jev-gateway/main/scripts/install.sh | sh
```

| Flag | Default | Effect |
| --- | --- | --- |
| `--ref REF` | `main` (or `JEV_INSTALL_REF`) | Git ref to install |
| `--home DIR` | `$JEV_GATEWAY_HOME` or `$HOME/.jev-gateway` | Runtime directory |
| `--no-init` | init runs | Install the tool only |
| `--dry-run` | off | Print the commands instead of running them |
| `--yes` | ask | Skip the confirmation before installing `uv` |

Steps: reject non-Darwin/non-Linux hosts with exit code 2; find `uv` on `PATH`,
else install it from `https://astral.sh/uv/install.sh` after confirmation (or
`--yes`, or `--no-uv` to refuse); run
`uv tool install --force "git+https://github.com/TexasOct/jev-gateway@$ref"`;
run `jev install init --home "$home" --ref "$ref" --method isolated`; print the
PATH hint when the tool bin directory is not on `PATH`.

Piping to `sh` means stdin is the script, so any command that reads stdin must
be given `< /dev/tty` explicitly. The `uv` installer is the only such command;
when stdin is not a terminal it runs with `--no-modify-path` and the script
prints the manual PATH line.

`jev install init` owns template copying so JSON handling stays in Python:
create the runtime directory, copy `models.json` and `.env` from packaged
templates only when absent, create `run/` and `logs/`, and write install state.
Existing files are never overwritten; when a file already exists, the command
reports `preserved` for that path.

### Packaged templates

`models.example.json` and `.env.example` live at the repository root and are
referenced by `README`, `Dockerfile`, and `container-entrypoint.sh`. A wheel
installed from git has no repository root, so the CLI cannot read them.

Add `jev_gateway/templates/models.example.json` and
`jev_gateway/templates/env.example` as the packaged copies, declared in
`[tool.setuptools.package-data]`. The existing wheel already ships
`jev_gateway/static/` without a `MANIFEST.in`, so package-directory data files
are included; the new directory follows the same shape.

A test asserts the packaged templates are byte-identical to the repository-root
examples, which is what prevents the two copies from drifting.

## Process lifecycle

`cli/process.py` accepts an injectable process factory (default
`subprocess.Popen`) so tests never spawn a real server.

Start: read `gateway.host` and `gateway.port` from the parsed catalog, launch
`[sys.executable, "-c", "from jev_gateway.gateway import run_gateway; run_gateway()"]`
with `JEV_GATEWAY_HOME` set to the resolved home, `start_new_session=True`,
stdout and stderr appended to `logs/gateway.log`, and write the child PID to
`run/gateway.pid`. Using `sys.executable` rather than a `PATH` lookup guarantees
the child runs the same environment the CLI runs in.

Status: read the PID file; a missing file or a PID that is not alive reports
`not_running` and removes a stale PID file. When the process is alive, probe
`http://<browsable_host(host)>:<port>/healthz` with a short timeout and report
`running` with the probe result, or `running_unreachable` when the probe fails.
When `gateway.api_key_env` resolves to a value, the probe sends it as a Bearer
token; the value is never echoed.

The probe distinguishes three outcomes because they need different user actions:
a dead process, a live process that is still binding its socket, and a live
process whose health endpoint answers with `degraded` storage. A single boolean
would collapse those into one unhelpful message.

Stop: send `SIGTERM`, poll for exit up to `--timeout` (default 10s), then report
`stop_timeout` with exit code 1. `--force` follows with `SIGKILL`. Stopping when
nothing runs is `not_running` with exit code 4, not a silent success, because an
agent asking for a stopped gateway and getting exit 0 cannot tell whether it was
already stopped or actually stopped now.

Windows is unsupported: the CLI reports `unsupported_platform` and the
installer refuses, rather than shipping untested signal handling.

## Output contract

Human mode writes aligned text to stdout. `--json` writes exactly one JSON
document to stdout and nothing else; diagnostics, if any, go to stderr.

Success:

```json
{"ok": true, "command": "provider.add", "data": {"providers": ["openai"], "models": ["openai/gpt-5.6-sol"]}}
```

Failure:

```json
{"ok": false, "command": "provider.add", "error": {"code": "provider_exists", "message": "Provider 'openai' already exists."}}
```

Exit codes are stable:

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Operation failed (network, filesystem, timeout) |
| 2 | Usage error, unsupported platform |
| 3 | Invalid configuration |
| 4 | Gateway not running |
| 5 | Gateway already running |
| 6 | Not installed, or install state missing |

Prompts are disabled when `--json` is set, when `--quiet` is set, or when stdin
is not a terminal. In those cases a value that would have been prompted for
becomes a usage error naming the missing flag. This is the property that makes
the CLI usable from an agent: it never blocks on input nobody will answer.

## Provider addition

Presets:

| Preset | `type` | `api_base` | `api_key_env` |
| --- | --- | --- | --- |
| `openai` | `openai` | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| `anthropic` | `anthropic` | none (LiteLLM native) | `ANTHROPIC_API_KEY` |
| `deepseek` | `deepseek` | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` |
| `custom` | `--type` required | `--api-base` required | `--api-key-env` required |

`--model NAME` is repeatable and required: upstream model names change faster
than this repository releases, so a hardcoded default list would ship stale
names. The flag's error message shows the preset's documented examples instead.

Other flags: `--id` (provider ID, defaulting to the preset name), `--api-key-env`
(override the variable name, which is how the existing `JEV_OPENAI_API_KEY`
setup keeps working), `--tag` (repeatable), `--priority`, `--quality`,
`--context-window`, `--max-output-tokens`, `--set-defaults`.

Written entries stay minimal: `{"provider": ..., "upstream_model": ...}` plus
only the flags the caller passed. Cost fields are not written, because inventing
per-token prices would place fabricated numbers into routing decisions. Omitting
`capabilities` uses the catalog defaults, which are documented.

`--set-defaults` is the one flag that opts into a fuller entry: it fills
`context_window`, `max_output_tokens`, and `capabilities` from the preset's
documented values for that model name. Off by default, because those values
would otherwise be guesses.

`provider add` registers the catalog entry and model. A separate
`jev provider login ID` command handles official API-key onboarding and
rotation, before or after addition. The add command may still accept an
explicit secret source for noninteractive one-step setup, but it never reads
another CLI's login state.

### Secret handling

Three paths, all avoiding a secret in `argv` (and therefore in shell history and
`ps` output):

- `--secret-env NAME` reads the value from `$NAME` in the CLI's environment.
- `--secret-stdin` reads it from stdin, once, at most 8 KiB.
- A no-echo prompt reads it interactively when a terminal is attached.

Any of them upserts `NAME=value` into the runtime `.env`; `NAME` is the
provider's declared `api_key_env`, or the preset's default when login precedes
addition. `provider add` also writes that variable name into the catalog entry.
Before changing an existing `.env`, copy it to `.env.backup`. Both files have
mode `0600`; no other file contains the key. Upsert preserves every other line
and replaces only the matching `NAME=` assignment.

There is no `--api-key VALUE` flag. A convenience flag that leaks secrets into
shell history is worse than a slightly longer command line.

When no secret flag is given to `provider add` in noninteractive mode, the CLI
writes the provider reference only and reports `secret_not_set`, listing the
variable name. This supports clusters where the secret already comes from the
environment. `provider login` instead requires a secret source or a TTY prompt.

### Separate provider login

`jev provider login ID` is the dedicated API-key setup and rotation command.
For an existing provider, it reads that provider's declared `api_key_env`, never
a key from another CLI's login state. For a supported preset that is not yet in
`models.json`, it uses the preset's variable name, so login can precede provider
addition. Unknown IDs fail with `provider_missing`; existing providers without
`api_key_env` fail with `provider_has_no_key_reference`. It accepts
`--secret-env SOURCE_NAME`, `--secret-stdin`, or a no-echo terminal prompt.
`SOURCE_NAME` is where the key is read from, not the catalog's destination
variable name. The caller may run it again to rotate a key. It cannot silently
switch an existing provider's credential reference to another variable; that
requires an explicit catalog edit.

`jev provider logout ID` removes only the provider's declared variable (or a
not-yet-added supported preset's variable) from the runtime `.env`. It leaves
providers and models in `models.json`.
Logout does not revoke an upstream API key, remove a value exported by the
parent shell, or change credentials managed outside `.env`; it reports this
limit. A later gateway start may fail until a valid key is supplied again.

For both commands, `--dry-run` reports the variable name and planned action,
not the secret. An existing-provider login can update only `.env`; it needs no
catalog write or backup. After login, the CLI reports whether the live gateway
needs reload. It does not print or store the key elsewhere.

## Catalog mutation

`cli/config_ops.py`:

1. Read `models.json` with `read_models_document()` from `routing_overlay`.
2. Mutate `providers` and `models` lists in place.
3. Validate the whole document through `catalog_from_document()` so every
   existing rule applies, including the LiteLLM provider-type check, the
   `openai`-requires-`api_base`-and-`api_key_env` rule, and canonical model ID
   uniqueness.
4. Write atomically with the same temp-file-plus-`os.replace` approach as
   `write_overlay()`.
5. Back up the previous file to `models.json.bak`.

Step 3 runs before the write, so a rejected mutation leaves the file byte
identical on disk. The validation runs against the candidate document, not the
file, so the rejection message names the real problem.

Preflight checks produce specific error codes before validation runs:
`provider_exists`, `provider_missing`, `model_exists`, `model_missing`,
`provider_in_use`, `unknown_preset`, `unsupported_provider_type`.

`provider remove` refuses while other providers' models reference nothing (it
only owns its own models) and refuses to remove a provider that still has models
unless `--force` is passed, in which case that provider's models are removed with
it. Removing a provider never touches other providers, the policy, or strategy
definitions; models that carried tags lose those tags, which reduces the routing
pool. The command reports the affected tags so the change is visible rather than
silent.

Tag handling: `--tag` values are appended to the new model's own `tags` array.
Existing models' tags are never rewritten, so a shared pool keeps its other
members.

## Configuration reads

`jev config show` prints, per section, whether the CLI can write it:
`providers` and `models` are `writable`; `policy`, `strategies`, `gateway`,
`storage`, `decision`, and `signals` are `read_only`. Each section reports its
own shape rather than the whole document, so the output stays useful in a
terminal.

Redaction rule: any field named `api_key_env` or `param_env` reports the variable
name plus `has_value: true|false` computed with `os.getenv`. Resolved secret
values never appear in output, and `has_value` is the only derived fact.

`jev config validate` runs the full load and prints the exact validation message
with exit code 3 on failure. `jev config reload` calls
`POST /v1/routing/reload`, adding the Bearer token when `gateway.api_key_env`
resolves, and maps `401` to `reload_unauthorized`.

## Uninstall

`jev uninstall`:

1. Read install state. Missing state → `install_state_missing` in the report,
   continue with the two known executable names.
2. Remove the tool with `uv tool uninstall jev-gateway` when `uv` is available,
   otherwise remove the recorded tool bin entries directly.
3. Remove the `jev` and `jev-gateway` executables in the recorded bin directory.
4. Remove the install state file and its directory when empty.
5. Preserve `models.json`, `.env`, and the record database unconditionally.
6. Print the retained runtime directory and the `--purge` hint.

`--purge` additionally removes the runtime directory, after printing every path
it will delete. `--purge` without `--yes` and without a terminal refuses with
`confirmation_required`; with a terminal it asks once. `--dry-run` prints the
plan and exits 0 without touching anything.

Uninstall cannot remove the CLI's own running interpreter, so it never tries;
the executable it deletes takes effect on the next invocation.

`scripts/uninstall-local.sh` keeps its current behavior for existing users and
gains one branch: when a `jev` executable is on `PATH`, it delegates to
`jev uninstall "$@"` so the two paths cannot drift.

## Packaging changes

```toml
[project.scripts]
jev-gateway = "jev_gateway.gateway:run_gateway"
jev = "jev_gateway.cli.main:main"

[tool.setuptools.package-data]
jev_gateway = ["templates/*"]
```

The `jev-gateway` entry point is untouched, so foreground startup behavior is
unchanged. Any change to entry points requires `uv build` plus a wheel content
check, which the quality guidelines call for.

## Testing

New test files, all using `tmp_path` and monkeypatched `HOME`,
`JEV_GATEWAY_HOME`, and `XDG_STATE_HOME`:

| File | Covers |
| --- | --- |
| `tests/test_cli_main.py` | Dispatch, `--json` shape, exit codes, prompt suppression |
| `tests/test_cli_home.py` | Runtime directory precedence, derived paths |
| `tests/test_cli_config_ops.py` | Read, validate, atomic write, backup, rejection leaves file unchanged |
| `tests/test_cli_providers.py` | Presets, duplicates, tag appends, `.env` upsert, no secret in output |
| `tests/test_cli_process.py` | Start/stop/status with an injected fake process factory |
| `tests/test_cli_install_state.py` | State read/write, missing state, uninstall plan and `--purge` |
| `tests/test_cli_templates.py` | Packaged templates match the repository-root examples |

No test spawns a real server, reaches the network, or requires credentials. The
existing 396 tests must keep passing unchanged.

## Risks and rollback

| Risk | Mitigation |
| --- | --- |
| Catalog reformatting rewrites unrelated formatting | Key order survives the dict round-trip; only indentation normalizes. `--dry-run` prints the result first, and `models.json.bak` restores the previous file. |
| Background server outlives the CLI in a stale PID file | Status and stop treat a dead PID as `not_running` and clear the PID file. |
| An agent invokes a command that waits for input | Prompts are disabled without a terminal and under `--json`. |
| Secret reaches shell history or `ps` | No secret-valued flag exists; input is env, stdin, or no-echo prompt only. |
| Packaged templates drift from the root examples | A test asserts byte equality. |
| Installer behavior differs from `install-local.sh` | `install.sh` is additive; `install-local.sh` stays as the source-checkout path, and the shared logic lives in the CLI's `install init`. |

Rollback: every change is additive except the `pyproject.toml` entry-point
addition, the new package-data entry, and the delegation branch in
`scripts/uninstall-local.sh`. Reverting the task commit restores the previous
behavior with no migration to undo. `models.json` and `.env` are never migrated.

## Follow-ups deliberately not included

- Windows support and a service manager (launchd, systemd) unit.
- A `jev upgrade` self-update command.
- Release tagging, a Homebrew tap, and published wheels.
- CLI writes for policy, strategies, gateway, and storage settings.
