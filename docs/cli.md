# JEV CLI

The `jev` command manages the local gateway process, runtime configuration, and provider API keys. It does not reuse authentication from Codex, Claude, or another provider CLI.

## Install and output

On macOS or Linux, install with:

```sh
curl -fsSL https://raw.githubusercontent.com/TexasOct/jev-gateway/main/scripts/install.sh | sh -s -- --yes
```

The raw `main` bootstrap resolves the latest published stable GitHub Release, downloads `jev_gateway-X.Y.Z-py3-none-any.whl` and its `.sha256` sidecar from that Release, and verifies the checksum before installing. It fails if no stable Release or matching assets exist; it never falls back to Git `main`. Pin or roll back to a published version with `--version X.Y.Z` (optional leading `v`); explicit prereleases such as `--version 0.2.0rc1` are allowed. `--ref REF` remains an explicit Git-source developer option, mutually exclusive with `--version`, and does not verify a release checksum. `--dry-run` makes no network requests or changes and cannot confirm which latest Release or checksum is available. Rerunning the installer preserves runtime configuration and records.

`--yes` allows the bootstrap to install `uv` when it is missing. Review the installer before piping it into a shell, or download it and run `sh install.sh --yes`. If `uv` is already installed, `--yes` is not needed. Windows is not supported by this installer; use the source checkout or Docker instructions in [local installation](local-install.md).

Commands accept `--json` for one JSON document on stdout. Errors contain `error.code` and `error.message`; exit statuses are 0 success, 1 operation failure, 2 usage/platform failure, 3 invalid configuration, 4 not running, 5 already running, and 6 installation state unavailable. Prompts are disabled in JSON mode, quiet mode, and when stdin is not a terminal.

`--home PATH` overrides the runtime directory. Otherwise `JEV_GATEWAY_HOME`, recorded install state, then `$HOME/.jev-gateway` are used.

## Service commands

```sh
jev doctor
jev status
jev start [--foreground] [--wait SECONDS]
jev stop [--timeout SECONDS] [--force]
jev restart
jev logs [-n N] [--follow]
```

The managed background server records its PID under `run/gateway.pid` and output in `logs/gateway.log`. `jev-gateway` remains the foreground server entry point.

## Configuration

```sh
jev config path
jev config show
jev config validate
jev config reload
```

The CLI can write provider and model entries. Policy, strategies, gateway, storage, decision, and signals are read-only. Secret variables are displayed by name and presence only.

## Providers and credentials

Add official API-key providers by choosing model names explicitly:

```sh
jev provider add openai --model gpt-model
jev provider add anthropic --model claude-model
jev provider add deepseek --model deepseek-model
jev provider add custom --id my-endpoint --type openai \
  --api-base https://example.invalid/v1 --api-key-env MY_API_KEY --model model-name
```

Use `--tag` one or more times to add the models to routing pools. Without tags, models remain manually selectable. To add credentials, supply an environment-variable name with `--secret-env NAME`, or use `--secret-stdin`; an interactive no-echo prompt is available on a terminal. The name is not a key value. There is no secret-valued command-line option.

Login is a separate API-key capture flow. It works before adding a supported preset and can rotate an existing provider's key:

```sh
jev provider login openai --secret-env OPENAI_KEY_INPUT
printf '%s\n' "$KEY" | jev provider login openai --secret-stdin
jev provider logout openai
jev provider list
```

Login stores only the provider's declared key variable in the runtime `.env`, mode `0600`, and keeps the previous `.env` in `.env.backup` when rotating. Logout removes the variable from `.env` but does not revoke the upstream key, unset a parent-shell variable, or delete provider/model entries. Neither login nor add reads another CLI's account state.

`jev provider remove ID` refuses providers with models unless `--force` is passed. Mutating commands accept `--dry-run`.

## Removal

```sh
jev uninstall --dry-run
jev uninstall
jev uninstall --purge --yes
```

Normal uninstall removes the CLI and install state but preserves `models.json`, `.env`, and records. `--purge` removes the runtime directory and requires `--yes` for noninteractive execution. Review the dry-run plan first.
