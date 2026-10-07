# Shared primitives execution plan

## Dependency

Wait for the full admin delivery/archive gate in parent `research/start-dependency.md` and foundation F1-F3 acceptance. The user's deferred-start instruction applies to this child too. Re-read the current accepted Dialog baseline and its relevant original-task rechecks before editing; materially changed plans require review.

## Steps

1. Generate only used controls with the configured pinned CLI; inspect sources/dependencies before integration.
2. Connect existing public Button/Card/Separator/ToolButton and Dialog APIs to the primitive/token system without case-only filenames or duplicated visual rules.
3. Add field and native-select controls; preserve submit/ref/event/native-value contracts and field associations. Keep tri-state fields as NativeSelect consumers.
4. Add actual badges/alerts/tabs/menu/tooltip needs; verify modal containment and keyboard/dismiss ordering.
5. Check global native-control rules, one stylesheet entry, disabled/invalid/focus visuals and 44px form-select sizing/arrow clearance where required.
6. Run root frontend lint/unit/build. From `frontend/`, run focused `select-controls.spec.ts`, `dialog-escape-rework.spec.ts`, `auth-workspace.spec.ts`, `model-dialog-rework.spec.ts` with the existing Playwright config, after a fresh build.
7. Probe changed TypeScript paths with active LSP diagnostics. Record P1-P3 plus any justified native/custom retention in the coverage map, then deliver stable props/style contracts to both page children.

Rollback only the primitive slice; preserve baseline Dialog fixes and existing assertions. Do not increase retries/timeouts or perform business writes to make a presentation check pass.
