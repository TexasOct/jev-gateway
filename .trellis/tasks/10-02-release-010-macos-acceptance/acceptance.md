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

The final full-scope review passed. Republishing and acceptance of the public downloaded assets remain pending. Local candidate validation is not public-release acceptance.
