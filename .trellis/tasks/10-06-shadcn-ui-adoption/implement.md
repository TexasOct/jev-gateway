# Implementation and verification plan

## Admission

- [x] Present the complete planning summary. The user's subsequent instruction is to wait until the admin task family is delivered and archived before starting.
- [ ] Verify `10-05-admin-experience` and all five children have completed delivery acceptance and archive, following `research/start-dependency.md`. All five shadcn tasks remain planning until this condition is met; no implementation dispatch, dependency installation or disposable CLI initialization before then.
- [ ] Reconcile the plan with the final delivered admin source/specs. Carry forward the user's deferred-start instruction; request renewed review only if the approved outcome or implementation plan changes materially.
- [ ] Validate parent and child context manifests. Re-read the current task and relevant spec guidance at each phase.
- [ ] Capture current branch, working/staged changes and source hashes for overlapping frontend files. Review the original admin Dialog/dependency/shell rechecks; record the accepted baseline and any unresolved failures without claiming they passed.
- [ ] Preserve other sessions' acceptance documents, test fixtures, staged work and latest source. An isolated checkout does not bypass the user's requirement to wait for full admin delivery and archive.

## Stage 1: foundation

Owner: `10-06-shadcn-foundation`.

- [ ] Start only this child after review/approval. Confirm npm, current Tailwind/React and CLI compatibility from installed declarations/docs at implementation time.
- [ ] Preview official Radix/Vite initialization in a disposable frontend copy; inspect configuration, CSS, aliases, utility and dependency output.
- [ ] Pin the tested CLI version, add reviewed `components.json` aliases and retain the npm lockfile.
- [ ] Complete semantic tokens using the existing palette and `data-scheme`; preserve neutral surfaces, blue/custom seed, contrast, theme save/reset and disabled/stale-read guards.
- [ ] Document init/add/view/diff/update, wrapper boundaries, source ownership and licenses. Run a disposable component-add smoke check.
- [ ] Run lint, unit and build plus appearance/connection browser checks. Foundation acceptance supplies the stable token/configuration contract.

## Stage 2: primitives

Owner: `10-06-shadcn-primitives`; depends on accepted foundation.

- [ ] Add the used official controls to `shared/ui/primitives` and preserve thin public adapters. Refresh the actual component census.
- [ ] Preserve button submit/ref behavior, string input drafts, native selects, sentinel options, tri-state fields and boolean/indeterminate controls.
- [ ] Adopt Card/Badge/Alert/Tabs/menus/Tooltip where existing surfaces need them; maintain headings, live regions and focus.
- [ ] Reconcile the latest accepted Radix Dialog with standard presentation behind the existing API. Recheck closing, nested select/menu Escape, auth suspension and footer/focus behavior.
- [ ] Check legacy global CSS against migrated controls. Keep the single entry, existing owner files and scope of unmodified native controls.
- [ ] Run lint/unit/build, select/Dialog/auth browser regressions and active LSP diagnostics for modified TypeScript paths.

## Stage 3: page migrations

Owners: `10-06-shadcn-config-surfaces` and `10-06-shadcn-operational-surfaces`; both depend on accepted primitives. Their feature paths are disjoint. Shared-file changes remain with foundation/primitives or parent; separate checkout/build output is required if execution is concurrent. No parallel execution is necessary for acceptance.

- [ ] Config: migrate settings/appearance fields, supplier rows/forms, embedded models, unified editor and batch import. Reuse existing state and write callbacks.
- [ ] Config: preserve dirty/pending guards, credentials keep/set/clear, tri-state metadata, source evidence, errors/retries, revision protection and supplier ownership.
- [ ] Operational: migrate monitoring panels/list-row presentation and workflow toolbar/menu/inspector/drawer/node skin.
- [ ] Operational: retain virtual row/window dimensions, cursor/focus, canvas metrics, viewport mapping, occlusion, DndContext, history and layout-only writes.
- [ ] Each owner completes the coverage map and local lint/unit/build plus relevant browser suites. Keep failed evidence and recheck receipts.

## Stage 4: parent integration

- [ ] Integrate accepted slices and migrate AppShell/ConnectionPage navigation, actions and form presentation.
- [ ] Check every mapped source site: report official primitive, compatibility adapter or justified retention. Remove dead duplicate skins and obsolete manual-only documentation.
- [ ] Inspect screenshots for representative pages/open editors at 1440px, 390px, 320px, both locales/schemes, plus saved custom seed and tall workflow views. Include loading/empty/error/readonly/pending and dense imports/outputs.
- [ ] Check computed focus/contrast/select geometry, dialog footer reachability, no overflow, actual canvas hit testing/gestures/history and monitoring scroll-driven cursor requests.
- [ ] Run the final checks below once the integrated source is stable; repeat only after changes or unresolved failures.
- [ ] Record requirement-to-evidence verdicts; reconcile relevant old implementation-specific spec wording with accepted behavior, update shared UI conventions and license provenance.
- [ ] Commit scoped task changes without unrelated staged work; follow finish-work guidance. Publication remains outside this task.

## Verification commands

From the repository root:

```bash
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
npm --prefix frontend run test:browser
scripts/build-frontend.sh --check
uv run pytest -q
uvx pyright
```

During iteration, after a fresh build, use focused suites from `frontend/`:

```bash
npm exec -- playwright test -c playwright.config.ts tests/browser/appearance.spec.ts tests/browser/settings.spec.ts tests/browser/connection.spec.ts
npm exec -- playwright test -c playwright.config.ts tests/browser/select-controls.spec.ts tests/browser/dialog-escape-rework.spec.ts tests/browser/auth-workspace.spec.ts
npm exec -- playwright test -c playwright.config.ts tests/browser/supplier-models.spec.ts tests/browser/model-dialog-rework.spec.ts tests/browser/model-workspace.spec.ts
npm exec -- playwright test -c playwright.config.ts tests/browser/monitoring.spec.ts tests/browser/canvas-workflow-actions.spec.ts tests/browser/canvas-connections.spec.ts tests/browser/canvas-visual-acceptance.spec.ts
```

Preserve other existing regression suites in the final full run. Full browser script also type-checks test fixtures. Playwright has zero retries and an isolated preview server; do not reuse an operator gateway or race a shared port/build directory.

Run `uv build --out-dir <isolated-artifact-directory>` during package acceptance using a real task-specific empty directory. Read the current version from `pyproject.toml`, then invoke `scripts/validate-release.py` with its matching `v` tag and that directory. It validates metadata, shell references and wheel/source asset parity, and writes local installer/checksum artifacts; it does not publish. Do not hard-code a version from this planning snapshot. Run targeted release/gateway tests as part of the full pytest gate.

## Receipts and rollback

Record source revision/hash, commands, exit codes, browser dimensions/locale/scheme, inspected screenshots and known limitations per child. Parent `acceptance.md` maps A1-A8 to child and integration evidence. Developer checks do not replace original-task independent verdicts.

Each owning step has a captured baseline and reversible scoped diff. Do not run broad checkout/reset/clean or overwrite public adapters via CLI. Shared lockfile/token edits are integrated once by their owner. Rebuild ignored assets after a rollback and rerun the affected checks.
