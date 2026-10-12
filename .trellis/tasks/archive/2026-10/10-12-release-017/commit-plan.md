# Authorized 0.1.7 commit and publication plan

The user's instruction to publish all current changes authorizes the following
work commits, in order. The scope includes the admitted 33 product files,
three additional browser repair files, and the three release version records.
Source acceptance precedes staging.

## 1. Generic model metadata

`fix(metadata): auto-fill generic model facts on custom endpoints`

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

## 2. Workflow controls and localization

`feat(dashboard): simplify workflow controls and refresh translations`

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
- `frontend/tests/browser/canvas-creation-menu-business.spec.ts`
- `frontend/tests/browser/canvas-gesture-boundaries.spec.ts`
- `frontend/tests/browser/canvas-policy-recovery.spec.ts`
- `frontend/tests/browser/canvas-state-responsive-rows.spec.ts`
- `frontend/tests/browser/canvas-toolbar.spec.ts`
- `frontend/tests/browser/canvas-wave3-focus.ts`
- `frontend/tests/browser/canvas-workflow-actions.spec.ts`
- `frontend/tests/browser/global-route-path.spec.ts`
- `frontend/tests/browser/icons.spec.ts`
- `frontend/tests/browser/routing-editor.spec.ts`
- `frontend/tests/browser/settings.spec.ts`
- `frontend/tests/browser/workflow-controls.spec.ts`

The repair also changes five paths already listed in this group. Keep its
eight-file inventory and original failure records with the release evidence.
The independent repaired-source verdict must pass before these files are staged.

## 3. Release version

`chore(release): prepare 0.1.7`

- `pyproject.toml`
- `jev_gateway/__init__.py`
- `uv.lock`

The three records contain `0.1.7`; all 65 dependency records remain unchanged.
The parent rechecks source bytes, Git modes, HEAD and normal index before the
commits, preserves configured signing/hooks, and verifies the final product tree
against the candidate that passed validation.

## Publication and bookkeeping

After local source/package/smoke acceptance, push the signed work commits and
the annotated `v0.1.7` tag to trigger the existing formal release workflow.
Observe actual build and both OS smoke success, then verify hosted and public
assets and run the isolated public installer smoke. Preserve prior releases.

Archive the accepted metadata and release tasks and append the final journal
only after their applicable acceptance is complete. Archive and journal changes
use separate signed bookkeeping commits after the work commits. Repair moved
task context paths and keep raw evidence/runtime outside commits. The release
tag stays on the product release commit; final bookkeeping advances `main`.

The operator's local installation and daemon remain unchanged.
