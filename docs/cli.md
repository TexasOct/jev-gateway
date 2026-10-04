# JEV CLI

The `jev` command manages the local gateway process, runtime configuration, and provider API keys. It does not reuse authentication from Codex, Claude, or another provider CLI.

## Install and output

On macOS or Linux, with Python 3 available as `python3` for asset verification
and `curl`, install with:

```sh
curl -fsSL https://github.com/TexasOct/jev-gateway/releases/latest/download/install.sh | sh -s -- --yes
```

The URL selects the latest stable Release's `install.sh`. The script embeds its
release tag and downloads `jev_gateway-X.Y.Z-py3-none-any.whl` plus its `.sha256`
sidecar from that exact tag's asset URLs. It verifies the wheel before invoking
`uv tool install --python 3.12 --managed-python`. The gateway requires Python
3.12+; uv downloads managed Python 3.12 if needed and does not use an older system
interpreter for the tool. It does not resolve latest again or query the GitHub API for a
wheel. Rerunning it preserves runtime configuration and records. After a successful
Release wheel install, it restarts a gateway already running under CLI management
for the selected `--home`, waiting up to 10 seconds for health. If no managed
gateway was running, it leaves the service stopped. An unverified live PID is not
signalled. A failed restart returns a nonzero installer status after the wheel has
been installed; check `jev --home DIR status`, the PID file and logs before using
`jev --home DIR start`. This does not manage foreground or externally supervised
processes.

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
| `--no-init` | Skip runtime initialization; still restart an already running CLI-managed gateway after a Release wheel install. |
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

The managed background server records its PID under `run/gateway.pid` and output in `logs/gateway.log`. `jev-gateway` remains the foreground server entry point. It resolves its runtime directory from `JEV_GATEWAY_HOME`, recorded install state, then `$HOME/.jev-gateway`, independently of the current working directory. Configuration, credentials, and relative storage paths use that directory.

## Configuration

Fresh defaults contain strategy plans without providers or models. Start the
service and use the local dashboard initialization form, or set the initial
management key through the CLI:

```sh
jev setup
jev setup --secret-env GATEWAY_KEY_INPUT
printf '%s\n' "$KEY" | jev setup --secret-stdin
```

The interactive command uses a no-echo prompt. Noninteractive use requires an
explicit secret source; the key is never an argument or command result. Setup
stores its reference in `gateway.api_key_env` and its value in the protected
runtime `credentials.json`. An existing declared reference keeps its name;
setup uses the managed credential owner's default when no reference is declared.
It preserves existing configuration and cannot replace an effective management
key. If a declared gateway reference has no effective value, CLI setup can repair
that reference. Runtime startup and reload still reject a missing declared gateway
key; they cannot silently disable authentication. Providers and models may be configured later.
If the service is already running when CLI setup writes the files, run
`jev config reload` to activate the key before connecting to the dashboard.
New management keys must contain 16 to 8192 visible ASCII characters without
whitespace. This keeps the saved value valid in browser Authorization
headers. Existing credential files retain their original bytes and key parsing.

```sh
jev config path
jev config show
jev config validate
jev config reload
```

The CLI can write provider and model entries. Initial setup also establishes the
gateway key reference. The dashboard edits routing strategies and the global
default model, and supports gateway key replacement. Host, port, storage and
other runtime settings are edited in the configuration file. Credential references
are displayed by name and presence only. `jev config path` includes the neighboring
credential file. [Credential configuration](credentials.md) covers local Dashboard
setup and file configuration for servers. After file changes, `jev config reload` validates and
activates configuration without reinstalling the service. Host/port and storage
changes still require a process restart.

## Providers and credentials

Add official API-key providers by choosing model names explicitly:

```sh
jev provider add openai --model gpt-model
jev provider add anthropic --model claude-model
jev provider add deepseek --model deepseek-model
jev provider add gemini --model gemini-model
jev provider add openrouter --model vendor/model
jev provider add custom --id my-endpoint --type openai \
  --api-base https://example.invalid/v1 --api-key-env MY_API_KEY --model model-name
```

The CLI and dashboard share supplier presets for Chinese and international model
vendors, aggregators, cloud platforms and local services. `jev provider add --help`
lists every supported preset. Templates fill provider display/brand/icon fields
alongside transport settings; they never select models or routing tags for you.

Azure requires its resource endpoint through `--api-base`. Cloud templates can
require project or region parameters. Use `--param NAME=VALUE` for non-secret
completion settings (plain text or JSON), and `--param-env NAME=ENV` for an extra
credential supplied by an explicitly named environment variable:

```sh
jev provider add vertex_ai --model model-name \
  --param vertex_project=my-project --param vertex_location=us-central1 \
  --param-env vertex_credentials=PROJECT_CREDENTIALS
```

Populate declared environment references before validation. Optional references
are omitted unless supplied. Native local services do not require a fabricated
API key; a supplied credential still requires an explicit `--api-key-env`.

Use `--tag` one or more times to add the models to routing pools. Without tags, models remain manually selectable. To add credentials, supply an environment-variable name with `--secret-env NAME`, or use `--secret-stdin`; an interactive no-echo prompt is available on a terminal. The name is not a key value. There is no secret-valued command-line option.

Login is a separate API-key capture flow. It works before adding a supported preset and can rotate an existing provider's key:

```sh
jev provider login openai --secret-env OPENAI_KEY_INPUT
printf '%s\n' "$KEY" | jev provider login openai --secret-stdin
jev provider logout openai
jev provider list
```

Login stores the provider's declared credential reference in the runtime `credentials.json`, mode `0600`, and retains the previous store in `credentials.json.backup`. Logout removes that reference from both the JSON store and legacy local `.env` assignments. It does not revoke the upstream key, unset a parent-shell variable, or delete provider/model entries. Existing `.env` values remain readable, with the JSON store taking precedence. Neither login nor add reads another CLI's account state.

`jev provider remove ID` refuses providers with models unless `--force` is passed. Mutating commands accept `--dry-run`.

## Removal

```sh
jev uninstall --dry-run
jev uninstall
jev uninstall --purge --yes
```

Normal uninstall removes the CLI and install state but preserves `models.json`, `credentials.json`, `.env`, and records. `--purge` removes the runtime directory and requires `--yes` for noninteractive execution. Review the dry-run plan first.
