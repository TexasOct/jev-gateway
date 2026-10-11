# Primitives acceptance

## Current status after operator E1 acceptance

On 2026-10-11 the operator confirmed "验收通过" after the parent's interactive E1
page handoff. E1 is now PASS by operator manual acceptance on the unchanged
candidate; P1-P3 retain their independent passing evidence. The current manual
record is [e1-manual-acceptance.md](../10-06-shadcn-ui-adoption/e1-manual-acceptance.md).
The original BLOCKED review, approved-exception follow-up and both failed native
popup diagnostics below remain historical records. No source or test changed.

## Primitives reviews before manual E1 closure

Independent review passes P1-P3 within the operator-approved scope defined by
[E1](../10-06-shadcn-ui-adoption/acceptance-exceptions.md). Native select
popup-first Escape remains **UNVERIFIED**. The current result is in
[check-exception-handoff.md](./check-exception-handoff.md); the original
`check-handoff.md` and both failed diagnostics remain unchanged.

P1-P3 developer checks are verified on the owned slice. The parent supplied
the requested native LSP probe against `research/final-source-snapshot.json`;
[research/parent-native-lsp-replacement.json](./research/parent-native-lsp-replacement.json) records 33 clean files and zero
diagnostics with unchanged before/after source hashes. The independent review and
approved-scope follow-up are recorded below.
No downstream task has started.

The queued earlier parent probe is preserved in
[research/parent-native-lsp.json](./research/parent-native-lsp.json), bound to
the snapshot before the directional-border correction. It does not certify
the final source; the replacement receipt above supplies that evidence.

| Criterion | Developer evidence |
| --- | --- |
| P1 shared controls and states | Official registry originals/adaptation map, 10 focused unit tests, six native fixture cases at 1440/390/320px in light/dark, inspected screenshots, actual 44px geometry/current-color arrow, visible focus, disabled and invalid paint, destructive badge contrast >=4.5:1. Existing Button variants/contrast are byte-preserved from accepted Foundation. |
| P2 native form/select/tri-state/Dialog/auth | Native refs/change events/raw empty draft/FormData/Enter/Space/indeterminate/sentinel checks pass. Existing Dialog/auth/model cases 21/21 pass. Select geometry/keyboard/disabled/listbox/forced-colors final recheck 21/21 passes. Original assertions, retries and deadlines remain unchanged. |
| P3 diagnostics/import/reset boundary | Full frontend lint exits 0 with only the four existing i18n refresh warnings. Focused units 10/10. Production TypeScript/Vite build exits 0, existing browser tsc exits 0, explicit new shared-source/TSX-fixture tsc exits 0. Nine stylesheet/sole-entry/no-Preflight tests pass. Parent native LSP checks 33 files: clean=33, diagnostics=0, all other outcomes=0, bound to the final source before and after the probe. Child has no exposed LSP tool. |

`research/commands.json` contains exact commands, native exits and log pointers.
`research/adaptation-and-coverage.md` records component consumers, retained
native/custom behavior and local registry changes. `research/lock-delta.json`
records three package additions, no removals and no existing non-root package
entry changes. `research/initial-boundary.json` and `initial-working.diff`
preserve inherited work; the final snapshot binds this stage's source.

Both failed attempts remain preserved. The synthetic first attempt failed two
320px fixture overflows; the production first attempt failed forced-colors
appearance after 41 passes. Fixture layout and selector specificity were fixed
without changing their assertions. The final six native probes and 21 select
cases pass. Final review also removed redundant all-edge border-solid from
Dialog's directional header/footer borders: without Preflight it could paint
initial medium-width side edges. A fresh build, direct lint and all 21 affected
Dialog/auth/model cases pass after that final source fix. The earlier source
snapshot is retained; the final snapshot has the corrected Dialog hash. No
passing gate was repeated without a source/test change.

This stage delivers controls for actual mapped page sites. Button/Card/Separator/
Dialog are connected to existing production consumers. The new field/feedback
controls are exercised in the owned synthetic fixture; Config, Operational and
parent owners substitute them into their mapped feature sites and own B layout
screenshots. Their page migration and the parent's stable full gate remain
separate from this component acceptance.

No staging, commit, publication, task archival or real configuration/service
change was performed. Historical admin acceptance exceptions are preserved.

## Original independent check before E1 approval

The independent review found no concrete defect in the owned production slice.
All 30 final snapshot entries and six additional LSP harness entries match live
bytes. Required lint/unit/build/select/Dialog/auth/native compatibility receipts
remain applicable; unchanged passing suites were not repeated. The reviewer
checked installed Label/Dialog declarations, original regression assertions,
actual adjacent ModelDialog/ProviderSetupFields code and the lock delta. The live
lock adds three entries, removes none and changes no existing non-root entry.
Admission is preserved in `research/check-initial-boundary.json` and
`research/check-initial-working.diff`. Final identities and reviewer command exits
are in `research/check-validation.json`.

| Criterion | Independent verdict and evidence |
| --- | --- |
| P1 | Verified within primitive ownership. Reviewed source, generated adaptations, preserved Button variants and existing unit/native receipts. Inspected `research/primitive-browser-results/primitives.check.ts-primit-973fd-ve-compatibility-dark-320px/controls.png` and `research/dialog-final-browser-results/dialog-escape-rework-web-m-80c5d-plier-owned-1280-zh-CN-dark/dirty-consent.png`; controls fit, focus/invalid/disabled states are visible and the modal footer remains exposed. Feature-site B layouts remain downstream. |
| P2 | BLOCKED on the migration map's explicit native-select popup-first Escape receipt. Existing 21 select, 21 Dialog/auth/model and six primitive cases support their original assertions, but none opens a popup before Escape. The new production probe proves `:open=true`; ordinary Playwright Escape leaves it true through the normal 5000ms predicate deadline. An authorized plain native-select control reproduces the same failure without React/Radix/Dialog. This demonstrates a runner limitation and does not certify production popup dismissal. No waiver or current accepted receipt was supplied. |
| P3 | Verified for production source. Existing final lint/build/type/unit and parent native LSP receipts bind unchanged hashes. Reviewer supplemental lint and browser TypeScript checks exit 0; `git diff --check` exits 0 and the index is empty. No case collision, reset or import defect found. |

The popup probes are additive `.check.ts` fixtures invoked by a separate config;
they do not change production collection, existing assertions, retries or
deadlines. Both native failures remain in `research/check-popup.log` and
`research/check-popup-control.log`, with screenshots under their corresponding
results directories. The production open-state screenshot was inspected; browser
capture omits the native popup surface, so it supplies no visual dismissal proof.
Source and installed runner identities are retained in `check-validation.json`.

The smallest remaining action is to obtain supported native-popup Escape evidence
using the installed browser runner, or resolve the clause explicitly through the
parent's contract review. The plain control failure does not justify a product
workaround, an OS/native-menu/HID helper, weaker assertions or a historical PASS.
Production source remains unchanged. No downstream task was started.

Stage verdict: BLOCKED

## Operator-approved E1 and recovery

After the original BLOCKED review, the operator replied “同意” to the explicit
proposal to carry this one native-popup observation as an unverified acceptance
exception and continue B page construction. The effective scope is recorded in
[acceptance-exceptions.md](../10-06-shadcn-ui-adoption/acceptance-exceptions.md).
E1 is not a passing popup receipt. All other P1-P3 checks remain required.

The original verdict above and `check-handoff.md` remain historical evidence.
The same independent reviewer has completed the approved-scope review against
unchanged source and existing receipts. `check-exception-handoff.md` records the
current result. This reviewer activated only Primitives and started no downstream
task. No production source change or rerun of unchanged passing checks was needed.

## Independent approved-scope acceptance

The operator's explicit “同意” authorizes E1 for this migration. This follow-up
resolves the acceptance-scope blocker only. Native popup-first Escape remains
**UNVERIFIED**, and both failed diagnostic commands still have native exit 1.
No concrete production defect was found or waived.

| Criterion | Current approved-scope verdict and receipt pointers |
| --- | --- |
| P1 | PASS within primitive ownership. Original independent source/screenshot review remains applicable. `research/unit-1.log` records 10 passing unit cases; `research/primitives-browser-final.log` records six native cases across 1440/390/320px and both schemes. `research/final-evidence.json` retains screenshot paths, including the inspected dark 320px controls and production dark Chinese dirty-close Dialog. Accepted Foundation Button paint remains unchanged. |
| P2 | PASS within the scope approved by E1; popup-first Escape is UNVERIFIED. `research/select-browser-2.log` records 21 select cases; `research/dialog-browser-final.log` records 21 guarded Dialog/auth/model cases; the six primitive cases cover refs/events/raw drafts/form submission/tri-state/sentinels/indeterminate. Existing assertions, normal deadlines and zero retries remain intact. `research/check-popup.log` and `research/check-popup-control.log` remain failed diagnostic evidence outside passing behavior receipts. |
| P3 | PASS. Existing final lint, unit, production build and compiler/browser type receipts remain applicable. `research/parent-native-lsp-replacement.json` separately records native LSP: 33 clean files, zero diagnostics and no unsupported/unavailable/failed/inconclusive outcomes. `research/check-validation.json` retains supplemental lint/type exits 0. Hash reconciliation confirms the final snapshot and LSP scope; compiler evidence is not substituted for LSP. No case/import/reset defect found. |

`research/check-exception-initial-boundary.json` captures main HEAD
`8352e4b0818c73c5f2dee6a98345e655b85a1cba`, working status, all frontend source
hashes and hashes of the 16 protected original review/failure artifacts.
`research/check-exception-initial-working.diff` preserves the inherited diff.
All 30 final snapshot entries, six additional LSP harness entries and three popup
diagnostic/config entries match the original reviewed hashes. The actual lock
comparison remains three additions, zero removals and zero existing non-root
package changes; no installation was needed or performed in this follow-up.

`research/check-exception-final-validation.json` records current commands/exits,
source and protected-evidence reconciliation, screenshot existence and empty
index. The original BLOCKED report, failure logs/results and diagnostic assertions
are byte-preserved. No source, tests, retries, deadlines or browser runner changed.
Only the PRD checklist, this acceptance record and the new handoff were edited,
with additive research receipts. Downstream feature-site B layouts and the
parent's complete stable-source integration gate remain with their owners.

Current result: PASS for the approved Primitives scope, with E1 UNVERIFIED.

The first follow-up receipt-validation script exited 1 because the reviewer
joined already research-prefixed screenshot paths to `research/` twice. Its
output remains in `research/check-exception-path-validation-failed.json`.
Correcting the receipt's path base to the task root finds all four retained
screenshots; final receipt validation exits 0. No screenshot, test assertion or
source changed to resolve this bookkeeping error.
