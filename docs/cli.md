# JEV CLI

The `jev` command manages the local gateway process, runtime configuration, and provider API keys. It does not reuse authentication from Codex, Claude, or another provider CLI.

## Install and output

On macOS or Linux, with Python 3.10+ available as `python3` and `curl`, install with:

```sh
curl -fsSL https://github.com/TexasOct/jev-gateway/releases/latest/download/install.sh | sh -s -- --yes
```

The URL selects the latest stable Release's `install.sh`. The script embeds its
release tag and downloads `jev_gateway-X.Y.Z-py3-none-any.whl` plus its `.sha256`
sidecar from that exact tag's asset URLs. It verifies the wheel before invoking
`uv tool install`. It does not resolve latest again or query the GitHub API for a
wheel. Rerunning it preserves runtime configuration and records.

For a pin or rollback, download the installer from the chosen published tag:

```sh
curl -fsSL https://github.com/TexasOct/jev-gateway/releases/download/v0.1.0/install.sh | sh -s -- --yes
```

Alternatively, pass `--version X.Y.Z` (optional leading `v`) to a Release
installer. Explicit prereleases such as `--version 0.2.0rc1` are allowed. If the
requested tag differs from the embedded tag, the script downloads the target
tag's `install.sh` and `install.sh.sha256`, verifies the checksum and exact
embedded tag, then invokes that installer once with the supported flags
forwarded. A matching tag installs directly; a delegated script cannot delegate
again. Missing assets, malformed checksums, or tag/digest mismatches stop before
child execution or tool installation. There is no fallback to `main`.

The initial `curl | sh` command executes the script without checking its
checksum. Follow the [pinned download, review, and verification example](local-install.md#verify-installer)
to check those bytes before execution. A checksum from the same Release detects
corruption or inconsistent assets; it is not an independent publisher signature.

| Installer option | Behavior |
| --- | --- |
| `--yes` | Permit installing `uv` from `astral.sh` when missing. Without it, noninteractive installation requires an existing `uv`. |
| `--no-uv` | Require an existing `uv`; never bootstrap it. |
| `--home DIR` | Set the runtime directory for initialization. |
| `--no-init` | Install the tool without initializing the runtime directory. |
| `--dry-run` | Print the plan without network requests, child execution, installation, or writes. It does not verify asset availability or checksums. |
| `--ref REF` | Explicit developer Git install, without Release checksum verification; cannot be combined with `--version`. |

The download in a `curl | sh ... --dry-run` command still uses the network; only
the installer itself performs no network requests. To preview without any
download, run a previously downloaded installer with `--dry-run`.

The checkout's `scripts/install.sh` is an unstamped template. It cannot perform
a Release install, even with `--version`; production installs must use a Release
asset. Its explicit developer escape is `sh scripts/install.sh --ref REF`.
For a source install with a dashboard, follow the frontend build and local
installer instructions in [local installation](local-install.md). Installed
Release wheels contain the dashboard and need no Node.js.

Windows is not supported by the curl installer; see the source checkout or
Docker instructions in [local installation](local-install.md).

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

The CLI can write provider and model entries. Policy, strategies, gateway, storage, and decision are read-only. Secret variables are displayed by name and presence only.

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
