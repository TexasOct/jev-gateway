# Original metadata source commit plan

This records the initial metadata-only plan. The later instruction to publish
all current changes as `0.1.7` authorized its execution within the release task.
Signed commit `da122333df853f21cdeeff4430cc501a11bd2d60` contains these
13 paths; the separate UI and version commits deliver the combined release.
The approval limits below describe the original plan. Final acceptance is in
`acceptance.md`.

The reviewed source is ready for one scoped local commit on the current `main`
branch. This plan awaits the one-shot confirmation required by
`.trellis/workflow.md`, Phase 3.4. No files have been staged.

## Commit

Subject: `fix(metadata): auto-fill generic model facts on custom endpoints`

The commit removes serving-host equality from generic metadata applicability
while retaining exact source/model identity, compatible transport and strict
native OpenRouter source selection. It includes the regressions and directly
affected backend/product documentation.

Complete file list:

- `jev_gateway/model_metadata.py`
- `tests/test_model_metadata.py`
- `tests/test_model_metadata_business_oracles.py`
- `tests/test_provider_onboarding_integration.py`
- `tests/test_metadata_cache_failure_privacy.py`
- `frontend/src/features/providers/__tests__/evidence-regression.test.ts`
- `frontend/src/features/providers/__tests__/model-source-values.test.ts`
- `frontend/src/features/providers/__tests__/model.test.ts`
- `frontend/tests/browser/supplier-models.spec.ts`
- `.trellis/spec/backend/provider-configuration.md`
- `docs/http-api.md`
- `docs/models-config.md`
- `docs/admin-experience.md`

## Other dirty files excluded from this commit

These 20 current modified files belong to other work. Their latest bytes were
preserved during the transfer; approval of this plan leaves them out of the
source commit.

- `.trellis/spec/backend/dashboard-routing-config.md`
- `frontend/src/features/monitoring/__tests__/StrategyDistribution.test.tsx`
- `frontend/src/features/routing/RoutingCanvas.tsx`
- `frontend/src/features/routing/RoutingEditor.tsx`
- `frontend/src/features/routing/__tests__/CanvasNodeContent.test.tsx`
- `frontend/src/features/routing/__tests__/ConfiguredRouteFlow.test.tsx`
- `frontend/src/features/routing/__tests__/RoutingEditor.test.tsx`
- `frontend/src/shared/i18n/en.ts`
- `frontend/src/shared/i18n/zh-CN.ts`
- `frontend/src/shared/ui/theme-contract.test.js`
- `frontend/tests/browser/canvas-connection-popover.spec.ts`
- `frontend/tests/browser/canvas-gesture-boundaries.spec.ts`
- `frontend/tests/browser/canvas-policy-recovery.spec.ts`
- `frontend/tests/browser/canvas-state-responsive-rows.spec.ts`
- `frontend/tests/browser/canvas-toolbar.spec.ts`
- `frontend/tests/browser/canvas-workflow-actions.spec.ts`
- `frontend/tests/browser/global-route-path.spec.ts`
- `frontend/tests/browser/routing-editor.spec.ts`
- `frontend/tests/browser/settings.spec.ts`
- `frontend/tests/browser/workflow-controls.spec.ts`

## Execution boundary

Before staging, recheck each candidate hash against `verification/transfer.json`
and inspect the current index. Stage and commit only the 13 listed paths. Verify
the staged diff and staged file list before committing; preserve other staged
entries and all unrelated working files. Never use broad `git add`.

Task records and native evidence remain available under this task directory.
Archive/journal bookkeeping requires a separate scoped plan after the work
commit. This confirmation covers the local source commit only; push, tag,
release publication, installation, restart and archive remain excluded.
