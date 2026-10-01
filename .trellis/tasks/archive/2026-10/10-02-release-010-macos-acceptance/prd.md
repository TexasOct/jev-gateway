# v0.1.0 macOS 正式安装验收与重新发布

## Goal

复现并修复 macOS 正式安装后的运行故障，完成默认路径文件与服务验收，重新发布并验证 v0.1.0

## Requirements

- R1: Reproduce the reported failure using the published v0.1.0 assets on this Apple Silicon macOS host, with the installed CLI explicitly selected instead of the repository virtual environment.
- R2: Repair installation and startup defects while preserving existing runtime configuration, credentials, and records. The installed gateway must use managed Python 3.12 or newer and include the dashboard.
- R3: Exercise actual create, read, update, rename, and delete operations with dedicated acceptance files under the default production runtime and installation paths. Validate application configuration writes where possible without making upstream billable requests.
- R4: Verify CLI version/doctor, background start/status/stop/restart, health, dashboard assets, configuration reload, record storage, repeat installation, and uninstall preservation in an isolated installation. Also verify the actual default installation and runtime paths on this machine.
- R5: Republish the existing version v0.1.0 with the repaired source and all four checksum-verified assets, then repeat acceptance using the public published installer. Preserve the original release metadata and assets before replacement.
- R6: Record concrete commands and evidence, including failed checks and their resolution. Never publish credentials or request contents in logs or committed artifacts.

## Acceptance Criteria

- [x] The original release's installation/startup behavior has been reproduced and each observed defect has an identified cause.
- [x] Focused regression tests and the full Python tests, Pyright, frontend lint/tests/build freshness, shell syntax, and release validator pass for the final source.
- [x] Installed commands resolve to the intended uv tool environment and report v0.1.0 with Python >=3.12.
- [x] The production-path file operations pass and all dedicated probe files are removed; existing user configuration and credentials are preserved.
- [x] Both isolated and default-path installed services pass lifecycle, health, and dashboard checks. Repeat installation preserves configuration and handles a running service correctly; uninstall preserves runtime files.
- [x] Remote v0.1.0 points to the repaired commit, its publication workflow succeeds, and the stable latest Release contains exactly the four intended assets with valid checksums.
- [x] A fresh installation from the republished public URL passes the acceptance checks, and a sanitized acceptance report is persisted.

## Confirmed context

- The original Release is published, stable, and tagged v0.1.0 at commit `2ccd6cce6c25df864806f88c2f98b42e64876c88`. Its two checksums match the downloaded assets.
- The original wheel already declares Python >=3.12 and includes both CLI entry points and dashboard files.
- The user explicitly authorized production-path file operations and autonomous completion, including republishing this same version. No further planning or publication approval is pending.
- Original metadata and assets are saved under `/tmp/jev-v010-macos-acceptance/original-release`.
- The user excludes compatibility and migration for retired configuration fields. The operator removed obsolete fields manually, and the current production document validates against v0.1.0.

## Scope boundaries

- Preserve routing and provider contracts except where a demonstrated startup defect requires a correction.
- Do not delete existing operator runtime data. Use named acceptance files and backup configuration before any reversible application-level write.
- Do not send real provider requests as part of acceptance. Check local API behavior and use controlled upstream fixtures for regression coverage.
- Do not add legacy field migrations or relax current catalog validation. Initialize current packaged templates only when configuration files are absent.
