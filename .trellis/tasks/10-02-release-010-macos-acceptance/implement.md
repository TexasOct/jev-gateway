# Execution and verification

- [x] Reproduce the original published installer in isolated tool/state/runtime directories; save sanitized installation and startup evidence.
- [x] Inspect default macOS installation paths and identify the demonstrated failure causes.
- [x] Implement focused repairs in the owning modules with regression tests.
- [x] Review all changed files against backend CLI, quality, packaging, and logging specs.
- [x] Run full Python tests and Pyright; run frontend lint/tests/build/freshness, shell syntax, wheel build, and `scripts/validate-release.py v0.1.0` in a fresh output directory.
- [x] Verify installed artifact lifecycle, HTTP health/dashboard/reload/storage behavior, repeat install, and uninstall preservation.
- [x] Exercise named probe-file create/read/update/rename/delete operations under actual production paths and verify preservation hashes.
- [x] Commit the repaired source and acceptance materials. Preserve unrelated work and push the source commit.
- [x] Replace the backed-up v0.1.0 Release and tag using the user-authorized replacement; check the complete publication workflow.
- [x] Download the new public assets; check exact asset set, hashes, metadata, tag identity, and latest stable selection.
- [x] Run fresh isolated installation and default-path installation acceptance from the republished installer.
- [ ] Persist the final report, audit every PRD requirement, update the relevant spec, and complete task bookkeeping.

Private original artifacts and operational logs live under `/tmp/jev-v010-macos-acceptance`. Do not commit environment files, runtime databases, or raw logs. Roll back only files changed by this task and retain the original release backup until the replacement is verified.
