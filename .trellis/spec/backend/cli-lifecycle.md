# CLI lifecycle and provider credential contracts

## 1. Scope / trigger

Apply these contracts when changing the `jev` CLI, curl installer, provider onboarding, local process control, or uninstall behavior. `jev-gateway` remains the foreground server entry point. `jev_gateway/cli/` must not import `jev_gateway.gateway` because module import constructs the application and loads the runtime catalog immediately.

## 2. Signatures

```text
jev [--home PATH] [--json] <command>
jev install init [--home PATH] [--ref REF | --version VERSION --source RELEASE_WHEEL_URL] [--method isolated]
jev doctor | status | start | stop | restart | logs
jev setup [--secret-env SOURCE_NAME | --secret-stdin]
jev config path | show | validate | reload
jev provider list | add PRESET | login ID | logout ID | remove ID
jev uninstall [--dry-run] [--purge] [--yes]
```

Each GitHub Release publishes a complete `install.sh`, its SHA256 sidecar, a
versioned wheel, and the wheel's SHA256 sidecar. The public
`https://github.com/TexasOct/jev-gateway/releases/latest/download/install.sh`
URL selects the latest stable Release's script; the script itself installs its
embedded tag. `scripts/validate-release.py` replaces the single
`RELEASE_TAG=__JEV_RELEASE_TAG__` template assignment when generating
`dist/install.sh`. The unstamped source template cannot perform a Release
install, even with `--version`.

The installer constructs wheel and checksum URLs under
`https://github.com/TexasOct/jev-gateway/releases/download/<embedded-tag>/`
and verifies the wheel before invoking `uv tool install`, then calls
`jev install init`. It never resolves latest again or queries an API to locate
the wheel. If `--version VERSION` selects a different tag, including an explicit
prerelease, download that tag's installer and sidecar, verify SHA256 and the exact
embedded tag, then delegate once with supported options forwarded. The delegated
installer must match the requested tag and cannot delegate again. Never fall
back to raw `main`.

`--ref REF` remains an explicit Git-source developer install, without Release
checksum verification, and cannot be combined with `--version`. Release wheel
state records `source_type: release_wheel`, `package_version`, and the exact
wheel URL; legacy Git state remains readable. Provider presets come from the
shared `provider_presets.PRESETS` registry; argparse choices must use that same
registry. The `custom` branch accepts a caller-supplied provider type and endpoint.
Additional parameters use `--param NAME=VALUE` or `--param-env NAME=ENV` and retain
the catalog's credential/reserved-name validation. CLI login means API-key capture through a JEV command, not
reuse of an existing Codex or Claude login or subscription.

## 3. Contracts

- Release installs require macOS or Linux, `curl`, and `python3` for asset verification. The gateway requires Python 3.12+. Release, Git-ref, and local-source tool installs pass `--python 3.12 --managed-python` to uv, which downloads a managed interpreter when needed. System Python is only used for installer asset verification. Keep `--yes` consent for uv bootstrap, `--no-uv` refusal to bootstrap, `--home`, and `--no-init`. Installer `--dry-run` performs no network access, child execution, installation, or writes, and cannot verify asset availability or checksums. It still rejects an unstamped Release template because no release plan can be derived without a valid embedded tag. `--ref REF --dry-run` remains a separate developer preview. Downloading the initial Release script with curl is a separate network operation.
- The initial `curl | sh` invocation cannot verify its own script bytes before execution. Documentation must provide a pinned-tag download/review/checksum/execute example, using the same tag for script and sidecar. A sidecar from the same publisher detects mismatches but is not an independent signature.
- Runtime directory precedence: `--home`, `JEV_GATEWAY_HOME`, recorded install state, then `$HOME/.jev-gateway`. The server child receives its resolved directory in `JEV_GATEWAY_HOME`. The foreground `jev-gateway` entry point uses the same resolver without `--home`; the caller's working directory does not select its catalog. Explicit `models_file` arguments in application APIs remain supported.
- Local lifecycle health probes set `trust_env=False` so exported HTTP proxy settings cannot redirect loopback readiness checks.
- `models.json` remains the only static catalog. General CLI management writes
  providers and models; initial setup establishes the gateway key reference.
  A provider's `api_key_env` names its credential in protected `credentials.json`.
  Values never belong in `models.json`, arguments, logs, or install state. The
  shared resolver uses JSON > neighboring `.env` > captured process values without
  changing `os.environ`; see [credential configuration](./credential-configuration.md).
- Initial `jev setup` establishes `gateway.api_key_env` through the same managed
  credential owner as both HTTP setup endpoints. Preserve an existing declared
  reference; use the owner's default only when none is declared. Packaged defaults contain strategy plans without
  provider/model instances. Provider/model configuration may happen later;
  startup and console access remain available with an empty catalog. Default
  foreground startup initializes absent files without installation-state writes,
  preserving existing files. Read [Runtime initialization](./initialization.md)
  for bootstrap, revision, secret and incomplete-state contracts.
- Login can precede addition for a known preset, or set/rotate the declared key for an existing provider. Logout removes the reference from JSON and legacy local dotenv without deleting the catalog entry or revoking the upstream key. An exported shell variable can still supply the credential.
- `--secret-env SOURCE_NAME` reads from the named process environment variable; `--secret-stdin` reads a bounded line; an interactive terminal can use a no-echo prompt. Never add a `--api-key VALUE` argument. Credential store, backups and changed local dotenv files must have mode `0600`. All install paths initialize an empty protected JSON store and preserve existing files; new dotenv templates contain comments only.
- Provider addition validates the candidate catalog before replacing `models.json` atomically and retains `models.json.bak`. Login-before-add must be possible even though catalog parsing normally requires referenced credentials; use a temporary validation environment for the candidate, without weakening validation of existing providers or persisting that placeholder.
- `--json` outputs one JSON object to stdout, with `ok`, `command`, and either `data` or `error.code` plus `error.message`. No prompt is permitted in JSON or non-TTY mode. Uninstall preserves runtime data by default; `--purge` explicitly opts into removal.
- The background server is managed through an owned PID record under `run/gateway.pid` and a non-credential launch token. A PID alone is not proof of ownership: verify that PID still belongs to this home and launch token before signaling it. Read actual argv through `psutil.Process(pid).cmdline()` and require the exact module launch shape `[executable, "-m", "jev_gateway.cli.server", "--home", home, "--token", token]`. Rendered `ps` output loses argument boundaries for paths with spaces, and a `python -c` process with a matching suffix is not an owned server. Denied, disappeared, zombie, or dead processes fail ownership checks. Re-check ownership immediately before an update-triggered signal. `logs/gateway.log` is the managed output path.
- Missing public `jev` or `jev-gateway` shims do not establish that the service is stopped. For installed acceptance, inspect the recorded tool environment and the live PID's exact argv/home/token before selecting its owner CLI. An ordinary installer may restore both shims while upgrading an owned running service; verify the initial state again immediately before installation and preserve that state afterwards.
- Before an operator upgrade, retain the actual installed distribution, its package file hashes and matching recovery wheel. Validate both the existing base catalog and merged overlay with the target installed version in an isolated, network-disabled check. A version string or Git tag cannot establish the former installation's schema or bytes. If target validation fails, retain the running baseline until a reviewed configuration adjustment is authorized. Keep pre-adjustment backups and the approved post-adjustment baseline separately; compare every untouched file against the original and every upgrade-preserved file against the approved baseline.
- Installed acceptance must connect the public wheel to the actual uv input and the installed distribution. Some uv versions omit archive hashes from `direct_url.json`; in that case verify filename, size and SHA256 immediately before forwarding unchanged uv arguments, join the observed path to the installed file URL, and compare the full product file set and bytes. Keep the observer outside recorded install state.
- Recovery wheel initialization uses `jev install init --version VERSION --source RELEASE_WHEEL_URL`, with that published asset's digest checked against the retained wheel. A local wheel path is not an accepted release source. Consistent SQLite backups and typed row multisets projected on original columns establish history preservation, including duplicate rows, NULL and BLOB values.

## 4. Validation and error matrix

| Condition | Behavior |
| --- | --- |
| Duplicate provider ID or duplicate model in one add command | Refuse without writing `models.json`, return `provider_exists` or `model_exists` |
| Unsupported provider type or invalid candidate | Refuse before disk replacement; `invalid_configuration` for catalog validation |
| Noninteractive login without secret source | Return `secret_missing` without waiting for input |
| Unknown provider/preset or missing `api_key_env` | Return `provider_missing` or `provider_has_no_key_reference` without writing |
| Dead or mismatched PID record | `jev status` returns exit 4 and, in JSON mode, `ok: false` with `error.code: not_running`; never signal the unrelated process |
| Caller changes cwd before running installed `jev-gateway` | Load the environment-selected, recorded, or default runtime directory |
| Runtime or interpreter path contains spaces | Verify ownership using actual argv, preserving each path as one argument |
| Process metadata access denied, zombie process, or spoofed `-c` wrapper | Refuse ownership and do not signal it |
| Exported HTTP proxy settings during local readiness checks | Probe the configured local endpoint directly |
| Uninstall without managed state | Never delete an unrelated `jev` executable by name alone |
| Latest stable Release missing | Public latest installer download fails; no fallback to `main` |
| Target installer/checksum missing or invalid, or target embedded tag differs | Refuse before child execution or `uv tool install` |
| Wheel/checksum missing, malformed, or SHA256 invalid | Installer exits nonzero before invoking `uv tool install` |
| Unstamped source template used for a Release install, even with `--version` or `--dry-run` | Refuse; require a generated or published Release artifact |
| Delegated script has conflicting identity or would delegate again | Refuse before further download or installation |
| `install init --version` with invalid version/source URL or with `--ref` | Return usage error without writing runtime files or install state |
| Existing base catalog or merged overlay fails target-version validation | Retain the original installation and configuration; resolve the reviewed configuration scope before ordinary upgrade acceptance |
| Installed archive metadata omits SHA256 | Require observed verified uv input joined to the installed file URL and complete package parity; do not infer identity from version alone |
| Purge without explicit confirmation | Return `confirmation_required`; `--dry-run` remains non-mutating |

## 5. Good / base / bad cases

Good: `jev provider login anthropic --secret-stdin` reads a key on stdin, writes only its declared reference to protected `credentials.json`, and returns no credential bytes. Base: `jev provider add custom --type openai --api-base https://example.invalid/v1 --api-key-env DEMO_KEY --model demo` registers a manually selectable model without changing strategy definitions. Bad: a stale PID file points to another user's process and `jev stop` signals it merely because the number is present. Similarly, a Release wheel with a missing or mismatched checksum must never reach `uv tool install`.

## 6. Tests required

- `tests/test_cli_providers.py`: preset and custom addition, login before/after add, rotation, logout, credential absence in output, duplicate model rejection, and unchanged catalog on validation failure.
- `tests/test_cli_process.py` and `tests/test_cli_review_regressions.py`: start/stop/status, ownership mismatch, stale PID, and no unrelated signal. Use a real module child to prove ownership for paths with spaces; cover `-c` spoofing, denied metadata access, and zombie/dead states. Installed acceptance must expect exit 4 and `error.code: not_running` after stopping; it must not require exit 0 for every status command. Resolve expected runtime paths before comparison because macOS maps `/tmp` to `/private/tmp`.
- `tests/test_cli_install_state.py`, `tests/test_install_script.py`, `tests/test_cli_templates.py`: isolated install state, legacy Git-state reading, Release provenance, preserved data on uninstall, purge confirmation, no-network dry-run, direct embedded-tag installs, one-time cross-version delegation, forwarded flags, prereleases, missing/malformed assets, identity and checksum failure ordering, no raw-main fallback, and byte-identical packaged templates.
- `tests/test_release_validation.py`: tag/version agreement, wheel contents and metadata, exact source-to-wheel file parity, stamped installer identity, both checksum sidecars, and the workflow's four explicit upload paths. Dashboard-dependent packaging tests must build from frontend source rather than rely on Git-tracked output.
- Operator installed acceptance: retain the native command exit and success/cleanup flags; verify target base/overlay compatibility, public wheel provenance, all installed files, ownership-aware restart, authenticated local health and Dashboard assets, credential modes, protected backup bytes, SQLite integrity and all original typed row multiplicities. Keep failed attempts and recovery evidence separate from a successful approved-baseline upgrade.
- `uv run pytest -q`, `uvx pyright`, `uv build`, shell syntax checks, and a throwaway-home installed-tool smoke test for entry points and uninstall behavior.

## 7. Wrong vs correct

Wrong: import `jev_gateway.gateway` to read server settings, or trust a numeric PID alone before stopping a process. Correct: read and validate the catalog from CLI helpers without importing the server; require a matching ownership token and runtime directory before signaling.
