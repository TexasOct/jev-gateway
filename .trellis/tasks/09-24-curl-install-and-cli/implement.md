# Implementation plan: curl installer and `jev` CLI

Ordered stages. Each stage ends with a verifiable checkpoint; finish a stage
before starting the next.

## Stage 0 — Read before writing

1. Read `.trellis/spec/backend/index.md`, `quality-guidelines.md`, and
   `directory-structure.md`.
2. Read `docs/models-config.md` for the provider and model field rules and
   `docs/http-api.md` for the reload and health contracts.
3. Read `jev_gateway/catalog.py` (`provider_from_dict`, `profile_from_dict`,
   `catalog_from_document`, `__all__`) and `jev_gateway/routing_overlay.py`
   (`read_models_document`, `write_overlay`).
4. Confirm the import boundary holds:

   ```bash
   .venv/bin/python -c "import jev_gateway.catalog, jev_gateway.routing_overlay, jev_gateway.dashboard; import sys; print('gateway imported:', 'jev_gateway.gateway' in sys.modules)"
   ```

   Expected: no `jev_gateway.gateway` import and no catalog load.

## Stage 1 — CLI skeleton, output contract, runtime paths

Files: `jev_gateway/cli/__init__.py`, `cli/output.py`, `cli/paths.py`,
`cli/main.py`; `pyproject.toml`.

1. Add the `jev` entry point in `[project.scripts]`. Leave `jev-gateway` untouched.
2. `cli/output.py`: `ExitCode` constants, `CliError` carrying `code`/`message`/
   `exit_code`/`details`, and emitters for human and `--json` modes. `--json`
   writes one document to stdout; everything else goes to stderr.
3. `cli/paths.py`: runtime-directory precedence (`--home`, `JEV_GATEWAY_HOME`,
   install state, `$HOME/.jev-gateway`) and the derived path set from `design.md`.
   Add `has_terminal()` and a prompt helper that raises `CliError` with
   `prompt_suppressed` when stdin is not a terminal or `--json`/`--quiet` is set.
4. `cli/main.py`: `argparse` subcommands for every row in the design's command
   surface, `main(argv) -> int`, and `if __name__ == "__main__"` wiring. Stub
   handlers raise `CliError("not_implemented", ...)` so the dispatch and output
   contracts are testable first.
5. `tests/test_cli_main.py`, `tests/test_cli_home.py`.

Checkpoint:

```bash
uv run pytest -q tests/test_cli_main.py tests/test_cli_home.py
uv run jev --json --version
uv run jev --json config path
```

## Stage 2 — Catalog read, validate, write

Files: `jev_gateway/cli/config_ops.py`, `jev_gateway/cli/redact.py`; extend
`cli/main.py` and `cli/output.py`.

1. `config_ops.py`: `read_document(path)`, `validate_document(document, source)`,
   `write_document_atomic(path, document)` (temp file in the same directory plus
   `os.replace`, `indent=2`, trailing newline), and `backup(path)` to
   `models.json.bak`.
2. `config_ops.py`: redaction helpers returning variable names plus `has_value`
   for `api_key_env` and `param_env`. No resolved value may enter a returned
   structure.
3. `jev config path`, `jev config show`, `jev config validate`, `jev config reload`.
4. `tests/test_cli_config_ops.py`: writes preserve unrelated entries, a rejected
   document leaves the file byte identical, `.bak` holds the previous content,
   redaction never yields a secret, `validate` exits 3 on a broken catalog.

Checkpoint:

```bash
uv run pytest -q tests/test_cli_config_ops.py
uv run jev --json config validate
uv run jev --json config show | python3 -m json.tool >/dev/null && echo json-ok
```

## Stage 3 — Provider add, list, remove

Files: `jev_gateway/cli/providers.py`, `jev_gateway/cli/secrets.py`; extend
`cli/main.py`.

1. `providers.py`: the preset table, argument-to-entry mapping, tag appends on
   the new model only, and preflight error codes from `design.md`.
2. `secrets.py`: `.env` upsert preserving other lines, mode `0600`,
   `.env.backup` before the first change in a run, and the three secret input
   paths. Reject any attempt to pass a secret as a flag value.
3. `jev provider add|list|login|logout|remove` with `--dry-run` on the
   mutating commands. Login reads an existing provider's declared
   `api_key_env`, writes only `.env`, and can rotate the key. Logout removes
   only that declared `.env` variable and leaves `models.json` unchanged.
4. `tests/test_cli_providers.py`: each preset, duplicate provider ID, duplicate
   `(provider, upstream_model)`, unknown preset, unsupported `type`, tag append
   without touching other models, `.env` upsert, `0600` mode, login against an
   existing provider, key rotation, logout preserving the catalog, login
   failure with no `api_key_env`, and assertions that no secret value appears
   in stdout, stderr, JSON, logs, or unrelated written files.

Checkpoint:

```bash
uv run pytest -q tests/test_cli_providers.py
export JEV_GATEWAY_HOME=$(mktemp -d)
cp models.json "$JEV_GATEWAY_HOME/models.json"
uv run jev --json provider add custom --id demo --type openai \
  --api-base https://example.invalid/v1 --api-key-env DEMO_API_KEY \
  --model demo-model --tag task_aware/draft --dry-run
```

## Stage 4 — Packaged templates and `jev install init`

Files: `jev_gateway/templates/models.example.json`,
`jev_gateway/templates/env.example`; `pyproject.toml`; `cli/install_state.py`;
`cli/main.py`; `tests/test_cli_templates.py`.

1. Copy the root `models.example.json` and `.env.example` into the package
   templates directory and add `[tool.setuptools.package-data]`.
2. `cli/install_state.py`: read, write, and clear the XDG state file; treat a
   missing or unreadable file as `unmanaged` rather than an error.
3. `jev install init --home DIR --ref REF --method NAME`: create the runtime
   directory, copy templates only when absent (report `created` or `preserved`
   per path), create `run/` and `logs/`, write state.
4. `tests/test_cli_templates.py`: templates equal the root examples byte for
   byte; `install init` preserves existing `models.json`/`.env`; state round-trips.

Checkpoint:

```bash
uv run pytest -q tests/test_cli_templates.py
uv build
python3 -c "
import glob, zipfile
whl = sorted(glob.glob('dist/*.whl'))[-1]
with zipfile.ZipFile(whl) as z: names = z.namelist()
assert any(n.startswith('jev_gateway/templates/') for n in names), names
assert any(n.startswith('jev_gateway/static/') for n in names), names
import re
meta = zipfile.ZipFile(whl).read([n for n in names if n.endswith('METADATA')][0]).decode()
print([l for l in meta.splitlines() if l.startswith('License')])
print([n for n in names if n.endswith('entry_points.txt')])
"
```

The wheel must still list `jev_gateway/static/`, report
`License-Expression: AGPL-3.0-or-later`, and expose both entry points.

## Stage 5 — Process lifecycle

Files: `jev_gateway/cli/process.py`, `cli/health.py`; extend `cli/main.py`;
`tests/test_cli_process.py`.

1. `process.py` with an injectable process factory; `start` writes the PID file
   and appends to `logs/gateway.log`; `status` handles dead PID, live PID, and
   probe outcomes; `stop` sends `SIGTERM`, polls `--timeout`, and honors
   `--force`; `logs` supports `-n` and `--follow`.
2. `health.py`: liveness probe against `browsable_host(host)` and the catalog
   port, adding the Bearer token when `gateway.api_key_env` resolves. Never log
   or print the token.
3. `jev start|stop|restart|status|logs|doctor`.
4. Unsupported platforms return `unsupported_platform` with exit code 2.
5. `tests/test_cli_process.py` with a fake process factory: start writes a PID
   file, stale PID clears, stop timeout returns exit 1, `--force` escalates,
   already-running returns exit 5, not-running stop returns exit 4.

Checkpoint:

```bash
uv run pytest -q tests/test_cli_process.py
```

Then one manual smoke test in a throwaway home: `jev install init`, `jev start`,
`jev status`, `jev logs -n 20`, `jev stop`, `jev status` (expect exit 4).

## Stage 6 — Uninstall

Files: `jev_gateway/cli/uninstall.py`; `scripts/uninstall-local.sh`;
`tests/test_cli_install_state.py`.

1. `uninstall.py` builds a plan (paths plus the uv command) and executes it.
   Runtime data is preserved unless `--purge`.
2. `--dry-run` prints the plan and exits 0. `--purge` without `--yes` and
   without a terminal refuses with `confirmation_required`.
3. Add the delegation branch to `scripts/uninstall-local.sh`, keeping the current
   behavior when no `jev` is on `PATH`.
4. Tests assert the preserved set (`models.json`, `.env`, records) is untouched,
   `--purge` removes the runtime directory, and `--dry-run` changes nothing.

Checkpoint:

```bash
uv run pytest -q tests/test_cli_install_state.py
sh -n scripts/uninstall-local.sh && sh -n scripts/install.sh
```

## Stage 7 — Curl installer

Files: `scripts/install.sh`; `tests/test_install_script.py`.

1. Write `install.sh` per `design.md`: platform check, `uv` discovery and
   optional installation, `uv tool install --force` from the resolved ref,
   `jev install init` handoff, PATH hint, `--dry-run`.
2. Keep it POSIX `sh`, `set -eu`, and free of JSON manipulation.
3. Test the script's flag parsing and `--dry-run` output without network access
   by stubbing `uv` on `PATH` with a temporary shell script.

Checkpoint:

```bash
uv run pytest -q tests/test_install_script.py
sh -n scripts/install.sh
PATH="$PWD/tests/fixtures/bin:$PATH" sh scripts/install.sh --dry-run --no-init --home /tmp/jev-dry-run
```

No step in this stage may reach the network during tests.

## Stage 8 — Documentation

Files: `README.md`, `README.zh-CN.md`, `docs/cli.md`, `docs/local-install.md`.

1. Add the curl method as the first installation option in `docs/local-install.md`,
   keeping the existing three methods below it.
2. Write `docs/cli.md`: command reference, `--json` contract, exit codes,
   provider presets, the separate API-key `provider login` / `provider logout`
   flow, secret input paths, and uninstall / `--purge` semantics.
3. Update `README.md`, then mirror it in `README.zh-CN.md`: same heading order
   and levels, same code blocks apart from translated comments, same link
   targets.
4. Record the Windows exclusion and the alternative install path in both READMEs.

Checkpoint: heading order and link targets match between the two READMEs; every
command named in the docs exists in `jev --help`.

## Stage 9 — Full verification

```bash
uv sync --all-groups
uv run pytest -q
uvx pyright
uv build
```

Also confirm:

- All 396 pre-existing tests still pass, with no edits to existing test files
  beyond `tests/helpers.py` additions if a shared catalog builder is needed.
- `git stash list` is empty of stray stashes and `models.json` in the working
  tree is unchanged from before the task (`git diff --stat -- models.json` shows
  nothing).
- `git status --porcelain` shows no new file under `$HOME/.jev-gateway`, no
  `run/` directory, and no `logs/gateway.log` committed.

## Risky files and rollback points

| File | Risk | Rollback |
| --- | --- | --- |
| `pyproject.toml` | Entry point or package-data mistake breaks the wheel | Revert the hunk; `uv build` + wheel content check restores confidence |
| `scripts/uninstall-local.sh` | Delegation could remove the wrong files | Revert the hunk; the script's original body is unchanged below the new branch |
| `models.json` (runtime, not tracked) | A CLI bug could rewrite it | `models.json.bak` plus `--dry-run`; the repo's `models.json` is never touched by tests |
| `jev_gateway/cli/paths.py` | Wrong precedence makes the CLI operate on the wrong home | Revert to `JEV_GATEWAY_HOME`-or-`$HOME/.jev-gateway` only |

Do not commit. Commit is Phase 3.4, driven separately.

## Follow-up checks before `task.py start`

- [ ] `prd.md`, `design.md`, and `implement.md` reviewed by the user.
- [x] `implement.jsonl` and `check.jsonl` carry real entries.
- [ ] No unresolved product decision remains.
