# Proposed commit

`refactor(routing): simplify canvas flow and question editing`

The operator superseded the scoped proposal with explicit authorization: “当前所有的修改全部追踪提交，然后发布新的版本”. All current workspace changes are approved for tracking and commit, followed by stable release 0.1.13. The original scoped proposal below is retained as history; its exclusion list no longer limits the authorized commit. Generated bundles, ignored runtime evidence and private operator files remain outside Git.

## Included scope

- `.trellis/spec/backend/dashboard-routing-config.md`
- `.trellis/tasks/10-15-routing-editor-flow/`
- `frontend/src/features/routing/RoutingCanvas.tsx`
- `frontend/src/features/routing/RoutingEditor.tsx`
- `frontend/src/features/routing/components/CanvasNodeContent.tsx`
- `frontend/src/features/routing/model/canvas.ts`
- `frontend/src/features/routing/model/node-card.ts`
- `frontend/src/features/routing/model/outputs.ts`
- `frontend/src/features/routing/__tests__/CanvasNodeContent.test.tsx`
- `frontend/src/features/routing/__tests__/RoutingEditor.test.tsx`
- `frontend/src/features/routing/__tests__/canvas.test.ts`
- `frontend/src/features/routing/__tests__/node-card.test.ts`
- `frontend/src/features/routing/__tests__/outputs.test.ts`
- `frontend/src/shared/i18n/en.ts`
- `frontend/src/shared/i18n/zh-CN.ts`
- `frontend/src/shared/ui/theme-contract.test.js`
- `frontend/tests/browser/canvas-connection-popover.spec.ts`
- `frontend/tests/browser/canvas-connections.spec.ts`
- `frontend/tests/browser/canvas-creation-menu-business.spec.ts`
- `frontend/tests/browser/canvas-final-focused.spec.ts`
- `frontend/tests/browser/canvas-flow-redesign.spec.ts`
- `frontend/tests/browser/canvas-ink-repair.spec.ts`
- `frontend/tests/browser/canvas-reachability-repair.spec.ts`
- `frontend/tests/browser/canvas-state-responsive-rows.spec.ts`
- `frontend/tests/browser/canvas-toolbar.spec.ts`
- `frontend/tests/browser/canvas-visual-acceptance.spec.ts`
- `frontend/tests/browser/canvas-workflow-actions.spec.ts`
- `frontend/tests/browser/decision-diagnostics.spec.ts`
- `frontend/tests/browser/decision-routing.spec.ts`
- `frontend/tests/browser/icons.spec.ts`
- `frontend/tests/browser/routing-editor.spec.ts`
- `frontend/tests/browser/workflow-controls.spec.ts`

`RoutingEditor.tsx` and its unit tests already had local changes when this task began. The canvas/header and some associated tests also changed concurrently. `canvas-toolbar.spec.ts`, `decision-diagnostics.spec.ts` and `decision-routing.spec.ts` contain companion changes from that work and were not authored by this task. They are proposed for explicit inclusion because they validate the integrated header/settings behavior. The final acceptance covers the integrated current frontend. Approval of this file-based commit scope includes the current diffs in the listed shared files, including the compact strategy header, settings/readiness presentation and consolidated add-model menu; these are not all attributable to this task. If those changes need separate ownership, prepare a hunk-level split before committing.

## Existing or concurrent work excluded

- `README.md`
- `README.zh-CN.md`
- `GLOSSARY.md`
- `docs/project-structure.md`
- `.trellis/tasks/10-15-provider-subscription-onboarding/`
- `.trellis/tasks/10-15-task-type-router/`

Generated frontend output and ignored `.trellis/.runtime/` receipts remain excluded. Check the working-tree inventory against this plan before staging so later concurrent work cannot enter the commit silently.
