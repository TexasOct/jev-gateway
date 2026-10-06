# Supplier connections independent acceptance

Verdict: **REWORK** for candidate `f22fff0ef581feeb642e4298be1df1ccc95bac61`. Five product findings remain. The existing browser migration also has unresolved failures. This report does not grant final supplier or parent integration PASS.

## Context and frozen candidate

The predecessor was independent planning context `ad6e3d83-1972-478`. Its harness context was removed. This successor is `trellis-check`, invocation/worktree identifier `7627206f-3af3-43f-fdd03e07`, in an isolated worktree. The dispatch exposes that identifier; a separate session UUID is not exposed. This successor read the predecessor's `acceptance-plan.md` and the parent's `acceptance-contexts.md`. It inherited no implementation conversation.

The source contract is all 198 lines of root `prompt.md`, parent PRD/design/implementation plan, child PRD/design/implementation plan, both task manifests, child acceptance plan and the curated backend specifications. The humanizer skill was applied to this report's prose. Source requirements take precedence over the old credential spec's failed-save clearing instruction and old browser assertions for visible IDs, preselected environment references and the DeepSeek wordmark.

HEAD was explicitly checked out at the candidate above. Product tracked diff stayed empty. Writes are confined to this acceptance report and `research/successor-7627206f/`. No product code, shared test, other child artifact, task lifecycle, commit, publication or operator runtime was changed. Dependencies and generated static files belong to this isolated checkout. Ports were 44201 for full App fixtures, 44202 for the focused native fixture and 44203 for an isolated actual gateway. Own services stopped after execution.

All credential data is synthetic. Screenshots contain password glyphs or blank inputs. No real provider, decision evaluation, generation or billing request was sent. Read-only provenance requests fetched the two pinned public asset/license URLs.

## Product findings

| ID | Requirements | Actual reproduction and result | Owner |
| --- | --- | --- | --- |
| R1 | SP1, SP2, SP3 | Create ordinary OpenAI with a synthetic key; delete it; create OpenAI again without entering a new key. The actual App submits `id=openai`, `api_key_env=JEV_OPENAI_API_KEY`, `credential.action=keep` both on the reused reference and a blank new credential. A separate actual API/runtime sequence confirms deletion retains the private store, recreate accepts KEEP, safe presence becomes true, and the activated provider resolves the retired credential. Ordinary creation silently inherits the previous connection's credential. | Suppliers, with Contracts for allocation semantics |
| R2 | SP4, IA4 | Return Dashboard HTTP401 from `/v1/provider-connection-test`. The actual App shows a local supplier error while `.app-shell` remains visible. `useSupplierConnection` stores the status without invoking root unauthorized handling. This differs from validation401, which hides the shell, reconnects and retains the supplier draft in memory in the acceptance test. | Pending async owner `ba32d175` / integration |
| R3 | SP4, IA4, IA5 | Start a configuration refresh and hold its response; start an independent connection probe; release the configuration GET as HTTP401. Root reauthentication hides the workspace. The probe's actual fetch AbortSignal receives zero abort events (expected one). ProviderView's supplier-owned probe is independent of manager query cancellation and receives no workspace activity change. | Pending async owner `ba32d175` / integration |
| R4 | IA5 | Edit an existing display name, then restore its exact original text. Click Settings and reject discard. One discard dialog appears (expected zero). `dirty` is latched true by changes instead of being compared with original values. | Suppliers |
| R5 | IA5 | Open the existing connection from Edit and cancel without modifications. Focus lands on Add provider; the original connection's Edit button is inactive. `discard` always queries `[data-provider-add]`. | Suppliers |

R1 is established by both UI payload and real backend store/activation evidence, rather than inferred from the allocator. The allocator only checks current catalog IDs and currently bound references; retained orphan store entries are absent from that list. The intentional orphan-store retention need not be removed. New ordinary authenticated creation must require deliberate credential input and use an identity/reference allocation that cannot silently acquire an orphan credential. Existing KEEP, explicit advanced references and no-auth local modes must retain their documented behavior.

R2/R3 were disclosed as pending implementation in the dispatch; their fixes are absent from this candidate. No later developer delta was applied, and no subsequent snapshot has been rechecked.

The observational R1 tests pass because they assert and demonstrate the reuse sequence. That test result is evidence of the forbidden behavior, not a requirement PASS. R2-R5 remain failing acceptance assertions.

## Executed evidence

All paths below are relative to `research/successor-7627206f/`.

| Execution | Result | Boundary and evidence |
| --- | --- | --- |
| Candidate frontend build | exit 0 | `build.log`; own generated static bundle |
| Main browser TypeScript project | exit 0 | `browser-types.log`; actual shared types are present |
| Native cloud browser TypeScript project | exit 0 | `cloud-types.log`; actual ProviderView/manager/contracts |
| Lint | exit 0, four warnings, zero errors | `lint.log`; existing refresh-export warnings |
| Frontend unit suite | 359 passed in 46 files | `unit.log`; supporting source-contract evidence |
| Supplier/transport/discovery backend group | 207 passed | `backend.log`; actual temporary files, revisions, shared-binding denials, rollback and safe projections |
| Admin contract backend group | 33 passed | `contracts.log`; actual HTTP authorization, connection scope and safe status handling |
| Full backend suite | 1,246 passed | `full-pytest.log`; completed background rerun after a foreground command limit interrupted the first run |
| Pyright | zero errors/warnings/information | `pyright.log` |
| Focused native cloud fixture | 9 passed | `cloud-results.json`, `cloud-run.log`; actual ProviderView and manager, synthetic HTTP fixture; not server persistence evidence |
| Acceptance-owned required cloud CLEAR/masking fixture | 6 passed | `cloud-extra-results.json`, `cloud-extra-run.log`; required AWS secret and Vertex clear, inherited/absent response feedback, Chromium masking |
| Acceptance-owned actual App suite | 22 passed, 4 failed | `acceptance-results.json`, `acceptance-run.log`, `acceptance.spec.ts`; four failures are R2-R5; R1 is an observational reproduction |
| Acceptance-owned live-registry preset sweep | 42 passed | `preset-results.json`, `presets-run.log`; presets/types came from actual configuration GET in `safe-configuration.json`; ordinary fields, native-null defaults and cancellation |
| Existing full-app supplier/preset/icon/select group | 22 passed, 61 failed, zero skipped | `fullapp-results.json`, `fullapp-run.log`; unmodified old tests executed with 44201 origin; migration remains required |
| Acceptance-owned actual API/runtime probes | 5 passed | `runtime-acceptance.log`, `test_runtime_acceptance.py`; orphan activation, SDK-default detachment, required transport CLEAR, Vertex JSON/file-path projection and rename preservation |
| Actual gateway browser/CSP | completed | `gateway-browser.json`, `gateway-browser.log`, `gateway-browser.mjs`; actual HTTP server, actual App and emitted image |
| Bundle freshness | exit 0 | `freshness.log` |
| Wheel build/parity | exit 0, emitted SVG equals source | `package.log`, `wheel-parity.json`; locally built wheel, no publication |
| Pinned asset provenance | both downloaded hashes match | `provenance.json`, `deepseek-original.txt`, `lobe-license.txt` |

The old browser suite is a failed integration gate. Several tests still navigate to `Provider & models`, expect visible instance/reference fields or assert old setup and icon ownership. The report preserves all 61 failures. They are not automatically 61 product defects, and this successor did not migrate their assertions. The dispatch assigns that work to `admin-browser-final925784`; no completed fixture hash was supplied or applied here.

## SP1-SP5 and IA2-IA5 audit

| Requirement | Executed scope | Verdict at this snapshot |
| --- | --- | --- |
| SP1 | All 42 presets open before their fields and cancel without writes. Native cloud direct JSON/AWS pair/default modes, blank Vertex project, required pair blocking, redacted account retention, complete replacement semantics, repeated instances/reserved references and retries were exercised by the 9 native cases and acceptance cases. | REWORK: R1. All detailed P01-P08 subcases still require final migration/recheck; a successful preset-open sweep does not establish every saved onboarding mode. |
| SP2 | Native fixture exercises stable transport references, two Bedrock connections and reserved gateway/decision references. Actual API rename preserves provider/key identity, model IDs, strategies and global default, with unchanged dotenv bytes. New ordinary IDs are hidden. | REWORK: R1 violates fresh connection credential independence. Full decision/default/overlay and legacy compatibility UI matrix remains mandatory. |
| SP3 | Primary 500/409/403 failures retain name and secret and permit user retry. Validation401 reconnect preserves supplier drafts in memory. Native validation/write failures retain all cloud fields/actions. Required AWS secret and Vertex CLEAR save; absent/inherited safe booleans are rendered. Real backend tests cover exact binding sharing, later consumers, JSON/dotenv clearing and rollback. | Evidence supports these cases; final PASS withheld with R1 and remaining network-uncertain/catalog-read/sharing/browser branches. |
| SP4 | Each HTTP200 semantic status renders as a semantic result. Dashboard HTTP400/403 render safe Dashboard errors. Decision testing makes no listing request and states no remote availability was verified. Backend authorization/scope/no-write/network tests ran. | REWORK: R2 and R3. Full stale-result/reconnect/target-change matrix remains mandatory after lifecycle fix. |
| SP5 | Actual gateway loads symbol-only DeepSeek in light/dark. Source/emitted/wheel bytes match. Pinned official DeepSeek original hash and Lobe MIT license hash match live downloads. No recorded CSP violation; image naturalWidth=56. | Specific symbol/provenance/CSP requirement evidenced. Extended A02/A04 picker/failure/unknown-value browser branches remain pending the failed old fixture migration; no whole-task PASS. |
| IA2 | Actual App ordinary Chinese form and cloud Chinese form use 供应商, hide internal fields, and retain legitimate protocol/code names. Live registry contains 41 LLM plus one decision template. | No defect found in inspected branches; complete rendered L01 status/error/advanced branch sweep remains mandatory. |
| IA3 | Actual App at 320/1440, Chinese ordinary fields in both schemes; actual App Vertex at 320 in English/Chinese and both schemes; normal input/select controls meet >=44px height and no document overflow. Screenshots opened and inspected. | Covered geometry acceptable. Full widths, arrow offsets, adjacent <=1px alignment and contrast measurements remain unverified. |
| IA4 | Pending state, retry after 500/409/403, safe semantic errors, required CLEAR, native partial setup and actual auth recovery were exercised. | REWORK: R2/R3. Catalog-read-after-commit and uncertain-write recovery remain pending. |
| IA5 | Native keyboard input, Escape/dirty rejection and pending departure cases pass. Restoring original values and existing cancel focus were independently checked in actual App. | REWORK: R4/R5; pending departure is blocked, but workspace inactivation does not cancel probe (R3). Full leave-path matrix remains required. |

The full scope remains the predecessor acceptance matrix P01-P08, I01-I05, C01-C10, T01-T10, L01, A01-A05 and U01-U06. Coverage above is an execution record, not a claim that every subcase in that matrix passed. In particular the failed legacy fixture migration prevents completed browser evidence for icon fallback/recovery, every preset's saved configuration and the complete advanced/reference/locale branches. Those requirements remain open and cannot be reduced to optional enhancements.

## Cloud and privacy limits

SDK-default Bedrock detachment was tested with an actual credential store retaining old values. After explicit `param_env={}`, old credentials do not appear in runtime resolved parameters; safe transport presence is empty. No orphan value wins merely because it remains stored. This is different from R1's ordinary primary-reference reuse.

Actual API CLEAR for required AWS secret and Vertex credential accepts the intentional unconfigured binding, returns false presence and leaves empty resolved values. The native UI sends CLEAR without value and shows the provided presence after reopening. Inherited presence fixture cases demonstrate rendering only; actual inherited resolution/removal is supported by the executed transport/backend tests. The API pair requirement is not substituted for explicit user CLEAR.

Vertex JSON and a real temporary service-account JSON file path both reach the catalog's resolved transport projection exactly. Model-list connection testing returns unsupported and leaves files unchanged. These checks establish transport projection and probe semantics, not valid cloud authentication or native SDK generation. No such generation was attempted.

Chromium password inputs and Vertex textarea masking were inspected. The textarea uses `-webkit-text-security: disc` and is visibly masked in actual App screenshots. Firefox or another browser that does not support this CSS property was not executed; cross-browser masking is unverified. Storage checks inspect local/session storage and preserve only locale. Complete screenshot/log/URL/public-response privacy auditing remains part of final recheck.

The focused cloud fixture mounts LocaleProvider without the App's theme owner. Its named dark screenshot stays light, so its scheme label is not dark-theme evidence. The separate actual App Vertex screenshots provide real dark/light evidence and are the ones used for theme review.

## Inspected screenshots

Opened and visually checked: actual gateway `real-gateway-deepseek-light.png` and `real-gateway-deepseek-dark.png`; actual App ordinary Chinese `acceptance-output/acceptance-geometry-and-masked-screenshot-light-320/supplier-light-320-zh.png` and corresponding dark desktop image; actual App cloud `acceptance-output/acceptance-actual-App-Vertex-native-mask-dark-zh-CN-320/actual-app-vertex-dark-zh-CN-320.png`; focused masked cloud light/dark images (theme limitation above).

DeepSeek is a whale glyph without a wordmark, with surrounding supplier text separate. Actual App cloud fields/actions fit the 320px page and the JSON value appears as dots. The real gateway screenshots were recaptured after the theme transition settled; the first immediate dark capture was transient and is not used for a contrast claim. Generated screenshots not explicitly listed as opened remain supporting artifacts only.

## Recheck contract

Return R1/R4/R5 to Suppliers and R2/R3 to the pending async/integration owner. Keep the existing failing assertions. Recheck this successor on a new frozen integration hash containing the completed supplier and browser deltas, record those hashes, and rerun the five findings plus their credential/navigation/probe boundaries. Complete the remaining detailed acceptance matrix and all applicable browser gates. Developer checks may support that work, but cannot replace this acceptance verdict.

No later integration delta has been received. Final supplier PASS is withheld until all supplier requirements and the required integration/browser evidence are complete.

## Independent successor 3b1586a7, first confirmed rework

This dedicated successor continues planning context `ad6e3d83-1972-478` and removed execution context `7627206f-3af3-43f`. The verified isolated checkout is `/private/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/pi-agent-3b1586a7-8c7b-4ba-b662c256`, detached at `723d4adad797955fee28f3beaedaadefe04a4e2f`. The original plan, complete report, source request and historical evidence remain intact. Product source and shared tests are read-only. New evidence is under `research/successor-3b1586a7/`; `source-sha256.json` records every tracked file at admission.

Current verdict is REWORK. Ordinary unauthenticated Ollama and LM Studio creation declares a fresh `api_key_env` while submitting KEEP without a value. The native ordinary-onboarding cases save through the actual gateway, then call its real listing-probe endpoint. Both receive `credential_unconfigured` with zero controlled-upstream calls. A no-key local connection therefore remains pending after the permitted ordinary Save. `ProviderView` allocates this reference for every non-cloud template, including the local no-auth templates; `gateway.py` also rejects unresolved declared keys before its generation adapter. No generation request was made.

| Finding | Source requirement | Actual evidence | Owner |
| --- | --- | --- | --- |
| S1 | P08, SP1, SP3: local no-auth onboarding must complete without a fictitious required key | `native-complete-live-results.json`: 45 passed, 2 failed, zero skips/retries. The two failed `P01-P08 native ordinary onboarding` cases are Ollama and LM Studio. Each per-test `onboarding.json` records its saved generated reference, false presence, `incomplete` probe with `credential_unconfigured`, and zero upstream calls. | Suppliers |

The other 40 ordinary native preset onboarding cases passed, including System One's explicit evaluation endpoint and null model, native-null Anthropic/Gemini, account-scoped Azure/Cloudflare and platform-default Vertex/Bedrock. All 42 presets also passed real validate/apply/reload transactions. Protected orphan recreate passed through the actual browser and credential store: blank ordinary creation is blocked, the new reference differs, and the old stored value remains protected. The unchanged original independent harness passed 25 cases and failed its obsolete observation that recreated authenticated connections permit blank KEEP on the retired reference. That assertion conflicts with R1's corrected source requirement and remains unchanged in the historical harness.

The original acceptance matrix remains mandatory. Further native interaction, failure recovery, case-level audit and the final combined directory/backend recheck are still in progress; this entry does not claim partial PASS for the child task.

### Successor concrete race and recovery findings on 723d4ad

The completed C09/T08 reproduction and source paths are in `research/successor-3b1586a7/confirmed-findings-723d.md`. Its exact order is: initial configuration `r1`; native Refresh starts a held GET while the form is clean; native Test connection starts one held POST; GET 200 installs `external-credential-revision`; the old probe returns HTTP 200/success/model_listing/3; abort count remains zero and one stale success is visible. `focused-supplement-results.json` preserves that product failure and the corrected passing P06 case. The original raw Vertex timeout waited for the wrong label, “Google Cloud location”; the actual source and native label is “Vertex region”. That failed run remains intact and has not been used to waive P06.

The installed-wheel real gateway also demonstrates C06's uncertain-write recovery gap: an actual successful PUT response is dropped, the stored credential and name change, the UI retains its draft, and another Save posts validation before any configuration GET. The real API rejects the stale revision with 409 and prevents a second PUT. This is S3, a read-first recovery defect with a functioning backend revision guard. S1 remains the real Ollama/LM Studio no-key onboarding defect. The selected dark LLM-kind control measures 4.498160160246434:1, slightly below U06's 4.5 target; its exact settled measurement and both failures remain recorded as O1.

Parent supplied final candidate `9a476c601979260415f6afe70490c03749b4c24e` for recheck in this same independent context. Its organized source paths are `frontend/src/features/providers/suppliers/{ProviderView.tsx,useSupplierConnection.ts}` and `frontend/src/features/providers/shared/useProviderManagement.ts`. No final-candidate closure or PASS is claimed by these 723d findings.

### Complete original-row register for 723d4ad

This register records every original row before moving to the parent-supplied final candidate. PASS below is a result for the stated 723d evidence, not final integration acceptance. Final-source affected rows must be rechecked. The historical AWS blank-replacement failure is retained and carried into the final cloud/native matrix; one passing replay cannot close an intermittent failure.

Evidence paths are relative to `research/successor-3b1586a7/`. B136 is the unchanged current supplier/browser suite run `attempt2-fullapp-results.json` (102 passed, 34 failed); O26 is the unchanged original independent harness `attempt2-original-results.json` (25 passed, one obsolete assertion failed). N42 is `native-complete-live-results.json` (40 ordinary presets passed; Ollama/LM Studio failed; five real-gateway boundary cases passed). A224 is `backend.log`, the original 224 backend/runtime checks; A27 is `independent-asgi-attempt2.xml`, the 27 added actual ASGI/file checks. N43 is `second-supplement-results.json` (41 passed, one real race failed, one wrong-label trigger failed). F2 is `focused-supplement-results.json` (corrected P06 passed; late old-revision result failed). R42 is `registry-final-supplement-results.json` and its `registry-cancel-search.json` records (all 42 presets opened, every exposed alias checked and cancelled in each language; two complete sweeps passed). X6 is `transport-complete-supplement-results.json` (six transport/account cases passed). G3 is `final-live-live-results.json` (two real concurrent-connection cases passed; uncertain-commit case failed). C9 is the standalone cloud nine-case result and log. `legacy-failure-classification.json` lists every B136 failure with its original source location, source requirement and replacement evidence.

| Row | 723d result | Concrete evidence and limit |
| --- | --- | --- |
| P01 | PASS | R42 starts from empty LLM/decision lists with hidden identity fields; N42 fills ordinary fields and saves through the real gateway; `actual-empty-attempt2.xml` admits the first LLM and decision from an actual empty directory without creating models. |
| P02 | PASS except P08/S1 | R42 opens and cancels all 42 actual presets with zero validations/writes. N42 and `registry-transactions.json` validate/apply/reload all transports, account fields and native/explicit endpoints; metadata is absent from operations. Local no-auth failures are separately retained under P08. |
| P03 | PASS | R42 checks every exposed actual display name/alias in both languages and recovers from no matches. N42 records each regional preset's exact saved endpoint/type, preserving distinct regional and subscription addresses. |
| P04 | PASS | N42 covers native-null versus explicit endpoints. X6 changes Azure/Vertex/Bedrock to OpenAI, selects a custom endpoint through the native default-endpoint control, supplies the required key, and proves old new-template params/bindings are removed. B136 icon cases prove icon selection does not select transport. |
| P05 | PASS | N42 blocks missing/whitespace required account fields and native-default bypass, then saves Azure/Cloudflare through the real API. X6 blocks blank/whitespace endpoints for Azure, Cloudflare and LM Studio, including Test connection. |
| P06 | PASS for exercised modes; final recheck required | N42/A224 cover platform account setup and actual managed cloud transactions. B136/C9/O26 cover direct, clear, inherited, shared and failed cloud paths. F2 proves canonical submission and exact raw restoration with the real native **Vertex region** label. The wrong-label failure remains retained. Historical AWS blank behavior remains open under C01. |
| P07 | PASS for exercised modes; C01 carried | N42 preserves platform IAM/account semantics; B136/C9/A224 exercise direct access/secret/token, incomplete pairs, SET/KEEP/CLEAR and shared transport protection. The recovered access-key SET-on-blank failure requires the final dedicated native/file check; it is not waived. |
| P08 | REWORK S1 | Both real ordinary local no-key saves declare generated unresolved references and receive `credential_unconfigured` on actual probes, with zero upstream calls. Authenticated local creation and private-network policy remain separately exercised. |
| I01 | PASS | G3 creates two concurrent named LLM connections and two concurrent named decision connections, checks distinct IDs/references and each actual stored value without reporting values. N42 independently saves all presets. Real orphan recreate protects the retired key. |
| I02 | PASS | A27 uses nonempty tagged/priority overlay, explicit strategy membership/default and actual reload; exact overlay/env bytes and active model identities stay unchanged. Real rename invariants add primary-store preservation. |
| I03 | PASS | A27 preserves decision.default_provider and a decision strategy through rename. G3 creates two concurrent decision connections with null model and distinct keys. No evaluation/generation request occurs. |
| I04 | PASS | B136 unknown/custom identity and prototype-named icons round-trip; ordinary edits omit redacted maps. A224/A27 cover JSON/dotenv/captured-process values and stable old IDs; actual rename leaves credentials intact. |
| I05 | PASS | R42 opens native Advanced controls without writing. B136/O26 cover explicit existing/shared references and cancellation; A27 proves real shared-reference rejection. Identity/type/protocol are unaffected by icon selection. |
| C01 | RECHECK historical cloud race | Actual primary LLM/decision KEEP rename preserves store/dotenv bytes. B136/C9 AWS blank KEEP passes are support, while the recovered f79 SET-on-blank failure remains open. Final native cloud/file cases must check this exact path and preserve each recurrence. |
| C02 | PASS | N42/G3 use real primary SET and actual write-only storage; B136/O26/C9 exercise pending repeated submit/Enter and successful input clearing for primary and transport keys. Operation counts prove one transaction per submission. |
| C03 | PASS | A27's 12 real primary cases cover both kinds, JSON-only/dotenv-only/both, duplicate dotenv assignments and captured inheritance; unrelated values and overlay remain. A224/B136/C9 cover transport local clear and inherited presence. Confirmation cancellation writes nothing. |
| C04 | PASS | A27 rejects actual SET/CLEAR shared by another LLM, decision, gateway, own param_env and a later same-transaction consumer; files/live catalog stay unchanged. B136/C9 retain drafts/recovery; real orphan recreate uses a separate key without overwriting the retired protected value. |
| C05 | PASS | N43's 12 kind/stage/status cases preserve name, endpoint, action and secret after primary validation/write 400/500/network failures. F2 adds raw multiline cloud JSON restoration; B136/C9 cover other transport drafts. Validation failures send no PUT. |
| C06 | REWORK S3 | B136/O26 preserve 409/400/500 drafts and explicit refresh/retry. A27 injects real persistence/activation failures and restores baseline files/live catalog. G3 drops an actual committed response; manual Save validates before reading, violating read-first recovery. Backend 409 prevents duplicate PUT. |
| C07 | PASS | B136/O26/C9 exercise read-only/403 and global 401 reauthentication, including retained primary/cloud drafts and existing Edit focus. A224/A27 preserve actual management authorization and unconfigured-key boundaries. Secrets are not placed in browser storage for recovery. |
| C08 | PASS | B136 and N43 distinguish committed write plus catalog-read failure, clear successful secrets and recover with GET only. N43 navigates through Models/Settings and returns to the retained supplier-owned recovery without another PUT. |
| C09 | REWORK S2 | Metadata/discovery cancellation and dirty-model navigation pass in B136. F2 shows the independent supplier probe survives a changed opaque revision and renders its late success. |
| C10 | PASS | Native successful/cancel/failure paths inspect storage and masked input. `pageleave-complete-supplement-results.json` proves native beforeunload rejection retains drafts and accepted reload clears sensitive memory without writes. Opened screenshots show no raw secret; actual API/probe errors are safe. |
| T01 | PASS | Real loopback cases send candidate SET auth to the exact model-list endpoint, saved-primary auth works, and KEEP/CLEAR are covered by A224/O26. Snapshot/revision comparisons prove no save/import/activation. The UI limits its claim to model listing. |
| T02 | PASS | Controlled upstream 401/403 produce authentication_error; management 401/403 follows global/permission recovery in B136/O26/A224. Private upstream details and credentials are absent from returned errors. |
| T03 | PASS | Actual 404 and private-target refusal, A224 malformed/scheme/forbidden-target/account validation, and X6 missing-endpoint states distinguish address/configuration problems and no-probe cases. |
| T04 | PASS | Controlled upstream connection refusal, truncated/reset response, 429 and 500 are recorded in loopback evidence. A224 exercises DNS/TLS/timeout/network failures and certificate-verification contracts without disabling TLS or inferring bad credentials. |
| T05 | PASS | Actual empty list succeeds with count zero; truncated response is incomplete; A224 covers pagination/bounds and unsupported transport. Cloud/decision untested availability is not reported as success. |
| T06 | PASS | G3/N42 preserve complete System One URLs and null optional models; B136/O26 show configuration-only/unsupported explanations. Actual controlled upstream records no POST/evaluation/generation calls. |
| T07 | PASS | Actual opt-in/private refusal and redirect refusal use the real listing boundary; A224 covers validated-IP DNS rebinding, dangerous targets, verified TLS and 20-second/20-page/1000-model/4-MiB limits. No key is added to a query string. |
| T08 | REWORK S2 | Native pending/draft/navigation guards and duplicate-test control pass in B136/O26. The held-read-before-probe race is demonstrated by F2: new revision first, old probe success afterward, zero aborts and one stale result. |
| T09 | PASS | Real loopback diagnostics and A27 compare existence/bytes of models, credentials, dotenv, overlay, theme and layout, plus active catalog and revision. R42/ordinary image/search/cancel actions produce no write. Browser write counts are supplemental. |
| T10 | PASS | Real/ASGI wrong or absent management authorization, unconfigured key and unresolved recovery journal return safe refusals before any listing call; watched files and healthy active catalog stay intact. |
| L01 | PASS | N43 renders all six Chinese probe statuses and advanced terms; B136/O26 cover Chinese titles/navigation/create/edit/readonly/errors/cloud fields and accessible names. Necessary protocol/code/URL identifiers remain as identifiers, with product terms translated. |
| A01 | PASS | `asset-source-checks.json` verifies all 39 SVG hashes/safety, pinned official DeepSeek original and Lobe license hashes. The symbol extraction is explicit and retains official repository attribution plus Lobe MIT notice. |
| A02 | PASS | B136/O26 and opened 320px Chinese icon/Vertex images plus real-gateway light/dark list screenshots show a symbol without wordmark. Image natural width, same-origin loading, bounds and both-language/theme layouts are checked. |
| A03 | PASS | Actual gateway CSP is read; emitted DeepSeek bytes equal source; wheel and installed static assets equal source. `gateway-symbol.json`, `wheel-parity.json`, `installed-asset-parity.json` retain URLs/hashes and zero CSP violations. |
| A04 | PASS | B136 exercises failed-image fallback/recovery, unknown/prototype icon names, explicit generic and automatic reset; payloads preserve non-icon identity/transport/protocol/credential fields. |
| A05 | PASS | R42/B136 record search/selection/cancel with no unsaved write and accessible attribution. Pinned sources/licenses are fetched and independently hash-checked. |
| U01 | PASS | B136/O26 cover delayed reads, read failure/recovery, empty kinds, no search matches and safe Settings entry; R42 repeats empty-kind native entry. Supplier editors contain no gateway-key input. |
| U02 | PASS except S2 | B136/N43/O26 cover validation/write/probe pending feedback, repeated activation/Enter and operation-owned errors. Committed-refresh navigation and GET-only retry pass. Revision invalidation of supplier pending state fails S2. |
| U03 | PASS | Actual authorization/configured-key barriers are exercised by A224/A27/loopback; browser readonly/401/403 paths explain recovery and global reauthentication. No bypass write/query occurs. |
| U04 | PASS | B136/O26 cover native keyboard/icon Escape/Enter/Space; N43's 16 geometry cases prove Tab focus, visible focus, native control actionability and cancellation focus returning to the existing Edit trigger. Old Add-focus assertions remain failed/obsolete. |
| U05 | PASS native functional paths; final themed sweep required | N43 checks rejection/acceptance for Cancel, Escape, kind, Models and Settings. Native pageleave completion proves actual beforeunload dialogs and memory clearing. Restored clean drafts do not prompt; model/provider guards remain aggregated. Final-source themed paths still require their prescribed recheck. |
| U06 | REWORK O1 | N43 records 320/390/768/1440, both languages/themes, ≥44px controls, ≥32px select padding, visible focus, no overflow and elementFromPoint actionability. Cloud/advanced/failure screenshots were opened. Settled selected dark-kind text is 4.498160160246434:1, below the 4.5 target; those two failures remain. |

SP1 is REWORK (P08/S1); SP2 passed the exercised identity/reference boundaries; SP3 is REWORK (C01 carried historical cloud failure and C06/S3); SP4 is REWORK (C09/T08/S2); SP5 passed source/browser/gateway/package evidence. IA2 passed the rendered terminology checks. IA3 is REWORK (U06/O1). IA4 is REWORK (S2/S3). IA5's native functional guards passed, with its final-source themed sweep still required. The task verdict remains REWORK.

The untouched current browser failures are fully retained and individually classified: 15 obsolete Add-focus expectations, 9 obsolete literal/reallocated reference expectations, and 10 obsolete blank authenticated-create expectations. Classification is against the original source requirement and is backed by independent native/API replacement cases; it does not erase a failure or change a shared/frozen assertion. The unchanged original harness's one recreated-orphan blank-KEEP assertion likewise conflicts with corrected R1 admission. Its other 25 cases passed.

Quality on 723d: 224 original backend/runtime checks passed; 27 added actual ASGI checks and the corrected empty-directory case passed; frontend 366 tests in 47 files passed; build succeeded; lint had no errors and four existing fast-refresh warnings; Pyright and browser/cloud TypeScript checks had zero diagnostics; wheel/sdist build and installed static parity passed. `723d-integrity.json` proves every initially tracked product/shared-test file is unchanged, the original report is an exact byte prefix, and only this report was appended. All initial environment/module/label/fixture/interrupted-run failures remain in their original logs and result files.

## Independent final-candidate recheck — 3b1586a7 on 9a476c6

Verdict: **REWORK**. The same independent context rechecked candidate `9a476c601979260415f6afe70490c03749b4c24e`. The complete original 45-row final register, evidence keys, concrete findings and limitations are in [final-candidate-matrix.md](research/successor-3b1586a7/final-candidate-matrix.md). The original plan, historical verdicts, frozen assertions and preceding snapshot evidence retain their identities.

Five supplier findings remain:

- **S1 / P08:** Ollama and LM Studio ordinary no-key saves still declare generated unresolved key references. This final candidate's probe returns `unsupported`, not the earlier `credential_unconfigured` result. Actual saved configuration plus the generation guard at `jev_gateway/gateway.py:1512` establish the remaining unusable no-key boundary without making a generation request.
- **S2 / C09/T08:** the precise pending configuration-read/probe overlap again loads a new opaque revision, performs zero aborts and displays late old-revision success.
- **S3 / C06:** an installed-wheel PUT really commits and its response is dropped; manual Save next starts POST validation before any GET. Backend 409 protects against a second PUT but does not meet read-first recovery.
- **S4 / C01/SP3:** the historical AWS SET-on-blank defect now recurs through the actual installed-wheel transaction. English all-KEEP editing enters a temporary access ID, deletes it and saves; access action is SET and the actual stored value becomes that temporary draft. Secret/token remain unchanged. Exact request-action/file-effect evidence is [9a476c6-aws-blank-recurrence.json](research/successor-3b1586a7/9a476c6-aws-blank-recurrence.json). Eight other AWS KEEP/token-CLEAR cases and three other all-KEEP byte cases passed; none waive this failure.
- **O1 / U06:** settled selected dark LLM-kind text still measures `4.498160160246434:1` in both locales, below 4.5. Dirty consent, memory clearing and Edit focus restoration completed in the same failing cases.

Completed final-source executions, all with zero browser skips/retries:

| Gate | Result |
| --- | --- |
| Focused backend/runtime including unchanged historical and all 28 independent ASGI/file cases | 458 passed |
| Frontend unit | 47 files, 366 tests passed |
| Frozen current full-App suite | 101 passed, 35 failed |
| Unchanged original independent browser harness | 25 passed, one obsolete recreated-orphan blank-KEEP assertion failed |
| Real gateway native onboarding/boundaries | 45 passed, two local no-key failures |
| Independent failure/ownership/revision/geometry supplement | 42 passed, one S2 failure |
| Registry, transport/account, dirty and native pageleave supplement | 11 passed, two O1 failures |
| Standalone cloud suite | Nine passed, supporting evidence only |
| Installed-wheel exact AWS access blank KEEP/token CLEAR with failure/401 restoration | Eight passed |
| Installed-wheel all-KEEP credential-byte completion | Three passed, one actual S4 failure; two separate wrong-label extension errors retained |
| Installed-wheel primary blank by fill/native keyboard in both locales | Four passed; no raw value submitted and credential bytes unchanged |
| Corrected native individual required-cloud/half-pair cases in both locales | Two passed, covering eight missing-field scenarios and two half-pair scenarios, zero writes |
| Installed-wheel independent LLM/decision creation and uncertain commit | Two passed, one S3 failure |

The 35 frozen failures are individually retained in `9a476c6-fullapp-failure-classification.json`: the original 34 obsolete expectations plus a primary-input action observation where deletion left the selector at SET. That case stops before Save, so its actual wire effect remains unestablished; four passing primary transactions do not explain it. C01 remains REWORK on the independently confirmed AWS recurrence.

Build, browser/cloud TypeScript, Pyright and package build passed. Lint has zero errors and four existing fast-refresh warnings. All 42 original asset files and the three extracted helper bodies are byte-identical; all 42 compiled static files match wheel and installed bytes. Provenance records identify the actual installed gateway module. Final desktop/narrow, cloud failure, settled dirty-dark and real gateway DeepSeek screenshots were opened; the original 16 viewport/locale/scheme geometry combinations were repeated.

Integrity: before this append every one of 2,542 final-candidate tracked files matched its recorded hash. Product/shared/frozen tests remain untouched and the historical report is an exact byte prefix. Writes are limited to this report and child research. Ports 44801–44803 use fresh owned servers; runtime homes, failed sources and results are retained. No commit, release, operator-file change or upstream generation was performed.

Harness limitations are explicit. The first final live launch discovered archived spec copies and failed collection; archive exclusion corrects only test discovery. Primary/required-cloud extensions first used wrong locale keys; their failed runs and old sources remain, and corrected cases pass. The standalone cloud reporter's fixed filename replaced its earlier success JSON/output directory; the original command/log and source remain, the final JSON is candidate-specific, and future runs use an attempt prefix. This supporting nine-case pass does not replace any failed acceptance evidence.

SP1/SP3/SP4 and IA3/IA4 remain REWORK. SP5/IA2 checks pass. SP2's exercised identity/reference checks and IA5's exercised guards pass, but their linked failed rows prevent an unqualified requirement signoff. The supplier task has no final PASS while S1-S4/O1 remain.
