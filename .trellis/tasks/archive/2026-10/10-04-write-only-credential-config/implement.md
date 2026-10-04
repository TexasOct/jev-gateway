# Implementation plan

## Authorization and planning review

The active Goal authorizes autonomous implementation and verification. Main-session review confirms that this design covers Dashboard initialization, no secret readback, and file-only server configuration without changing routing identities. Activate only after curated manifests and research are ready.

## Ordered work

- [x] Read current credential research and finalize source boundary.
- [x] Implement shared JSON credential source and preserve dotenv behavior in backend owner modules.
- [x] Extend protected file transactions/revisions, Provider SET/CLEAR, candidate snapshots and CLI rotation/logout.
- [x] Add safe pending-provider startup/read path and prevent keyless upstream transport calls.
- [x] Add guarded write-only gateway initialization/rotation and safe capability projection.
- [x] Wire typed client and localized Provider workspace password controls; clear secret drafts and refresh active capabilities.
- [x] Add focused backend transaction/runtime/CLI and frontend/browser regressions.
- [x] Update README mirrors, models/API/install docs, and credential specs.
- [x] Run independent full-scope check, fix confirmed findings, then all required gates.
- [x] Build and smoke-test the installed wheel using an isolated JSON-only credential home.
- [x] Audit PRD acceptance against command/runtime/browser evidence, commit only this task's changes and close task bookkeeping without including pre-existing journal/icon work.

## Commands and evidence

Baseline: `uv run pytest -q tests/test_catalog.py tests/test_cli_providers.py` passed (54 tests) before implementation.

Final gates:

```bash
uv run pytest -q
uvx pyright
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
scripts/build-frontend.sh --check
uv build
```

Run relevant Playwright specs with the repository's browser test configuration and built assets, then an isolated installed-wheel smoke. Record exact commands and results in `verification.md`. Process/test output is summarized with context-mode; do not print operator credential values.

## Rollback and ownership

Backend implementation owns credential/catalog/config transaction/gateway/CLI modules and backend tests. The main session owns frontend integration, product docs, specs and task artifacts unless explicitly delegated. A check agent may fix confirmed issues after implementation has stopped. No concurrent edits to the same owner files. Restore old disk bytes and healthy active state when credential persistence or activation fails; a failed recovery remains blocked by the existing journal rule.

Original unrelated changes: `.trellis/workspace/TexasOct/index.md`, `.trellis/workspace/TexasOct/journal-1.md`, and `.trellis/tasks/10-04-provider-icon-presets/`. Preserve them.
