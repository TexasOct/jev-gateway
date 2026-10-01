# v0.1.0 macOS release acceptance

## Reproduction and scope

The original Release at `2ccd6cce6c25df864806f88c2f98b42e64876c88` installed with valid checksums and managed Python 3.12. Its background service worked with current configuration. Its installed foreground command failed from `/tmp` because it looked for `/private/tmp/models.json` instead of the initialized runtime directory.

The operator's initial configuration contained retired fields. The operator removed them manually and requested no compatibility or migration code. Current parsing remains strict and installation preserves existing configuration.

Original Release metadata, tag history bundle, installer, wheel, and checksums are retained privately under `/tmp/jev-v010-macos-acceptance/original-release`.

## Repairs

- Foreground and background commands use the same runtime directory resolver.
- Process ownership uses actual argv through psutil, preserving paths containing spaces and rejecting spoofed wrappers, wrong tokens/homes, denied access, and dead or zombie processes.
- Lifecycle health probes ignore proxy environment settings.
- The Release workflow builds one artifact set, runs installed-wheel acceptance on Ubuntu and macOS, and publishes after both succeed.

## Local verification before publication

| Check | Evidence |
| --- | --- |
| Full Python suite | `uv run pytest -q`: 755 passed |
| Type checking | `uvx pyright`: 0 errors, 0 warnings |
| Frontend tests | 210 passed across 30 files |
| Frontend lint | Exit 0; four existing Fast Refresh warnings |
| Frontend build and freshness | Both passed; existing chunk-size warning |
| Installer/local installer/frontend shell syntax | All passed |
| Lockfile | `uv lock --check` passed |
| Wheel build and Release validator | Both passed for v0.1.0 |
| Release artifact/workflow contracts | 13 tests passed |
| Full-scope Trellis review | PASS; final focused suite: 232 passed; Pyright and whitespace checks passed |
| Installed candidate smoke | Exit 0, `success: true`, 59 checks passed, including proxy readiness, SQLite integrity/schema, API writes, repeat install, and uninstall preservation |
| Default installation | Managed Python 3.12.11, package v0.1.0, psutil 7.2.2 |
| Default service | Foreground from `/tmp`, managed start/status/restart/stop, config reload, health, models, and Dashboard JS/CSS passed |
| Operator files | Current `models.json` and `.env` hashes unchanged |
| Production SQLite | `PRAGMA integrity_check` returned `ok`; expected storage tables exist |

Named exclusive probe files completed create/read/update/rename/delete under the actual runtime directory, CLI bin directory, uv tool environment, and install state directory. All probe files were removed. No real upstream generation request was sent.

Private command logs and structured results are under `/tmp/jev-v010-macos-acceptance`. This report excludes credential values, operator configuration contents, request bodies, and runtime records.

One background context-mode invocation was canceled after 15 minutes without a result. It is excluded from passing evidence. The final script was rerun independently with a 180-second subprocess limit and a 200-second Bash limit; it completed with exit 0 and 59 passing checks. The reviewer also completed a separate bounded run of the final script.

## Publication and public installer

The repaired source was committed and pushed to `main` as `33ae6ce272b65ac274838f92db318566967c1d32`. After verifying the original backup, Release `401119353` was deleted by its exact ID. The annotated `v0.1.0` tag was replaced with a force-with-lease scoped to its original tag object, `10029a126155d17ef9c699175fb3cd691b367cd4`.

[Publication run 36910091577](https://github.com/TexasOct/jev-gateway/actions/runs/36910091577) succeeded for the repaired commit. The build, macOS smoke, Ubuntu smoke, and publication jobs all passed.

The replacement [v0.1.0 Release](https://github.com/TexasOct/jev-gateway/releases/tag/v0.1.0), ID `401261321`, is public, stable, and selected by the latest Release endpoint. It contains exactly:

- `install.sh`
- `install.sh.sha256`
- `jev_gateway-0.1.0-py3-none-any.whl`
- `jev_gateway-0.1.0-py3-none-any.whl.sha256`

All four files were downloaded through their pinned public URLs. Both SHA256 sidecars match the downloaded bytes and GitHub asset digests. The latest public installer has the same bytes as the pinned installer and embeds `v0.1.0`.

| Public artifact | SHA256 |
| --- | --- |
| `install.sh` | `2147aa40b8048a17244eeae4dd976e5647a53165a50613bb74467668069aa63d` |
| `jev_gateway-0.1.0-py3-none-any.whl` | `e528d5726ea9c8230b3c6dcd259b513c5aa379f50971fce1a63d3c3b735a69db` |

The downloaded wheel reports v0.1.0, Python >=3.12, `psutil>=6.0`, and the AGPL-3.0-or-later license, includes both CLI entry points and referenced dashboard assets, and matches all 48 packaged Python/template files in the repaired source. A local rerun of `scripts/smoke-installed-release.py` against that public wheel completed with exit 0, `success: true`, and 59 passing checks.

Public-installer acceptance passed for both a fresh isolated installation and the actual default installation, with 148 checks recorded across the two phases. Both report Python 3.12.11, package v0.1.0, and psutil 7.2.2. The isolated phase completed first; the default phase then completed with exit 0 and a combined `success: true` result.

Both phases verified installed version/doctor, configuration validation and reload, background lifecycle, dashboard HTML/JS/CSS, running reinstall with a changed PID, stopped reinstall that remained stopped, direct foreground startup outside the checkout, and SQLite integrity/schema. The isolated uninstall preserved configuration, credentials, and database bytes. Default installation preserved the current `models.json` and `.env` hashes and every existing request, decision, outcome, upstream-request, and continuation row checked before installation.

The final installed default package matches all 52 package files in the downloaded public wheel, including its dashboard. All four downloaded asset hashes match GitHub's declared digests. Final audit found zero probe files left in the four production directories, confirmed `.env` mode 0600, and confirmed the default service is stopped, preserving its initial state.

## Acceptance harness failures and resolution

Three incomplete private harness runs are retained separately and excluded from complete-pass evidence:

1. Comparing `/tmp` directly with the CLI's canonical `/private/tmp` runtime path failed. Cleanup also attempted to stop an already-stopped process. Expected paths now resolve before comparison, and cleanup checks ownership/status first.
2. Requiring exit 0 from stopped `jev status` failed. The harness now requires the existing contract: exit 4, `ok: false`, and `error.code: not_running`.
3. Reading `gateway.port` directly failed because the valid default configuration omits that optional field. The harness now uses the port returned by the installed CLI after start/status. The completed isolated phase was retained; only the remaining default phase was rerun.

These corrections changed private acceptance automation, not the published package. The CLI exit/path contracts are captured in the backend spec. No retired-field compatibility or migration was introduced.

## Concrete operational checks

The default installation used the downloaded and verified public script:

```sh
sh /tmp/jev-v010-macos-acceptance/public-assets/install.sh \
  --version 0.1.0 --yes --home "$HOME/.jev-gateway"
sh /tmp/jev-v010-macos-acceptance/public-assets/install.sh \
  --version 0.1.0 --yes --home "$HOME/.jev-gateway" --no-init
```

Lifecycle commands selected the installed binary explicitly and ran outside the checkout:

```sh
"$HOME/.local/bin/jev" --json --version
"$HOME/.local/bin/jev" --json doctor
"$HOME/.local/bin/jev" --json config validate
"$HOME/.local/bin/jev" --json start --wait 30
"$HOME/.local/bin/jev" --json status
"$HOME/.local/bin/jev" --json config reload
"$HOME/.local/bin/jev" --json restart
"$HOME/.local/bin/jev" --json stop
"$HOME/.local/bin/jev-gateway"
```

The fresh installation set separate `UV_TOOL_DIR`, `UV_TOOL_BIN_DIR`, `XDG_STATE_HOME`, and `UV_PYTHON_INSTALL_DIR`, and used a runtime path containing spaces. Its uninstall and dry-run uninstall selected only that isolated executable.

The public wheel received the committed smoke test:

```sh
python3 scripts/smoke-installed-release.py \
  --wheel /tmp/jev-v010-macos-acceptance/public-assets/jev_gateway-0.1.0-py3-none-any.whl \
  --version 0.1.0 \
  --work-dir '/tmp/jev-v010-macos-acceptance/public wheel smoke'
```

## Requirement audit

| Requirement | Verified evidence |
| --- | --- |
| R1 | Original four assets/checksums, installed CLI selected explicitly, and saved foreground-from-`/tmp` failure |
| R2 | Runtime/ownership/proxy repairs, managed Python 3.12.11, bundled dashboard, unchanged operator files and existing stored rows |
| R3 | Production-path exclusive probe CRUD/rename/delete; isolated authenticated provider/routing API writes and revision conflict checks |
| R4 | Actual public installer in isolated/default paths; lifecycle, health, assets, reload, SQLite, running/stopped reinstall, and isolated uninstall preservation |
| R5 | Original publication backup; repaired tag/commit; four successful CI jobs; stable/latest public Release with exactly four verified assets |
| R6 | Sanitized report and command evidence, preserved failed harness runs, bounded reruns, and no provider generation calls |
