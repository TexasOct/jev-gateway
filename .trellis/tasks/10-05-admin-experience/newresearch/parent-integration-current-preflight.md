# Current parent integration preflight

Status: READ-ONLY PREFLIGHT; all 33 parent requirements remain OPEN / MISSING_INDEPENDENT. This report records source and ledger review. It executes no acceptance procedure and grants no child closure, runtime admission, security signoff or release verdict. The original task remains in phase 2.2. Existing authorization for eventual completion, commit and stable 0.1.3 is unchanged; those actions are outside this invocation.

## Read capability and candidate boundary

The first tool directly read the exact `/Users/texas/Workspace/jev-gateway/.trellis/tasks/10-05-admin-experience/acceptance-plan.md`. A subsequent `ctx_execute` with `language: shell`, explicit cwd `/Users/texas/Workspace/jev-gateway`, and the supplied absolute Python executable successfully read its 38,155 bytes and produced SHA256 `fa561622c58f86ec6ce4b29257a29347b310d52ad2909083a969cd66d2a2b502`. Both proofs preceded analysis. No old workspace was recreated. The output path was absent when inspected, so this is a new file.

Full parent workflow, PRD, design, implementation plan, acceptance plan, acceptance contexts and root prompt were loaded through passive reads. Parent `acceptance.md` is absent; absence cannot establish acceptance. Whole working source bodies were read for frontend, Python backend, current backend specs, docs, README mirrors, release workflow and release scripts. A broad inventory also encountered historical `research/dialog-escape-independent-check/clean-source` documents: those are historical inputs, never the current app. Reading/hashing a body establishes byte identity; only the specific seams discussed below received focused semantic review. No claim of an exhaustive defect audit follows from the inventory.

`.git/HEAD` names `refs/heads/main`; `.git/packed-refs` resolves main to `55d71f0d74c4951ac6bad94d250bb120b8775df0`. There is no loose `.git/refs/heads/main`; an early derivation stopped at that missing file. The later packed-ref read establishes the candidate correctly. Raw index SHA256 is `84902aab7eeafab39a78f3197f9bb1b92dd745ce6d257d9b4e70102899dbae1d`.

Passive `git --no-optional-locks status --porcelain=v1 --untracked-files=normal` identified these boundaries before this report was added:

* Staged plus further working edits: parent `acceptance-contexts.md`, shared `Dialog.tsx`; added-and-further-edited `dialog-escape-rework.spec.ts`.
* Other working changes: dashboard-routing spec; parent acceptance plan/design/implementation/PRD; Models, Settings, Supplier and Canvas acceptance reports; frontend package/lock; AppShell; ModelDialog; ProviderModels; ProviderView; shared UI README; browser acceptance-model-successor, auth-workspace, model-dialog-rework, provider-presets and supplier-models specs.
* Untracked: `frontend/tests/fixtures/dialog-regression.ts`; five `10-06-shadcn-*` task directories. Their broader migration remains deferred. These paths must survive a future parent snapshot; this preflight does not stage them or decide their commit scope.

Actual working files, including staged/unstaged UI bytes, are the reviewed candidate. The index digest bounds the staged state separately. Existing built static assets were not rebuilt or treated as proof of this candidate. This is a read-time boundary, not a frozen, fully enumerated parent execution snapshot. A future snapshot must include relevant untracked files, tests, locks and source modes, retain the index, and compare before/after manifests. The report does not claim every untracked directory or dependency leaf was inspected.

## Current source seams and supersessions

`AppShell.tsx` renders Monitoring, Strategy workflow, Suppliers and Settings. Supplier-owned model management is mounted through `ProviderView.tsx` and `ProviderModels.tsx`; import preview binds `providerId`, canonical model identity, evidence version and a shared manager. `profiles.ts` handles supplier profile/icon aliases rather than determining model identity. The requested conceptual appNav/Profile/SupplierModels seams are represented by these current files; `frontend/src/app/appNav.ts` does not exist. No invented file or test name is used here.

`App.tsx` combines strategy pending/dirty state, provider navigation ownership and the shared unsaved-change registry. `useProviderManagement.ts` owns configuration revisions, queries and mutation recovery. `client.ts` owns authorization handling. `ModelDialog.tsx` retains component drafts, evidence and save/close guards; `Dialog.tsx` uses controlled Radix open state from workspace activity, focuses Content initially, and returns focus to a usable trigger/fallback while avoiding late focus theft after authentication suspension. Runtime traversal, failed-save retention and hidden focus-guard behavior require independent execution even though their child evidence is available.

`RoutingCanvas.tsx` and its model helpers own graph interaction/layout; backend `canvas_layout.py`, `provider_config.py`, `catalog.py`, `gateway.py` and credential/setup services own persistence, publication, revision and authorization. Source visibility does not prove native coordinates, stale-response ordering, rollback or reload effects. Settings credential placement and draft handling must be checked against the shared shell and auth chain, not only its component.

The acceptance plan explicitly supersedes its historical five-nav/open-models/detail-entry wording with four destinations and supplier-inline editing. Its IA1, ME1, X1 and U08 assertions about identity, fields, draft, focus and save remain. The bounded webpage Radix replacement supersedes HTML native Dialog/OS/HID implementation assertions; dirty/auth/keyboard/pending/failed-save business predicates remain. General shadcn adoption is deferred. Historical wording is retained and is not a reason to weaken any remaining procedure.

No confirmed current CODE defect is established by this invocation. Historical Canvas/Contracts findings and failed runs retain their original candidate identities and cannot be promoted to current defects without a current contradiction. Documentation coherence is still an independent DV1 obligation; stale historical task wording already carries explicit supersession and is not classified as a current product-doc defect.

## Child business evidence readback

Evidence keys below refer to actual readable files, not dispatch claims. They supply support only for the parent matrix.

* S: Settings `research/acceptance-current-business/final-business-scope-audit.md`, directly read in full. Audit b7 reports S01-S15/GS1-GS3/Settings IA3-IA5 business PASS, zero new suite executions. It retains 431-input binding/four overrides, 107 backend/test matches, native beforeunload scope, prior failures and separate process/shutdown limits. Browser unload does not establish OS-close/device/HID or finalizer shutdown.
* P: Supplier `research/acceptance-current-business/current-45row-pending-ledger.md`, directly read in full, plus its acceptance appendix. Original 45 rows report business PASS with historical/affected evidence attribution. Fresh pending-focus successor records 71 executions and original WEB2 closure. Later Models affected mapping/seven exact Supplier cases are described in current parent contexts; their underlying raw manifests were not revalidated here.
* M: Models `research/acceptance-current-business/status-404-recheck-report.md` and parent `research/models-status-404-parent-verification.md`, directly read in full. Original 38-row business PASS uses the fresh four once-passed cases plus source-bound prior evidence. The historical 32 retain 31 PASS/one expected-400 failure. Approved 404 envelope is `invalid_request_error` / `model` / `model_not_found`; B07, endpoint and original-session continuations remain distinct. Parent review records 392 source hashes/modes, 46,741 dependency files, full SQLite leaves and five distinct 25-table joins, with two denied requests and zero upstream rows. These are prior reviewed facts, not this invocation's raw reinspection. Application finalizer/browser descendants remain OPEN.
* C: Canvas `acceptance.md` was fully loaded during ledger derivation. Latest completed report closes C19 only; 24 remaining original C rows plus WF/IA are OPEN. Current parent contexts identify ca814 as owner of nine remaining groups; ownership is not delivery. The historical missing C13 harness and failed/inconclusive diagnostics remain.
* T: Contracts `acceptance.md` and current parent contexts retain 58 original rows: 15 inherited PASS/43 OPEN. One original126 bootstrap attempt failed before collection, zero original cases executed. Revision12 helper-only 48/48 and self-pytest support described by the request must remain separate from business execution; no new original admission follows. Independent a40 review and wider release helper repair are pending according to the request, without an actual final report verified here.

The private `evidence-final/test_models_behavior.py` tree is recorded absent from both candidate and historical report commit `e24bb797483bc0a25d0844c040538ed44e5d70dd` in Models acceptance. The historical 1,587-entry Canvas C13 harness remains unavailable. Exact historical assertions must be recovered or their uncovered procedures executed with new attributable evidence; absent private test bodies are not claimed read. This invocation did not open private runtime/process evidence or query any PID.

## Original 33-ID parent matrix

Every status below is OPEN / MISSING_INDEPENDENT. “Support” identifies child/source evidence, never parent PASS. Procedures retain the original acceptance-plan requirements, with only the explicit layout/Dialog supersessions above.

| ID | Current evidence and code/docs seam | Missing independent parent procedure |
| --- | --- | --- |
| IA1 | S/P/M; AppShell four-nav, ProviderView → ProviderModels; admin-experience docs | X1/X11: keyboard/click each destination, two same-brand suppliers, inline edit/import and return; audit all key-editor mounts and identity/catalog consumers. |
| IA2 | P; locale, profiles, supplier setup, docs terminology | Render EN/ZH titles/errors/help/empty/advanced paths; ordinary create/edit hides internal ID/ref; rename preserves model/strategy/default/credential references. |
| IA3 | S/P/M/C; shell, SVGs, shared styles/Dialog/canvas | X10/X12: inspect actual candidate light/dark and narrow/tall screenshots, contrast, hit geometry, CSP/icon loading and legacy select/provider regressions. |
| IA4 | S/P/M; manager/client/revision recovery; C/T open | X3-X6/X11: delayed/error/403/409/401 and committed-write/read-failure across all modules; retain drafts, one write, GET-only reconciliation, no stale overwrite or clean warning. |
| IA5 | S/P/M; unsaved registry, workspace activity, Dialog, App; C open | X2/X9/X10: combined dirty guards, pending disabled controls, both 35-direction traversals, repeated Escape/backdrop, auth suspension, removed-trigger fallback and narrow footer access. |
| GS1 | S; Settings GatewayCredentialForm and shell; credential docs | Real Settings initialize/replace and migration/read-only/cancel checks; prove no supplier/model key editor and stable saved references/files. |
| GS2 | S; write-only presence projection/client login/copy | Inspect both locales and actual safe responses: three credential roles, shared Dashboard Bearer, no prefill or fabricated admin key. |
| GS3 | S; gateway/setup/bootstrap, client handover | X4/X11: immutable listener, peer/Host/Origin/forwarded denials, current Bearer/revision, immediate old-key failure/new-key success, failed retry and pending GET ordering without PUT replay. |
| WF1 | C; RoutingCanvas and node model | X9: every supported type via right-click and explicit controls under pan/zoom/page+canvas scroll; native pointer coordinates, selected inspector and required-field errors. |
| WF2 | C; menu/gesture state, shared shell | Blank/node/edge menu bounds, outside/Escape dismiss; native hit tests with header/drawer/inspector; prove menu action does not drag/connect. |
| WF3 | C; delete commands, graph/model/layout | Node/edge/key deletion with input/textarea/contenteditable safety; synchronized edge/slot/layout removal; protected/generated objects refused with reason. |
| WF4 | C; canvas history/remount/viewport | Pan/zoom/Fit/select/delete undo+redo restores selection/config/layout; save/remount/stale gesture cannot replay old config; confirm actual irreversible changes. |
| WF5 | C; node content/inspector/JSON parser | Every type's summary/state/basic-condition-advanced grouping; bidirectional JSON/draft, malformed raw text dirty protection and located parser/graph errors. |
| WF6 | C19 support; canvas persistence/config/overlay | X6/X7/X9: name/description/dirty/save and graph/config/layout reopen; layout-only edits preserve baseline/overlay/live policy/config version; explicit validate/review/apply remains. |
| SP1 | P; setup profiles/presets/transport fields | Real ordinary/custom/cloud forms, editable defaults, account/endpoint validation and two same-brand connections; no required-field bypass. |
| SP2 | P; generated identity, provider config/catalog | X1/X7: rename keeps qualified model IDs/strategy/default/ref; advanced env/shared/param_env compatibility; safe params never written back. |
| SP3 | P/S; credential form/manager/transaction | X5/X7: keep/replace/explicit clear, blank keep, failure retention, success/cancel clearing, inherited/shared rejection; model draft/query invalidation after accepted change. |
| SP4 | P/T; connection-test types/client/gateway/discovery | Actual HTTP-to-view listing/config-only result categories; no writes/activation/generation/balance claims; public metadata carries no supplier credentials. |
| SP5 | P; DeepSeek local symbol/resource packaging | X12: exact source/output/wheel SVG/license bytes, same-origin CSP and both themes/list/picker/preview; no wordmark/remote asset. |
| MI1 | M/P; ProviderModels discovery/import preview | X1/X3: selected supplier/query target, search/visible select-all/batch counts, per-item preview edit and manual ID; multiple imports do not require individual Dialogs. |
| MI2 | M/T; discovery statuses/dedup/transaction | M2/M4: exact/partial/unknown/conflict/fetch-failed/already-imported, empty/unsupported/incomplete; duplicate skip preserves tags/priority/overlay, update remains separate. |
| MI3 | M/T; API schema, metadata projection, model fields/catalog | M1/M5/X8 full field chain: units/cache conditions/limits/capabilities/effort/all routing attrs; no structured-output→json_mode or input→combined-context inference. |
| MI4 | M/T; serving applicability/confirmation/routing | M2/M5: exact serving or evidenced alias; unknown/null versus false/zero; backend blocks incomplete import, unknown cost never free and unknown capability not inferred. |
| MI5 | M/T; durable metadata/manual merge/restore | M3/M4: source IDs/dates/confirmed_at persist after reload; refresh preserves manual; chosen restore diff only, failure/unknown preserves evidence and runtime. |
| ME1 | M/P; unified ModelDialog in supplier list/preview | X1: configured inline Edit and import preview share Dialog; inspect full field/routing sections and protected identity; no nested/basic or sectional transaction. Historical third entry superseded. |
| ME2 | M; field/source presentation and docs | M1-M5: auto/manual/unknown and tri-state controls/source dates/currency/applicability; legacy metadata omission is never online verification. |
| ME3 | M/T; validation/provider transaction/catalog | X7/X8/M3: nearby finite/nonnegative/integer/relationship/identity errors plus real backend rejection; one revision transaction, rollback preserves bytes/live refs/defaults. |
| ME4 | M; Dialog/manager saved-read recovery | X2/X3/X6: cancel zero writes, all draft/source/selection retained on failed save, successful consumer refresh and GET-only retry, native scroll/footer/focus return. |
| DV1 | Full parent/spec/docs/README bodies read; no parity verdict | G12: source requirement audit + owner/evidence map; current field ownership/migration/dependencies; exact EN/ZH heading order/levels/links/code parity and API/credential/module/CLI/install contracts. |
| DV2 | Historical scoped frontend/backend/browser counts only support | G0-G11 plus X1-X12/M1-M6 on one bound current snapshot; screenshots/steps/network/file records with candidate, commands, results and explicit gaps. |
| DV3 | Five ledgers/contexts read; C/T still open, parent absent | G12: actual independent lineage/worktrees, five complete effective reports, affected-source comparisons and same-owner/successor rechecks; separate parent33 execution. |
| OR1 | Organized suppliers/models/shared directories; Settings key form | Audit full move/extraction/import/glob/fixture/SVG/JSON/license/doc references and asset/API/identity parity; G1-G9 regressions. Genuine saved-credential reload/restart with owned application finalizer and browser-descendant evidence remains separate; closed ports alone cannot prove it. |
| RL1 | release.yml, installed smoke/validation scripts, README/install docs; current 0.1.2 | Complete children+parent before scoped commit/version0.1.3; exact workflow SHA, same wheel Ubuntu/macOS gates, four assets and byte hashes, stable/latest publication then pinned/latest isolated public installers. All unrun here. |

## Procedures for the parent runtime plan

The controlling bodies are the X1-X12, M1-M6 and G0-G12 tables in the exact acceptance plan read above. This mapping identifies execution dependencies without replacing their original wording.

1. Seal current working inputs and affected child evidence first (G0/G12). Compare historical frontend159/53/402/403 and backend results with actual source, tests, locks, fixtures and scope. Counts, inventories and stale static assets establish no complete gate. C/T completion remains a prerequisite for final parent PASS.
2. Execute X1 supplier-inline navigation/catalog identity; X2 combined draft guards; X3 delayed query/config/validation ownership; X4 rotation/old GET race; X5 credential/model draft boundary; X6 committed-write read-only recovery; X7 file ownership/rollback; X8 schema-to-routing chain; X9 native canvas gestures/history; X10 language/theme/size geometry; X11 setup/auth/empty/forbidden; X12 gateway production assets/CSP/privacy/wheel. Preserve native input and true file/HTTP observations rather than replacing them with fixtures.
3. Execute M1 exact-source import, M2 unknown/conflict/ID-only, M3 durable manual/selected restore, M4 failure/old evidence/ordering, M5 units/cache/serving constraints, M6 enabled/legacy normal-explicit-default-session-pin behavior. Join normalized source, UI, request/response, disk, reload, safe GET and route/SQLite results. Preserve approved 404 and its historical 400-oracle failure separately.
4. Plan G1 lint, G2 unit, G3 both TypeScript targets, G4 build, G5 full browser inventory with both genuine credential fixtures and zero skips/retries, G6 cross-boundary native flows, G7 full backend, G8 full Pyright, G9 final freshness/package, G10 matching-tag validation/assets/HTTP, G11 installed-wheel, G12 docs/source/lineage/preservation. Isolate writes, dependencies, runtime homes, ports and outputs; browser/pytest rebuild ordering must prevent asset races. None ran in this preflight.
5. OR1/lifecycle: record exact owned launch/birth/executable/argv/cwd/parent evidence, saved credential behavior after reload/restart, application finalizer and all owned browser descendants reaching terminal states. Do not infer finalization from SIGTERM exit or free ports. Protected PIDs 5830/45232/90027/91413 are outside ownership and were untouched. Existing helper implementations and admission decisions were not executed or broadened here.
6. RL1: source `.github/workflows/release.yml` builds release-assets, downloads the same artifact for Ubuntu/macOS smoke jobs and publishes after build+smoke. Its four payloads are installer, installer SHA256, wheel and wheel SHA256. Record actual tag/workflow/commit SHA and exact asset bytes; validate stable/latest and public pinned/latest installers afterward. Local workflow bytes are not a completed hosted run. Current contexts and version sources still say 0.1.2; no network observation of latest was made and no 0.1.3 release claim follows.

## Hash and mode receipt

These SHA256 values come from actual current file reads; all rows below have mode `0644`. The broader 680-file read inventory aggregate was `971f1b5d992e177f984b7bbc82199ea09c2fa45225338eaa361a90c2f9d5eac8` over sorted `{path,sha256,mode,bytes}` rows serialized with sorted keys and compact separators. It included historical research documents and is not a parent runtime snapshot manifest.

| Current path | SHA256 |
| --- | --- |
| Parent acceptance-plan.md | fa561622c58f86ec6ce4b29257a29347b310d52ad2909083a969cd66d2a2b502 |
| Parent acceptance-contexts.md | 26a790c54a1cbd8c1fbbcde95865ecb74399458e65ee84e873a1b9514b68ced5 |
| Parent prd.md | c5c5709efa82038fc88dd8420cf3e730f84d2b9dfa87d62826418b7a80e9292d |
| Parent design.md | 9dc048b2d4024ed7b0a727e7a14e3d233cd209fe1e8cc4c94eba6884f1a4789e |
| Parent implement.md | 3104bebeabc167fc0788e5a02643331ce271903db8606ce88ee23d4813a5cdbb |
| frontend/src/app/AppShell.tsx | 9a5ce4e22779d1b8430b8b44030dfb4ef3a9a61ee24eed2054318c733cb23372 |
| frontend/src/shared/ui/Dialog.tsx | 63fd7e5eefe018a02712121cf1f21633dc46c0d83e90cbbfa4b15a360f55b592 |
| frontend/src/features/providers/models/ModelDialog.tsx | c3eadbf89f38b41a2267bc392a82c2e70eddbcfc1b5564a0aeb0ce0a988fabf1 |
| frontend/src/features/providers/shared/useProviderManagement.ts | da92940c66967826e588d801b8dae3fe3be2807edf7829f415fc8f67b1c88b57 |
| frontend/src/features/settings/GatewayCredentialForm.tsx | 1c8e6a16f084ae3cfe4e832e56b9b473e3865e8f88dab614ac2bf31a28463996 |
| frontend/src/features/routing/RoutingCanvas.tsx | c0726b0625078945bcbe041f78c0cfc462801995a314449b6ac3bf6a5907e156 |
| frontend/src/shared/api/client.ts | b139028e07991e2c60f9849526c1ab7682f48c099df95325cc776de8fbf9f8d4 |
| jev_gateway/gateway.py | e7b136274fb67b3ed47158027159ea59256b9d89f5a3be2e2c4fb8689ab71da6 |
| jev_gateway/provider_config.py | b80a742099c8859c4dc008ba67dbfdaa45cafd598393d7a7c032aef517c8bbc1 |
| jev_gateway/catalog.py | 37c64f54980ba49981f8f933825abec08e24dfa74cbc86abafb3454d29772510 |
| jev_gateway/credentials.py | bffb0b9c0bda9611a351cf9940fc49365fe9fbf37d9b57d9258c731f9500465a |
| README.md | ab9ac1b7dcd17325344471b86dbcbf70f3d4ab16f7551d72771542ff5f1cd19f |
| README.zh-CN.md | fda4a06f64a4acabcb441dbf4d909042cea24a0817744fa333801c544ccb8734 |
| docs/local-install.md | 1033429b01169434da05abb3103880f950f70761d227ff7ca86602cc681c5e0e |
| frontend/src/shared/ui/README.md | 786b0ccccb24fd162e19151cd4f4b14d6c442171f82ced572ed65df61471b126 |
| .github/workflows/release.yml | a62753259c11125a4d74f233de62511a4281edd1e49177d4d639040ac1eb3fef |
| scripts/validate-release.py | ccc3bfd4b421bf1c123291d4894936d3e6a7625b290a5e700099a621d0b48d44 |
| scripts/smoke-installed-release.py | 538dfe989962325eb158ce7f04e690ef34257f27c6c5d43116728d4c613760c6 |

Tool limits: shell execution/read capability succeeded at the new cwd; automatic Python/Bun runtimes were not used. Missing loose main ref was resolved by passive packed-ref reading. No tests, collection, application imports, builds, browser, network, process queries, signals, helper launch, admission, approval, staging, commit or release occurred. Raw child runtime/image/dependency/SQLite claims remain attributed to their existing reviewers. This report prepares the parent's separate runtime plan; it does not supply its execution evidence.
