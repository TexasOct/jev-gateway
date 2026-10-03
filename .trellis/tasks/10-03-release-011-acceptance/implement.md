# Release 0.1.1 implementation and acceptance

- [x] Inspect local/remote source, existing tags/Releases, authentication, workflow and prior acceptance.
- [x] Derive release requirements from the two archived feature PRDs and the release contracts.
- [x] Update pyproject.toml and jev_gateway/__init__.py to 0.1.1; refresh uv.lock without dependency changes.
- [x] Run uv lock --check, frontend lint/unit/browser/build/freshness, full pytest, uvx pyright and shell syntax checks. Serialize operations that write generated static assets.
- [x] Build wheel/sdist into a fresh private directory and run python3 scripts/validate-release.py v0.1.1 <dist>.
- [x] Run candidate installed-wheel smoke, inspect its actual exit and checks.json, review scoped changes, commit with signing and push main.
- [x] Create/push v0.1.1; inspect the exact workflow head and all jobs. Arrange a completion notification for external CI waits.
- [x] Download all four pinned public assets and latest installer; verify SHA256 sidecars, GitHub digests, embedded tag, wheel metadata and exact package/source parity.
- [x] Repair reproduced reset disclosure while preserving config-hash draft remounts; retain and synchronize the existing browser assertions.
- [ ] Recheck repaired source, back up the first public Release/tag/assets, commit/push the repair, replace only v0.1.1 with a tag-specific lease and repeat final public acceptance.
- [ ] Run installed smoke on the downloaded public wheel and fresh public-installer acceptance with isolated directories.
- [ ] Run the full existing browser suite against the installed public wheel's loopback assets with no source build; retain locale/theme/responsive screenshots and native results.
- [ ] Back up current default runtime and original rows, run ordinary public-installer upgrade, verify preservation and restore original service state.
- [ ] Produce the requirement audit, retain failures, obtain independent release acceptance review and update release notes.
- [ ] Review spec lessons, commit/push sanitized evidence, archive the task and add only owned journal content through scoped commits.
- [ ] Recheck remote main/tag/Release, public digests, installed state and unrelated file preservation; then complete the active Goal.

Rollback uses the retained v0.1.0 public installer and the protected runtime backups. Repeated v0.1.1 tag publication is authorized; replacements still require state inspection and private backup. No acceptance command may send real provider generation requests.
