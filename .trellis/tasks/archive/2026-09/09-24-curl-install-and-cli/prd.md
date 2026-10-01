# Curl installation and agent-friendly CLI

## Goal

Make JEV installable with one curl command, operable from a single CLI that both
humans and agents can drive, removable without leaving stray files, and
extendable with official or custom providers without hand-editing JSON.

## Background

The repository is public (`github.com/TexasOct/jev-gateway`, branch `main`) but has
no release tags, so nothing may assume a published release artifact or Homebrew
tap exists. Today installation means cloning the repository and running
`scripts/install-local.sh`, which uses `uv tool install` and initializes
`$HOME/.jev-gateway`. Startup is a single console script, `jev-gateway`, which
runs the server in the foreground and reads its catalog from
`$JEV_GATEWAY_HOME/models.json` (falling back to the working directory) plus the
`.env` beside it. The only declared entry point starts the server; there is no
argument parser anywhere in the package.

Configuration is JSON-only. Providers declare `id`, a LiteLLM-backed `type`,
optional `api_base`, and an optional `api_key_env` naming the environment
variable that holds the secret. `type: openai` requires both `api_base` and
`api_key_env`. Model identity is the generated `<provider>/<upstream_model>` pair
and must be unique. The gateway exposes an HTTP surface for inspection and
routing-overlay edits, but providers and models live in `models.json` and are not
writable through that API.

Local credentials currently point at a custom OpenAI-compatible endpoint, so the
custom path must keep working unchanged.

## Requirements

### Installation and removal

- R1. A documented curl command installs the CLI on macOS and Linux without a
  manual clone.
- R2. The installer is idempotent: re-running it preserves `models.json`, `.env`,
  and the record database.
- R3. The CLI removes the files it owns. Runtime data (`models.json`, `.env`,
  records) survives by default.
- R4. Destructive removal requires explicit opt-in and prints what it will delete
  before deleting it.
- R5. Windows is out of scope for the installer and documented with an
  alternative path.

### Agent-friendly operation

- R6. Every command accepts a machine-readable output mode that writes exactly one
  JSON document to stdout.
- R7. Failures return a nonzero exit status and a stable machine-readable error
  code. No command prompts when stdin is not a terminal or when the
  machine-readable mode is active.
- R8. Secrets are never printed. Secret input is accepted through an environment
  variable name or stdin, never through an argument that would land in shell
  history.

### Service lifecycle

- R9. The CLI starts, stops, restarts, and reports gateway status, and shows
  recent logs.
- R10. Lifecycle commands report a nonzero exit status when the operation fails,
  including when the gateway is already running or not running.

### Provider setup

- R11. The CLI adds an OpenAI or Anthropic official API provider together with
  one or more models through a guided shortcut.
- R11a. The CLI provides a dedicated login command, `jev provider login`, that
  captures one provider's official API key and stores it only in the runtime
  `.env` (and its protected backup on rotation). Login is a credential step,
  not an account or browser authorization step.
- R11b. Login works before provider addition for a supported preset, and can
  target an existing provider to set or rotate its key without repeating
  `provider add`.
- R11c. Login is reversible: `jev provider logout` removes the stored variable
  from `.env` and leaves the provider and model entries in place.
- R12. The existing custom OpenAI-compatible endpoint flow remains available
  through the same command, including a caller-chosen provider `type`.
- R12a. A login attempt against an unknown provider or a provider with no
  resolvable variable name fails with a specific error code and writes nothing.
- R13. The shortcut never reuses existing Codex or Claude CLI login state or
  subscription credentials. Any provider authentication must be initiated
  separately by JEV's own CLI.
- R14. Adding a provider or model never overwrites existing provider IDs, model
  entries, endpoint settings, or credential references, and never removes models
  from existing routing tags.
- R15. New models may be assigned routing tags; when none are given, they are
  registered and manually selectable only.

### Configuration scope

- R16. The CLI may mutate providers and models. Policy, strategies, gateway, and
  storage settings are readable and validatable through the CLI but are not
  written by it.
- R17. The CLI validates the full catalog before writing and refuses to leave an
  invalid `models.json` behind.

### Compatibility

- R18. The existing `jev-gateway` entry point keeps starting the server with
  unchanged foreground behavior.
- R19. `scripts/install-local.sh`, `scripts/install-with-brew.sh`, and
  `scripts/uninstall-local.sh` keep working.
- R20. `README.md` and `README.zh-CN.md` stay in step, and the new CLI is
  documented under `docs/`.

## Acceptance criteria

- AC1 (R1, R2). On a machine with a clean runtime directory, the documented curl
  command completes and `jev status` runs. Re-running the installer leaves an
  existing `models.json` byte-identical.
- AC2 (R3, R4). `jev uninstall` removes the launcher, the installed tool, and
  install state, and leaves `models.json`, `.env`, and the record database in
  place. `jev uninstall --purge --yes` also removes the runtime directory.
  `jev uninstall --dry-run` lists the actions and changes nothing.
- AC3 (R6, R7). Each command under `--json` prints one valid JSON document to
  stdout and nothing else; a forced failure prints a JSON object carrying
  `error.code` and exits nonzero.
- AC4 (R9, R10). `jev start` brings the server up and `jev status` reports it
  running with the configured host and port; `jev stop` stops it; both report
  failure with a nonzero exit status when the requested transition is not
  possible. `jev logs` prints recent log lines.
- AC5 (R11, R12, R13, R15). `jev provider add openai` and
  `jev provider add anthropic` register the official provider and at least one
  model, and `jev provider add custom` registers a custom compatible endpoint.
  `jev provider list` shows the new entries with the declared `api_key_env` name
  and a boolean key-present marker.
- AC6 (R14). Adding a provider or model to a catalog that already defines that
  provider ID or that `(provider, upstream_model)` pair fails without writing,
  and the file on disk is unchanged.
- AC7 (R16, R17). `jev config validate` reports an intentionally broken catalog
  with a nonzero exit status and does not write; `jev config show` reports
  policy, strategies, gateway, and storage sections it cannot write.
- AC8 (R18, R19). `jev-gateway` still serves the foreground server, and the three
  existing scripts still complete.
- AC9 (R8). No command output, error message, log line, catalog, or install
  state contains a secret value. Only the runtime `.env` and its mode-`0600`
  backup may contain the entered key; tests assert that boundary.
- AC10 (R11a, R11b, R11c). `jev provider login openai` can store the key before
  `provider add`; it sets mode `0600`, reports the variable name and a boolean
  key-present marker, and never prints the key. Login against an existing
  provider updates its declared variable without changing `models.json`.
  `jev provider logout openai` removes the variable and leaves provider and
  model entries unchanged.

## Out of scope

- Windows support for the installer.
- Reusing Codex, Claude, or other CLI subscription login state.
- Writing policy, strategies, gateway, storage, or decision-provider settings
  from the CLI.
- Creating release tags, a Homebrew tap, or published wheel artifacts.
- A service manager installation (launchd or systemd units).
- Changing routing, strategy, or scoring behavior.

## Key decisions

- Official provider shortcuts target API-key providers (OpenAI, Anthropic,
  DeepSeek) and keep the custom compatible-endpoint path. Subscription login state
  is deliberately not reused.
- CLI writes are limited to providers and models; everything else is read-only
  through the CLI.
- A separate login flow is required. It is `jev provider login`, which captures
  an official API key and stores it in the runtime `.env`. It is not a browser or
  account authorization flow, and it does not read credentials from any other
  CLI's login state.
- The CLI owns process lifecycle, so installation, configuration, and operation
  all happen through one command.
- One Trellis task covers the whole CLI: installer, lifecycle, and provider setup
  share a single command surface and one catalog-mutation helper, so they are
  staged inside `implement.md` rather than split into separate verifiable tasks.
