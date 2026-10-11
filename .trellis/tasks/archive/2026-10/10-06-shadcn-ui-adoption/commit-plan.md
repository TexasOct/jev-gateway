# B construction commit plan

The operator authorized archival followed by a scoped commit on 2026-10-11. The five tasks have been archived. The final scope combines R1, R2, R3 and the E1 follow-up in one dependency-complete commit. Version changes and publication remain outside scope. The original verified candidate is the working tree on `main`, based on `8352e4b0818c73c5f2dee6a98345e655b85a1cba`, with inherited metadata work preserved.

Attribution uses Foundation's `research/initial-status.txt` and `research/initial-working.diff`, the Primitives admission, Config's `research/implementation-delta.diff`, Operational admission/originals, and the parent's integration admission. Dirty status supplies exact current paths; it does not establish ownership. The final source manifest is `research/reconciled-frozen-source.json` (462 entries, SHA256 `91c5fc7d9630d45f6e2be04bfd31d02e062646d765287fa8f2aea9d72030829d`).

## R1: shared controls, styles and maintenance

Proposed subject: `feat(ui): adopt shadcn sources and native control adapters`

These 39 paths have whole-file migration attribution. Keep the pinned CLI/dependency/lock changes together with their adapters, tokens, maintenance instructions and native-control harnesses. Preserve the business Dialog contract and approved destructive hover correction. The existing tracked, unchanged `frontend/src/shared/ui/LICENSE.shadcn.md` remains part of the tree without a new delta.

```text
frontend/components.json
frontend/package.json
frontend/package-lock.json
frontend/src/styles/base.css
frontend/src/styles/index.css
frontend/src/styles/tokens.css
frontend/src/shared/ui/Dialog.tsx
frontend/src/shared/ui/Field.tsx
frontend/src/shared/ui/README.md
frontend/src/shared/ui/WORKFLOW.md
frontend/src/shared/ui/alert.tsx
frontend/src/shared/ui/badge.tsx
frontend/src/shared/ui/button-variants.ts
frontend/src/shared/ui/button.tsx
frontend/src/shared/ui/card.tsx
frontend/src/shared/ui/checkbox.tsx
frontend/src/shared/ui/fields.test.tsx
frontend/src/shared/ui/input.tsx
frontend/src/shared/ui/label.tsx
frontend/src/shared/ui/native-select.tsx
frontend/src/shared/ui/separator.tsx
frontend/src/shared/ui/textarea.tsx
frontend/src/shared/ui/primitives/alert.tsx
frontend/src/shared/ui/primitives/badge.tsx
frontend/src/shared/ui/primitives/button.tsx
frontend/src/shared/ui/primitives/card.tsx
frontend/src/shared/ui/primitives/dialog.tsx
frontend/src/shared/ui/primitives/input.tsx
frontend/src/shared/ui/primitives/label.tsx
frontend/src/shared/ui/primitives/native-select.tsx
frontend/src/shared/ui/primitives/separator.tsx
frontend/src/shared/ui/primitives/textarea.tsx
frontend/tests/browser/primitives-popup-control.check.ts
frontend/tests/browser/primitives-popup.check.ts
frontend/tests/browser/primitives-popup.config.ts
frontend/tests/browser/primitives.check.ts
frontend/tests/browser/primitives.config.ts
frontend/tests/browser/primitives.html
frontend/tests/browser/primitives.tsx
```

The popup probes retain failed evidence for E1; their inclusion does not assert that popup-first Escape passed. `ToolButton`, `cn` and the MIT license have no current Git delta and are excluded from the staging list.

## R2: B surfaces and consumer verification

Proposed subject: `feat(dashboard): apply B presentation across dashboard surfaces`

These 34 paths have whole-file migration attribution. Keep the rendering/locator reconciliations, inspector readiness and model exposure boundary with the views they verify. Preserve original native actions, guards, business assertions, deadlines and zero retries. The observation fixture remains dormant when its environment flag is unset.

```text
frontend/src/app/AppShell.tsx
frontend/src/app/ConnectionPage.tsx
frontend/src/features/appearance/AppearanceView.tsx
frontend/src/features/monitoring/__tests__/MonitoringView.test.tsx
frontend/src/features/monitoring/components/RouteTrace.tsx
frontend/src/features/monitoring/components/SessionInspector.tsx
frontend/src/features/monitoring/components/StrategyDistribution.tsx
frontend/src/features/providers/models/ModelManagementView.tsx
frontend/src/features/providers/models/ProviderModels.tsx
frontend/src/features/providers/suppliers/ProviderIconPicker.tsx
frontend/src/features/providers/suppliers/ProviderSetupFields.tsx
frontend/src/features/providers/suppliers/ProviderView.tsx
frontend/src/features/providers/suppliers/TransportCredentialFields.tsx
frontend/src/features/routing/ConfiguredRouteFlow.tsx
frontend/src/features/routing/RoutingCanvas.tsx
frontend/src/features/routing/RoutingEditor.tsx
frontend/src/features/routing/__tests__/RoutingEditor.test.tsx
frontend/src/features/settings/AccessSecurity.tsx
frontend/src/features/settings/GatewayCredentialForm.tsx
frontend/src/features/settings/GlobalDefaultModel.test.tsx
frontend/src/features/settings/GlobalDefaultModel.tsx
frontend/tests/browser/canvas-final-focused.spec.ts
frontend/tests/browser/canvas-model-node-handoff.spec.ts
frontend/tests/browser/canvas-policy-recovery.spec.ts
frontend/tests/browser/fixtures.ts
frontend/tests/browser/model-tail-rework.spec.ts
frontend/tests/browser/model-workspace.spec.ts
frontend/tests/browser/provider-management.spec.ts
frontend/tests/browser/select-controls.spec.ts
frontend/tests/browser/successor-settings-acceptance.spec.ts
frontend/tests/browser/config-surfaces.spec.ts
frontend/tests/browser/integration-surfaces.spec.ts
frontend/tests/browser/operational-surfaces.spec.ts
frontend/tests/fixtures/native-observation.ts
```

The following two files require migration-only hunks. Do not select their complete HEAD-to-working-tree diffs.

```text
frontend/src/features/providers/models/ModelDialog.tsx
frontend/src/features/providers/models/ModelFields.tsx
```

| Shared file | Select from the admitted Config delta | Exclude as inherited behavior |
| --- | --- | --- |
| `ModelDialog.tsx` | Imports for Input/Checkbox/Alert/Field; error Alert markup; Field/Input for upstream ID, display name, tags, priority and quality; enabled/restore Checkbox markup. Current anchors: lines 9, 61, 70, 73, 74, 76, 77 and 82. | Reference notice `mmReferenceNote` at line 80; model drafts, evidence, field changes, save/discard/import ownership and all pre-existing metadata behavior. |
| `ModelFields.tsx` | Shared control imports; `data-model-field` grouping; Field/NativeSelect/Input/Checkbox wrappers; status Badge. Current anchors: lines 5, 23, 24, 27, 28 and 35. | Import of `modelSourceValues` at line 3 and source-choice/adoption block at lines 31 to 33; metadata interpretation, unknown/true/false and raw draft ownership. |

`supplier-models.spec.ts` also received a hunk-level inspection. Its complete current delta is the inherited `reference source values can be adopted and saved from ${mode} models` block plus that block's B locator adaptation. Primitives and Config admission diffs already contain its 41 inherited added lines. Excluding that block leaves this file identical to HEAD, so it has no delta in the selected commit and remains an uncommitted working file.

The Config delta's corresponding hunks start at lines 63, 77, 90, 109, 113, 128 and 154. Foundation's before-image already contains the reference notice and source-value adoption at lines 329, 341, 349 and 351. It also adds the `modelSourceValues` export at line 364 and locale keys at lines 394 to 408. These are concrete inherited changes outside B implementation.

The accepted current tree includes those inherited helpers and locale keys. Copying the complete shared files while excluding `model.ts`/locales would create an unresolved dependency on a bare HEAD-based tree. A later commit operation must establish the inherited work's separate base/ownership or construct and validate the selected migration tree. The current acceptance does not claim that a B-only staged tree has been assembled or verified. Do not absorb inherited behavior into R2 to avoid that check.

## R3: task contracts and acceptance records

Proposed subject: `docs(trellis): record B construction acceptance and E1`

Select Git-visible task documents and context manifests under these five task directories, including this plan and `parent-reconciliation.md`:

- `.trellis/tasks/10-06-shadcn-foundation/`
- `.trellis/tasks/10-06-shadcn-primitives/`
- `.trellis/tasks/10-06-shadcn-config-surfaces/`
- `.trellis/tasks/10-06-shadcn-operational-surfaces/`
- `.trellis/tasks/10-06-shadcn-ui-adoption/`

Include the two migration additions in `.trellis/spec/backend/dashboard-routing-config.md`: the NativeSelect geometry/forced-colors contract and `Shared UI source and retained owners`. Preserve the document's other contracts. Current acceptance is A1–A8 PASS with E1 PASS by operator manual confirmation. Retain the original BLOCKED popup review and all historical failure records. Implementation reports that correctly said independent review was pending at delivery remain historical records; the later independent handoff supplies the final verdict.

## E1 follow-up

Include these four task-owned interaction-fixture files, plus `e1-manual-acceptance.md`, the five archive notes and the final closure record:

```text
frontend/tests/browser/e1-manual.html
frontend/tests/browser/e1-manual.tsx
frontend/tests/browser/e1-manual.tsconfig.json
frontend/tests/browser/e1-manual-source.json
```

The source-binding JSON retains the original working-candidate identities and historical paths. It is evidence for that manual handoff, not a claim that the selected commit tree has identical shared model source bytes. The selected tree excludes inherited business additions without changing the shared NativeSelect or Dialog implementation.

## Exclusions and evidence custody

Exclude these inherited files from the B commit scope:

- `frontend/src/features/providers/models/model.ts`
- `frontend/src/shared/i18n/en.ts`
- `frontend/src/shared/i18n/zh-CN.ts`
- `frontend/src/features/providers/__tests__/model-source-values.test.ts`
- `frontend/tests/browser/supplier-models.spec.ts` (inherited source-adoption cases and their locator adaptation)
- `jev_gateway/model_metadata.py`
- `tests/test_model_metadata.py`
- `docs/admin-experience.md`
- `.trellis/spec/backend/provider-configuration.md` (serving overrides and explicit source choices)

Foundation's initial status has 32 entries, including three untracked records; its tracked patch alone has 29 paths and cannot identify the inherited untracked source test. Do not use dirty status or a guessed wrapper filename to expand scope.

Ignored `research/` logs, result directories, screenshots, traces, wheel/install artifacts, synthetic homes, runtime state and temporary controllers stay outside the proposed commits. Their links in acceptance records point to retained local evidence. Historical public-installed helpers, pinned public descriptors, operator configuration/credentials and service state have no migration attribution. Generated bundled assets are acceptance/package outputs, not a separate source change.

Before any later Git mutation, recheck the current scope and preservation boundary; construct the intended staged tree using only admitted migration hunks; inspect its cached diff and dependency closure. If that tree differs from the accepted candidate, its relevant validation belongs to the later operation. Do not replay unchanged current-candidate gates merely to restate their passing results.
