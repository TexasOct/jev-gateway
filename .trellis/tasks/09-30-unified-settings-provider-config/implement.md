# Implementation plan

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