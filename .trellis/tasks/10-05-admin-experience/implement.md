# Execution plan

Use [current delivery status](acceptance-contexts.md#current-delivery-status) as the single commit/release tracking entry. Update its concise state at meaningful delivery changes and link to existing evidence. Keep the verification scope below; routine tracking does not require duplicate candidate histories or per-file hash inventories.

1. Record repository/auth/data-source evidence and source requirements. Preserve the existing dirty paths and staged blob IDs.
2. Prepare a private Git baseline with current supplier/select/spec changes and task artifacts; do not include existing archive/journal changes in task commits.
3. Activate the parent integration task and create one isolated development worktree per child. Dispatch all five developers together with the baseline commit and child ownership.
4. Settings and Canvas run independently. Supplier and Models implement against the written contract while Contracts supplies the shared API/schema. Avoid overlapping file writes by using isolated worktrees.
5. Inspect each branch diff against the private baseline, apply the task-only deltas to the main worktree, merge locale keys and wire the separate model page/settings section/navigation guards in the shell.
6. Run focused regression tests while integrating. Browser fixtures must implement the real new operation/test shapes and cannot claim server coverage.
7. Run full frontend lint/unit/build/browser checks, full pytest, Pyright and a package build. Check bundle freshness and package local-icon asset parity.
8. Inspect actual browser screenshots for major pages and failure/dirty/model states at desktop and narrow widths; add native graph gesture and actual backend transaction evidence.
9. Dispatch one fresh independent acceptance agent per child task and one for parent integration. Each owns a separate `acceptance.md` and execution evidence, returns PASS/REWORK/BLOCKED_DECISION, and handles its own rechecks after fixes. Implementer checks are not acceptance. Dispatch full-scope quality checks within that task ownership; fix confirmed findings and repeat affected checks.
10. Integrate remaining rework before organizing Provider source directories according to [the move manifest](research/provider-directory-design.md): `frontend/src/features/providers/suppliers/`, `models/`, `shared/` and `__tests__/`, with `GatewayCredentialForm.tsx` in `frontend/src/features/settings/`. Extract the three profile helpers verbatim into `shared/profiles.ts`; keep root assets and their bytes unchanged. Update application/Settings/fixture imports, eager SVG glob keys, JSON/license imports, asset-test filesystem paths and authored live source references. Preserve historical paths and frozen acceptance assertions. Repeat affected source/browser gates and independent checks against the resulting candidate; implementation verification remains supporting evidence.
11. Record module design/compatibility/verification in product docs and a requirement-by-requirement acceptance artifact. Update owning specs. Complete every current modification goal and independent acceptance before the final commits, preserving unrelated staged work.
12. Prepare stable 0.1.3 metadata and release notes, validate a clean isolated release source, and publish through the tag workflow after source gates and installed-wheel verification. Verify the public assets, installer and installed browser/backend behavior using synthetic fixtures and ownership-aware cleanup. Follow `docs/releasing.md` and the `publish-jev-release` procedure; do not upgrade the operator installation or generate upstream completions.

# Commands

## Supplier list Models entry update

1. Remove the separate Models shell destination, App provider-selection callbacks and obsolete setup/default links.
2. Render each supplier's configured model list with Edit buttons, plus disclosed discovery/import controls bound to that provider ID. Reuse the shared model editor Dialog and retain drafts and query ownership.
3. Preserve aggregate dirty/pending/error/query/focus ownership across dismissal, supplier editing, kind changes and reconnect.
4. Add focused browser coverage for supplier isolation, same-model IDs across connections, read-only inspection, draft dismissal, pending writes, editor/import transitions and narrow-screen reachability. Migrate affected live navigation tests while preserving historical frozen acceptance files.
5. Run frontend lint, TypeScript/unit and focused browser checks using independently built assets; update product/spec entry documentation and current web-render gallery.

`npm --prefix frontend run lint`, `npm --prefix frontend run test`, `npm --prefix frontend run build`, `npm --prefix frontend run test:browser`, `uv run pytest -q`, `uvx pyright`, `scripts/build-frontend.sh --check`, `uv build`.

# Acceptance gates

No outstanding PRD row or confirmed review defect; browser failures receive cause-specific fixes rather than deleted assertions. Secrets stay synthetic in fixtures/screenshots. Public metadata retrieval may be inspected read-only; tests mock sources and never generate upstream completions. Preserve pre-existing edits even when they overlap integration files.

# Independent acceptance ownership

| Task | Fresh acceptance context | Required record |
| --- | --- | --- |
| Settings and access security | `accept-settings` | child `acceptance.md` for GS1-GS3/IA3-IA5 |
| Workflow canvas | `accept-canvas` | child `acceptance.md` for WF1-WF6/IA3-IA5 |
| Supplier connections | `accept-suppliers` | child `acceptance.md` for SP1-SP5/IA2-IA5 |
| Model contracts | `accept-contracts` | child `acceptance.md` for backend/API requirements |
| Model workspace | `accept-models` | child `acceptance.md` for MI1-MI5/ME1-ME4 |
| Parent integration | `accept-integration` | parent `acceptance.md` for IA1-IA5/DV1-DV3 and cross-child integration |

Acceptance contexts start from the recorded source requirements and current integrated code, without inheriting implementer conversations. Rework returns to the implementing owner; subsequent verification resumes the task's acceptance context. A pre-integration review may identify gaps but cannot declare final PASS before the required integrated browser/runtime checks pass.
