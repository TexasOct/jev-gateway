# Config implementation evidence

Independent Config review has accepted C1-C4 for this stage's approved scope. E1 native select popup-first Escape remains **UNVERIFIED**. The parent's complete stable-source integration gate remains pending. The implementation statements below retain their original delivery boundary; independent findings follow at the end.

The owned B presentation slice is complete. Local C1-C4 implementation checks pass within the operator-approved scope. E1, native select popup-first Escape, remains **UNVERIFIED**. Independent Config review and the parent's complete stable-source integration gate remain pending.

## Boundary and source identity

HEAD remains `8352e4b0818c73c5f2dee6a98345e655b85a1cba` on `main`. `research/initial-boundary.json` and `research/initial-working.diff` capture admission before edits. The existing Foundation F1-F3 and Primitives P1-P3 reports were read before construction; their approved scope permits downstream work with E1 recorded separately.

Activation command: `TRELLIS_CONTEXT_ID=pi_01a111be-5788-7169-b951-a0f2417171c2 python3 ./.trellis/scripts/task.py start .trellis/tasks/10-06-shadcn-config-surfaces`, native exit 0. Only this task was activated. The script warned that `main` is also the base branch; no branch, PR, staging or publication operation followed.

`research/implementation-delta.diff` reconstructs the admission bytes in a disposable directory from HEAD plus the inherited diff, verifies the reconstructed source hashes, and compares them with final source. It contains only this stage's changes. This matters for ModelDialog, ModelFields and supplier-models, whose repository diff also contains inherited work. `model.ts` is byte-identical to admission. The inherited model metadata/backend/locales/planning work remains outside this migration delta.

`research/final-evidence.json` records 12 changed production files, one changed source unit test and seven browser files (six reconciled existing files plus the new Config fixture). It records source hashes, source-site counts, command receipts and screenshot hashes. No shared production source changed from admission. The existing package/lock changes belong to predecessors; this stage performed no install and added no dependency. Actual tools reported npm `11.16.0` and Node `v24.18.0`.

Parent native LSP coverage is separate from TypeScript compiler evidence:

- `research/parent-native-lsp-frozen-source.json`: 21 clean files, zero diagnostics. The original scope contains 14 production files, three source unit tests and four browser files.
- `research/parent-native-lsp-affected-source.json`: four clean files, zero diagnostics, covering the final compact ProviderView and three additional consumer tests. The refreshed ProviderView replaces its earlier hash.
- The composed current scope contains 24 distinct files with zero live-byte mismatches. Its sorted path/hash JSON SHA256 is `8d2a164b8576ecb1509ef9b31c02525d94f85586e7f5cf817ac44d63cddfffb7`. Preserve the older receipt as the original probe; it does not certify the replaced ProviderView bytes.

Final reconciliation confirms all 16 protected Primitives evidence entries remain unchanged, including the original BLOCKED handoff and both failed popup diagnostics. The `.check.ts` popup fixtures remain separate from normal acceptance. There are no staged files or whitespace errors.

## C1: page and control coverage

All 13 files in the Config page map were inspected. Twelve production files changed. ModelDetails already uses a flat descriptive list, rule, localized headings and the common Button; its presentation is retained. The adjacent CanvasModelEditor delegates to the same migrated ModelDialog and remains unchanged.

Settings access/security and global default now use flat, spaced sections with top rules. Appearance retains its three peer preference rows and native circular picker while removing the outer card. Suppliers use single row rules, common fields and the existing compact identity presentation. Model rows remain supplier-owned, with native discovery/import and batch disclosure, common controls, source badges and guarded editing. Settings/Suppliers retain the 768px maximum. AppShell/ConnectionPage remain parent-owned.

Current source sites, excluding source tests and option tags:

| Area | Input | NativeSelect | Textarea | Checkbox | Button | Field | Badge | Alert |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Settings | 1 | 1 | 0 | 0 | 11 | 2 | 1 | 3 |
| Appearance | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 2 |
| Suppliers | 7 | 4 | 1 | 2 | 19 | 11 | 0 | 1 |
| Models | 8 | 2 | 0 | 5 | 31 | 8 | 2 | 4 |

Collections render additional controls. These counts identify source coverage, not runtime completeness scores. Field associations are spread onto actual inputs/selects/textareas; Appearance uses associated shared Labels. NativeSelect className continues to target the select. Boolean controls retain native ChangeEvent/checked/fieldset behavior through the accepted Checkbox adapter.

Retained sites and reasons:

- Appearance's native color input and one mapped preset-button site (three runtime presets) retain circular geometry, preview-input/commit-change ordering, keyboard focus and saved/custom selection. The unchanged appearance suite verifies zero preview PUTs and one committed PUT.
- Native details/summary and supplier kind/settings buttons retain their existing disclosure and navigation admission. They are not reinterpreted as Tabs or menus, which would change interaction ownership.
- Compact field warnings, loading/permission notices, source conditions, import counts and committed-read recovery keep their existing local roles/live regions and shared palette/text utilities. Operation failures use Alert; field validation uses Field descriptions. Source/history JSON keeps native bounded scrolling and exact evidence content.
- ModelDetails stays a semantic read-only `dl`; CanvasModelEditor reuses ModelDialog. No duplicate model destination or editor was introduced.

## C2: preserved behavior and consumer reconciliation

Passing scoped receipts cover keep/set/clear, native secret capture and failed-draft restoration, gateway/default write admission and revision recovery, theme preview/commit and stale read ownership, supplier search/kind/close protection, per-supplier metadata/error ownership, raw tri-state/sentinel/numeric drafts, source adoption/manual ownership, import selection/review and exact atomic writes. Model metadata logic and state-owner functions were preserved.

The accepted wrappers add containers or data attributes. Supervisor-approved test reconciliations preserve business assertions, normal deadlines and zero retries:

| Consumer | Earlier locator/assertion | Current equivalent |
| --- | --- | --- |
| select-controls | Legacy CSS chevron background/position on every native select | Legacy checks remain intact for legacy selects. Migrated selects require no CSS background arrow, exactly one visible decorative SVG, hidden/none hit semantics, palette-matching color/stroke, 12px size, 12-13px SVG inset, centered paint and at least 8px text clearance. Existing 44px alignment, overflow, keyboard/disabled and forced-colors assertions remain. |
| supplier-models | Control's immediate parent contains source-adoption action | Nearest existing `data-model-field` group, uniquely matched from the exact editor control and checked against its stable field key; the unique same-field source action retains every source/value/write assertion. |
| model-tail-rework | Immediate parent contains Confirm retained value | Same unique nearest-field mapping; all retained raw values, manual provenance, source IDs and exact one-write assertions remain. |
| model-workspace / provider-management | Non-exact price label also matches inherited source-choice aria-labels | Exact, uniquely matching price input; original empty/retained price, conflict/reference and no-write assertions remain. |
| successor-settings-acceptance | Calls configuredModelEdit directly from the supplier list | Explicitly enters the visible supplier-owned Model settings through existing openProviderModels, checks the selected Suppliers destination and unique `fixture` group, then retains the original configured editor and simultaneous-draft assertions. |
| GlobalDefaultModel source unit | Exact option string assumes no adapter data attribute | Regex retains canonical value, selected attribute and displayed identity while admitting the adapter's data-slot attribute. |

No product workaround or weakened oracle was introduced. The stable `data-model-field` attribute sits on the original group; it does not add a container. Existing source-choice button labels and inherited source-value implementation remain intact.

## C3: visual and interaction evidence

`compact-visual.json` passes all 12 desktop/390px/320px, English/Chinese and light/dark combinations against final compact source. Its 72 PNGs under `research/compact-visual-artifacts/` cover custom Settings, supplier list/editor, eight configured models, the long-name model editor and five selected manual import candidates with expanded batch fields. Assertions check 768px bounds, document/owner overflow, saved custom selection, actual keyboard focus, the eighth model's visible Edit trigger, modal focus, close return focus, reachable review and zero mutations.

Additional read-only screenshots pass in `stable-visual-artifacts`; pending and failed-save screenshots pass in `pending-recheck-artifacts`. The unchanged Dialog/supplier/model/canvas consumer suites cover footer reachability, native keyboard containment, pending disabled-focus handoff, Keep editing, failed save, repeated Escape, final discard and auth suspension/reconnection.

Inspected final representatives include:

- `compact-visual-artifacts/config-surfaces-B-configuration-surfaces-1440px-en-light/settings-custom.png`
- `compact-visual-artifacts/config-surfaces-B-configuration-surfaces-1440px-zh-CN-dark/supplier-list.png`
- `compact-visual-artifacts/config-surfaces-B-configuration-surfaces-320px-en-light/supplier-editor.png`
- `compact-visual-artifacts/config-surfaces-B-configuration-surfaces-390px-zh-CN-light/settings-custom.png`
- `compact-visual-artifacts/config-surfaces-B-configuration-surfaces-1440px-en-light/model-editor.png`
- `compact-visual-artifacts/config-surfaces-B-configuration-surfaces-320px-en-dark/dense-import.png`
- `pending-recheck-artifacts/config-surfaces-B-model-states-320px-en-dark-readonly-false/model-failed-save.png`
- `pending-recheck-artifacts/config-surfaces-B-model-st-680e1--zh-CN-light-readonly-false/model-pending.png`
- `stable-visual-artifacts/config-surfaces-B-model-states-320px-en-dark-readonly-true/model-readonly.png`
- `dense-import-batch-320-en-dark.png` and `dense-import-footer-320-en-dark.png`, cropped for readable inspection.

Inspection found and fixed English 320px dense-import overflow: Select visible, Apply batch and Confirm import now wrap within feature-owned bounds. Supplier headers use the existing compact identity prop to give long names more space. The regenerated matrix passes. Sections, field errors, modal actions and the dense import footer are readable; parent navigation presentation remains outside this slice.

`arrow-raster-measurements.json` supplements all 21 computed select cases with actual retained 320px English light/dark PNG measurements: painted chevron inset 14px and center difference 0px in both schemes. This is a scoped pixel receipt. Shared NativeSelect/base CSS bytes are unchanged across these receipts. Full-page modal screenshots are visual records; viewport/footer acceptance comes from browser interaction/bounds assertions, not the PNG page height.

## C4: command receipts and failures

Every logged command has its exact argv, cwd, timestamps, native exit and output in the matching `research/<name>.json` and `.log`. `final-evidence.json` assembles the receipts. Browser preview used owned strict-port `4196`; the standalone cloud owner used its unchanged strict-port `4297`. Fixtures use synthetic data and no upstream writes.

| Receipt | Native exit | Result and disposition |
| --- | ---: | --- |
| lint / final-lint / scoped-final-lint | 0 | Scoped feature and changed consumer lint; final scope clean. |
| unit | 0 | 127 existing Settings/Appearance/provider cases in 20 files. |
| scoped-final-unit | 0 | 21 changed Settings/Appearance cases in three files on final source. |
| build / final-build / wrapped-build / stable-build / compact-build | 0 | Production TypeScript/Vite builds after source changes; existing chunk-size warning remains. |
| browser-types / final-browser-types / scoped-final-browser-types | 0 | Browser TypeScript checks; final source/test scope clean. |
| browser | 1 | 116 passed, three consumer locator failures; original artifacts retained. |
| visual | 1 | 10 passed, two real 320px English dense-import overflow failures. |
| rework | 1 | Three repaired consumer cases pass; two overflow cases still fail because batch/import actions also needed wrapping. |
| overflow-diagnostic | 1 | Both remaining overflow cases reproduced; PNGs retained. |
| stable-visual | 1 | All 12 B combinations and two readonly cases pass; two new pending fixtures look for Save after its name changes to Loading. |
| pending-recheck | 0 | Both pending/failure fixtures pass after correcting only the pending action locator. |
| compact-visual | 0 | All 12 B combinations pass after compact supplier identity and wrapping changes; final PNGs retained. |
| cloud | 0 | Nine unchanged standalone cloud credential/control cases pass. |
| missing-consumers | 1 | 110 passed, four remaining harness mismatches; original artifacts retained. |
| consumers-recheck | 0 | All four affected model-tail/provider/Settings cases pass after authorized reconciliation. |
| canvas-model-consumers | 0 | 18 shared ModelDialog canvas consumer cases pass, including focus/dirty/pending/failure/auth and zero layout writes. |
| arrow-raster / raster-final | 0 | Pixel measurements pass; final measurement filename avoids collision with the runner receipt. |
| final-reconciliation | 0 | Admission diff reconstruction, current native LSP union, protected evidence and no-staged/whitespace checks pass. |

This gives passing scoped evidence for 276 distinct browser cases: 119 initial consumer identities, 114 additional consumer identities, nine cloud, 16 new Config visual/state cases and 18 canvas ModelDialog consumers. Failed commands remain failed receipts; their affected cases have separately recorded passing rechecks. This is not a claim that a complete stable-source browser gate ran here.

Two optional Python image-library probes returned `ModuleNotFoundError: No module named 'PIL'` (system Python and project venv). No package was installed; the standard-library PNG decoder produced the pixel receipt. A sips footer offset returned exit 0 without cropping; `screenshot-crops.json` records the exact standard-library replacement. These are evidence-tool diagnostics, not product acceptance failures.

## Missing-coverage census and residual boundary

- E1 remains UNVERIFIED. Its production/plain-select failures, original BLOCKED report and fixture identity remain preserved; none of the Config passes certify popup-first Escape.
- Normal B layout has the complete 12-combination matrix. Pending/error/read-only visual states have representative 320px English dark and 390px Chinese light captures, supported by the broader unchanged behavior suites. This stage does not claim every state-by-locale-by-width combination was photographed.
- Theme/gateway/default/supplier failure and permission states have passing synthetic interaction receipts. Real gateway credential service modes and the complete stable-source browser collection belong to parent integration.
- Parent AppShell/ConnectionPage and Operational styling are not included in this Config PASS. The model editor's canvas consumer checks passed without changing canvas source.
- Full frontend lint/unit, complete browser owners/credential modes, Python and wheel/package parity remain the parent's final integration gate. No publication, version bump, real configuration/credentials/services, staging, commit, push, merge or archival occurred.

Local C1-C4 implementation verification passes for the completed owned B slice. Independent Config acceptance remains a separate next step. E1 is recorded separately as UNVERIFIED.

Stage verdict: PASS

## Independent Config review

Reviewed the admission-relative 20-file delta, all 13 mapped production sites, the retained ModelDetails and adjacent CanvasModelEditor, AppShell mounting sites, accepted adapters and consumer assertions. Twelve production files changed in implementation. No production or browser test correction was needed during independent review. Raw numeric drafts, unknown/true/false/null values, source adoption/manual provenance, keep/set/clear, per-supplier response ownership, navigation and Radix close/focus/auth boundaries retain their original state owners.

The independent audit reconstructs admission from HEAD plus the inherited diff and reproduces `implementation-delta.diff` exactly. All 189 admission files outside this delta and all 16 protected Primitives evidence entries match their hashes. Both original implementation handoffs remain unchanged. HEAD is `8352e4b0818c73c5f2dee6a98345e655b85a1cba`; no files are staged.

The native LSP composition verifies 24 current files. The affected ProviderView receipt replaces the original frozen ProviderView hash; the old hash is not final proof. Both native receipts report zero diagnostics. Compiler/build receipts remain separate. Current source matches the composed scope SHA256 `8d2a164b8576ecb1509ef9b31c02525d94f85586e7f5cf817ac44d63cddfffb7`.

Browser log identities independently deduplicate to 276 executed and 276 passing cases by file/title (the owners use a single unnamed project). Eleven identities had failures, and every one has a chronologically later passing receipt. Rechecks add no duplicate cases. This comprises 119 initial consumers, 114 additional consumers, nine cloud cases, 16 Config matrix/state cases and 18 canvas consumers. The final matrix contains exactly 12 locale/scheme/width combinations and 72 PNGs; six state PNGs bring the hash-verified inventory to 78. It remains scoped evidence, not the parent's full final gate.

SVG-arrow checks preserve the retained CSS branch and strengthen single-arrow paint/inset/clearance assertions while retaining original keyboard/height/overflow/forced-colors checks. Nearest-field reconciliation requires unique exact controls and matching field keys before source actions. Exact-price labels retain all original raw-value/conflict/write assertions. The Settings successor enters the visible supplier-owned model group before its original configured-editor assertions. These are approved rendering/current-entry adaptations. No timeout, retry or business assertion was relaxed.

Inspected retained screenshots: desktop English light custom Settings; 390px Chinese light supplier editor; 320px English dark long-name model editor and dense-import footer; 390px Chinese light pending modal; 320px English dark failed-save and read-only modals. Paths are listed in `check-handoff.md`. Flat section boundaries, wrapped names/actions, visible errors and modal footers are supported. Full-page modal image height does not establish viewport geometry; the preserved browser bounds/focus/scroll assertions provide that evidence.

One chronology correction is required when consuming the assembled evidence: `final-evidence.json` caches final-reconciliation timestamps at 20:41:57, while the real `final-reconciliation.json` receipt records the later 20:45:57 execution (finish 20:45:58). argv/cwd/exit/log agree. Neither original file was overwritten. `research/check-audit.json` records the actual receipt chronology and both cached differences.

Reviewer commands from repository cwd:

- `TRELLIS_CONTEXT_ID=pi_01a111be-5788-7169-b951-a0f2417171c2 python3 ./.trellis/scripts/task.py start .trellis/tasks/10-06-shadcn-config-surfaces`: exit 0 after reading accepted dependencies; only Config activated.
- `python3 .trellis/tasks/10-06-shadcn-config-surfaces/research/check-audit.py`: first exit 1 from assuming the original native LSP receipt embeds hashes; preserved in `check-audit-initial-failure.json`. Second exit 1 discovered the cached chronology discrepancy; preserved in `check-audit-chronology-failure.json`. Corrected audit exits 0, including admission reconstruction, 27 command joins, source/protected/screenshot hashes, 276 distinct cases and later passing rechecks.
- `git diff --check` and `git diff --cached --name-only`: exit 0 inside the audit; no whitespace errors or staged files.

No missing changed-scope gate was found after reconciling current bytes and consumer coverage, so unchanged passing suites were not replayed. Parent integration still owns full frontend lint/unit, complete preview/cloud browser owners with both synthetic credential-service modes, Python and packaging. E1 stays UNVERIFIED; representative state captures do not claim the full state/locale/scheme/width product.
