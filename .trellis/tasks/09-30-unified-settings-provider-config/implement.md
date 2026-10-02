# Implementation plan

## Current continuation checklist

1. Implement catalog empty/incomplete states, strategy-only templates, shared absent-file initialization, transactional management-key setup with CLI/HTTP entry points, safe progress projection and controlled unconfigured request errors. Add focused backend contracts and adjust template-dependent tests to synthetic populated fixtures where they test routing behavior.
2. Implement first-run and progress UI in the existing shell and orchestration boundary with shared API types, bilingual text, memory-only credentials, safe error/retry state and existing Provider/Strategy navigation. Add focused frontend tests.
3. Update installed release smoke to begin from the real empty packaged template and exercise actual management-key setup, provider save, confirmed model import and strategy assignment before existing lifecycle/write/preservation gates. Update public setup/configuration docs and README mirrors.
4. Review actual diffs and run full pytest, Pyright, frontend lint/tests/build, shell/lock checks and release validation. Verify the real browser flow at desktop/narrow sizes and both locales. Build in a fresh output directory and run macOS installed-wheel smoke.
   Before these final gates, implement the user's empty-tag default selection:
   add one catalog defaults.default_model and guarded baseline operation/Settings
   selector; every strategy inherits it with no per-strategy override. Emit final
   label default, retain default-labelled sessions safely, update readiness and
   localize all result surfaces. Test a different first pool and matrix fallback
   to prove the selected model is the global one, plus preview/header/record/pinning
   and UI coverage. Reject transport-incompatible setup keys and prove native
   browser initialization/reconnect with a supported key.
5. Update affected backend specs. Commit coherent task changes, back up current public release/tag/assets, push source and replace the authorized tag with its exact remote lease. Follow the existing build/Ubuntu/macOS/publish workflow without bypassing a gate.
6. Verify remote tag/head, latest flags, exact four public asset digests/sidecars, source/wheel parity, public downloaded wheel smoke and isolated public-installer acceptance. Persist sanitized requirement-by-requirement evidence, then archive and journal completed work.
7. Latest user extension: before publication, verify real upstream streaming with
   authorized relevant existing-agent credentials in a private installed-wheel
   sandbox. Exercise real discovery/import or document the exact supported import
   path, global default, config edits/reload and default-labelled continuation.
8. After all gates and public downloads pass, privately back up actual local
   configuration/credentials and SQLite state, stop the owned service, remove its
   configuration files, and run the published installer at the real local runtime.
   Verify first-run setup, model import, edits/reload and real streaming against
   the installed public artifact; preserve existing records and provide a complete
   sanitized acceptance report. User has explicitly authorized these operations.

Normal reinstall preservation must also be verified in an isolated configured
installation with a valid active overlay and populated request, decision,
outcome, upstream and assistant-continuation evidence. Compare configuration,
credential and overlay bytes plus the original retained rows across ordinary
reinstallation; allow normal new SQLite bookkeeping writes. The installed smoke's
empty database and removed-overlay checks alone do not prove this requirement.
Keep that ordinary-update acceptance separate from the authorized final reset,
which deliberately removes actual configuration while preserving records.

The user's current autonomous Goal instruction authorizes this continuation and replacement release. The initial read-only audit found a clean working tree. Backend and frontend implementation can run as two named independent delegates with disjoint ownership and the HTTP contract in design.md; publication remains sequential after validation.

## Ordered checklist

1. Review the current `AppShell.tsx`, `App.tsx`, appearance feature, source Provider-management planning artifacts and the archived shell visual requirements. Read `research/provider-management-merge.md` and compare each source requirement and acceptance criterion with the current implementation. Confirm file ownership and avoid overwriting unrelated dirty work.
2. Add top-level `settings` and `providers` views, remove the standalone `appearance` navigation entry, and localize the four-view navigation labels.
3. Compose the existing appearance/theme controls inside the Settings page and move the locale control into the same application-level settings surface. Preserve current theme preview, GET/PUT/DELETE behavior, locale storage, authorization, and memory-only credentials.
4. Integrate the merged Provider-management scope in the Provider & models workspace. Reconcile the old planning PRD against current code and archived Provider implementation evidence before design changes. Document create/edit, credential setup, validation/discovery and error states. Verify whether enable/disable or active connection testing are supported; mark unsupported behaviors as deferred instead of inventing endpoints. Preserve instance/model IDs and explicit model import/metadata-confirmation requirements.
5. Update view/navigation/provider tests and add coverage for Settings placement, theme and locale access, Provider entry and supported management flows. Keep existing shell styles and responsive behavior.
6. Validate frontend lint, tests, and build. Run focused browser checks for desktop and narrow navigation in English and Chinese, plus theme controls, Provider/credential/write guards and pending/error states. Use mock credentials and mock upstreams only.
7. Review the final diff for compatibility with the archived shell requirements, merged Provider scope and acceptance map, CSP/same-origin rules, API boundaries, and unrelated dirty files. Record remaining gaps, deferred capabilities and which prior user-approved decisions cover the source planning review; seek approval before introducing new behavior.

## Validation commands

- `npm --prefix frontend run lint`
- `npm --prefix frontend test`
- `npm --prefix frontend run build`
- `scripts/build-frontend.sh --check` when generated dashboard assets are present/needed

## Risk points and rollback

- Shared navigation and shell files may have concurrent uncommitted edits; inspect `git diff` before and after each change and do not stage or revert unrelated files.
- Provider/model management planning is merged into this task. Existing Provider APIs are documented by the archived configuration task; verify actual support for each source requirement and avoid fake or unsupported operations. No new provider types, automatic probing or other extensions are authorized by this bookkeeping merge.
- Roll back only the new view registration, navigation, and settings composition if integration fails. Preserve theme APIs, files, locale key, and unrelated dashboard changes.
