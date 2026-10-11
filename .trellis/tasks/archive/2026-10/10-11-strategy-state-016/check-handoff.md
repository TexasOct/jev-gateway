Independent read-only review of Stage S found three defects in the durable/API state seam. Baseline reset can restore runtime access to models absent from the workflow graph. HTTP writes also accept a noninteger version, and two accepted strategy names cannot be deleted through the shared client's URL contract. No production, test, documentation or task-source files were changed during review.

Stage verdict: REWORK

Behavioral findings, in priority order:

1. **P1: baseline reset removes explicit runtime selection.** `jev_gateway/gateway.py:1318` removes the selected entry and restores it only for a nonbaseline strategy. A baseline workflow therefore returns to `policy.selected_models is None` inside an otherwise v2 document. Configuration GET still advertises only seeded referenced models, while runtime widening can select any supplier model. The isolated native probe created `Other` to migrate state, with an additional untagged `large-provider/unreferenced` model. Before reset, GET selected only the two baseline referenced models and routing stayed within them. After `DELETE /v1/routing/configuration?strategy=task_aware`, GET returned the same two IDs but routing selected `large-provider/unreferenced`. Reload also retained selection `None`, and the v2 disk document had no `task_aware` entry. Keep a complete baseline-derived entry with explicit seeded selection during scoped/v2 reset. Preserve unrelated workflow state, inherited overrides and layout. Add an HTTP reset/reload/runtime regression with an eligible unreferenced supplier model, covering both query-selected and v2 no-query reset.
2. **P2: HTTP v2 requests bypass strict version validation.** `jev_gateway/gateway.py:1048` uses equality to dispatch `version == 2`, then discards the submitted version while constructing the strict disk document. Both POST validate and PUT accepted the JSON number `2.0` with HTTP 200; PUT persisted integer `2`. The direct storage validator rejects `2.0`, so its existing test does not cover this boundary. Validate the request's integer type and supported version before normalization. Add validate/apply HTTP cases that preserve bytes, runtime and versions on rejection.
3. **P2: accepted dot-segment names cannot complete CRUD through the client.** `jev_gateway/routing_overlay.py:17` accepts `.` and `..`; POST created each with HTTP 200. `frontend/src/shared/api/client.ts:130` uses `encodeURIComponent(name)` in a path segment, which leaves both names unchanged. URL normalization turns their DELETE requests into different endpoints. The native HTTP probe observed 405 for `.` and 404 for `..`. Reject these names consistently before persistence, or supply a deletion contract that can address every admitted name. Add native URL/client and API coverage; checking the string passed to a mocked fetch alone will miss normalization.

Standards review: the changes remain in the existing catalog, policy, overlay, layout, transaction, HTTP and pure frontend owners. The reviewed diff preserves supplier identity and credential ownership, and new local pool edits retain global tags and priority. No additional standards blocker was found. The strict-version boundary failure above is a concrete contract violation, separate from presentation or style preferences.

Specification/documentation review: the new v2 wire and disk descriptions match the implemented storage structures, with the reset and strict-version exceptions identified above. The predecessor's nonblocking `docs/admin-experience.md:92` requirement for explicit values on unknown fields remains assigned to integration. No historical E1 automated result or manual PASS was changed.

The UI handoff remains usable after reconciliation. Routing disk is exactly `{version: 2, strategies: {name: {definition, selected_models}}, deleted_strategies: [], models: {}}`. Each definition contains `kind: "decision_matrix"`, optional `description`, canonical `policy` and matrix `options`. Ordered unique selection belongs in the entry, while runtime projection adds `policy.selected_models`. Layout disk is `{version: 2, strategies: {name: {nodes, viewport}}}`; layout wire bodies remain `{version: 1, nodes, viewport}`. Root `models` retains inherited v1 overrides and is outside new workflow write bodies.

Configuration GET/validate/PUT/DELETE and layout GET/PUT accept `?strategy=name`; omission uses `task_aware`. V2 validate/apply bodies contain exactly `{version: 2, strategy, selected_models, definition}`, and a supplied selector must match. Strategy POST accepts `{name}`; strategy DELETE targets `/v1/routing/strategies/{name}` and protects the runtime default. Only decision matrices are editable. Legacy policy GET remains readable without an editable definition. V1 option bodies remain compatible, but nonempty global model edits reject after migration. The full configuration model library remains available to the chooser. The current reset behavior needs finding 1's repair before it meets the selected-only runtime contract.

Stage U must consume `workflowModels`, `selectedModelIds`, `addModelNode`, `removeModelNode`, `toWorkflowPayload`, local `pools` and `createStrategyHistory`, capture the strategy before awaits, and own stale-response, dirty/pending/auth/read-recovery and native focus guards. Existing visual components and v1 serializer call sites are still awaiting that stage. This review does not certify mounted selected-only rendering, browser interaction or completed visual A2-A4.

Admission and source audit ran in `/Users/texas/Workspace/jev-gateway`. HEAD remains `a7c57da6730705d2cae3242ab5bacb3cc76c0513`; all 26 delivered source hashes match. All 955 admitted tracked files outside the owned delta retain their admitted hashes. The 17 preserved predecessor copies and both predecessor reports match their admission/current bytes. The admission-relative diff was reconstructed byte for byte with SHA256 `d619c882556540e51fea498b9910b726a3492b4fa90e6a5c4c5436e2a9d542c8`. All 27 retained command logs match their recorded hashes. No current implementation-reconciliation report exists. The index is empty and `git diff --check` passed.

Existing passes were inspected without replay. The final backend receipt binds current source and reports 194 passes with 79 gateway deselections; final Pyright reports zero errors/warnings/informations. The frontend receipt reports 107 passes in six files. All ten frontend source/test hashes are unchanged through the subsequent backend refinements, so their source/browser compiler and lint receipts remain applicable. Lint retains four existing React Refresh warnings. Parent integration owns complete frozen-source suites, native changed-path LSP, build/package and publication. A8 remains pending actual parent publication; no release or operator installation is certified.

Reviewer command receipts, retained here at the bound output path:

- Source/receipt audit and exact admission-relative diff reconstruction: `python3` inline scripts, cwd `/Users/texas/Workspace/jev-gateway`, each native exit 0. Outputs confirmed 26 delivery hashes, 955 admission hashes, the exact diff SHA256 above, 27 matching log hashes, ten unchanged frontend bindings and an empty index.
- Initial isolated HTTP probe: `uv run python` with inline synthetic runtime setup, same cwd, native exit 1. It failed before any request because the standalone invocation lacked pytest's synthetic provider environment. The actual exception was `ValueError: Provider 'small-provider' declares api_key_env 'TEST_SMALL_PROVIDER_KEY', but that variable is not set.` The traceback went from inline line 11 through `tests/test_gateway.py:1979` (`matrix_config`), `jev_gateway/catalog.py:1880` (`catalog_from_document`), `catalog.py:1046` (`provider_from_dict`) and `catalog.py:969` (`_resolve_api_key`). This failure is unchanged; it was not a product result.
- Corrected isolated HTTP probe: `uv run python` with `TemporaryDirectory`, packaged empty startup template, `JEV_GATEWAY_HOME` inside that directory, `LITELLM_LOCAL_MODEL_COST_MAP=True`, and three explicit synthetic `TEST_*_PROVIDER_KEY` values; same cwd, native exit 0. It used the real `matrix_config`, `create_app` and ASGI request helper. Output: float-version POST 200 (`valid: true`), PUT 200 (`applied: true`), disk version 2; explicit save 200 with one selected model; baseline reset 200 and runtime selection `None`; dot-name creates 200, deletes 405/404. Exit 0 means the observations completed, while those behaviors substantiate the findings.
- Focused reset/runtime probe: `uv run python` with the same isolated synthetic setup, same cwd, native exit 0. It copied the large-model fixture as `large-provider/unreferenced`, removed its tags, gave it quality 1 and priority -99, and disabled tools on the original large model. Creating `Other` migrated state. Using real `RoutingRequest`/`extract_request_facts` with a synthetic tool requirement, output before reset was the two referenced selected IDs and route `small-provider/vendor/small-model`; after scoped DELETE 200 the selected IDs were unchanged but route became `large-provider/unreferenced`. Disk entry present was false; reload selection was `None`. This independently proves the runtime/graph mismatch without upstream calls.

Writer failures remain in their original logs: frontend exit 1 with 98 passes/one old tag-mutation assertion; backend fixture exit 1 with 26 passes/five incorrect field accesses; nonexistent owner-path exit 4 with no tests; expanded backend exit 1 with 281 passes/one fixture-message mismatch; first final backend exit 1 with 208 passes/two legacy policy-read assertions. The writer's repaired scopes were rechecked separately, including unchanged policy-read assertions. Original logs and predecessor runtime/launch failures remain preserved. This reviewer's synthetic environment failure is also retained above. No fixed sleeps, browser retries, forced controls, upstream credential calls or operator-runtime mutations occurred.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Completed the independent read-only Stage S review, verified source/receipt bindings and reported three native-proven defects requiring reconciliation, with retained failures and explicit UI/integration/release limits."
    }
  ],
  "changedFiles": [".trellis/tasks/10-11-strategy-state-016/check-handoff.md"],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "python3 inline final report/schema/source validation (reviewer; cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0: exactly ten required report keys, one REWORK verdict, nonempty command/validation evidence, unchanged delivered/admitted source hashes, empty index and git diff --check passed."
    },
    {
      "command": "python3 inline admission/source/receipt audit (reviewer; cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0: HEAD unchanged; 26 current delivery hashes, 955 admission hashes and 17 predecessor copies verified; 27 native log hashes checked; empty staged index and git diff --check passed."
    },
    {
      "command": "uv run python, inline isolated HTTP boundary probe (reviewer initial attempt; cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "failed",
      "summary": "Native exit 1 before requests: TEST_SMALL_PROVIDER_KEY absent in standalone fixture environment. Actual exception and traceback retained in this report; synthetic-key correction was rechecked separately."
    },
    {
      "command": "uv run python, inline isolated HTTP boundary probe with explicit synthetic provider keys (reviewer; cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0: observation completed. version 2.0 validate/apply returned 200 and persisted integer 2; baseline reset returned 200 and dropped runtime selection; '.'/'..' created with 200 but client-style DELETE returned 405/404. These are product defects, not passing contract assertions."
    },
    {
      "command": "uv run python, inline isolated baseline-reset/runtime/reload probe (reviewer; cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0: native observation completed. After scoped reset, runtime selected large-provider/unreferenced outside GET selected_models; disk omitted task_aware entry and reload kept selected_models=None."
    },
    {
      "command": "python3 inline exact admission-relative diff and frontend receipt-scope audit (reviewer; cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0: exact 26-file diff reconstructed with SHA256 d619c882556540e51fea498b9910b726a3492b4fa90e6a5c4c5436e2a9d542c8; ten frontend hashes unchanged through backend refinements; predecessor reports byte-identical."
    },
    {
      "command": "uv run pytest -q tests/test_strategy_state.py tests/test_canvas_layout.py tests/test_routing_overlay.py tests/test_empty_tag_default.py tests/test_global_defaults.py tests/test_gateway.py -k 'strategy_state or canvas_layout or routing_overlay or configuration or empty_tag or global_default or selected or literal_default or supplier or strategy_activation or creation or named_layout or version_two_layout or overlay_version' (retained writer receipt; cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0: 194 passed, 79 deselected in backend-shape-delivery.log; delivery-source.json matches current source. Missing HTTP float-version, normalized-dot-name and reset/unreferenced-candidate boundaries were probed independently."
    },
    {
      "command": "./node_modules/.bin/vitest run src/features/routing/__tests__/draft.test.ts src/features/routing/__tests__/canvas.test.ts src/features/routing/__tests__/history.test.ts src/features/routing/__tests__/outputs.test.ts src/features/routing/__tests__/strategy-state.test.ts src/shared/api/client.test.ts (retained writer receipt; cwd=/Users/texas/Workspace/jev-gateway/frontend)",
      "result": "passed",
      "summary": "Native exit 0: 107 passed in six files in frontend-delivery.log; all ten delivered frontend hashes still match that scope."
    },
    {
      "command": "uvx pyright (retained writer receipt; cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0: 0 errors, 0 warnings, 0 informations in pyright-shape-delivery.log, bound to current delivery-source.json. This is compiler evidence; native LSP remains parent-owned."
    },
    {
      "command": "./node_modules/.bin/tsc --noEmit (retained writer receipt; cwd=/Users/texas/Workspace/jev-gateway/frontend)",
      "result": "passed",
      "summary": "Native exit 0 in typescript-delivery.log; frontend executable/type scope unchanged after backend-only refinements."
    },
    {
      "command": "frontend/node_modules/.bin/tsc -p frontend/tests/tsconfig.json (retained writer receipt; cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0 in browser-types-delivery.log; compiler only, no browser execution in this stage."
    },
    {
      "command": "npm --prefix frontend run lint (retained writer receipt; cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0 in lint-delivery.log; 0 errors and four existing React Refresh warnings. Applicable frontend hashes are unchanged."
    }
  ],
  "validationOutput": [
    "Reviewer cwd=/Users/texas/Workspace/jev-gateway; native audit exits 0 verified HEAD a7c57da6730705d2cae3242ab5bacb3cc76c0513, 26 delivery hashes, exact admission-relative diff SHA256 d619c882556540e51fea498b9910b726a3492b4fa90e6a5c4c5436e2a9d542c8, predecessor copies/reports, 27 log hashes and empty index.",
    "Reviewer initial uv Python probe native exit 1: Provider 'small-provider' declares api_key_env 'TEST_SMALL_PROVIDER_KEY', but that variable is not set. Failed before requests; actual traceback retained. Corrected synthetic environment probe native exit 0, with observed float-version POST/PUT 200, dot-name POST 200 and DELETE 405/404.",
    "Reviewer reset/runtime probe native exit 0: before reset selected two referenced IDs and routed small-provider/vendor/small-model; after DELETE 200 GET kept those two IDs but runtime routed large-provider/unreferenced. Disk task_aware entry absent and reload selection None.",
    "Inspected current-source backend receipt native exit 0: 194 passed, 79 unrelated gateway deselections; Pyright native exit 0: 0 errors/warnings/informations. These checks miss the three independently observed boundaries.",
    "Inspected unchanged frontend scope: Vitest native exit 0 with 107 passes in six files; source/browser TypeScript native exits 0; lint native exit 0 with four existing warnings. Existing passes were not replayed for ceremony.",
    "Retained writer failures remain exits 1/1/4/1/1 with respective scopes 98 frontend passes/one old tag assertion, 26 backend passes/five fixture errors, no tests/nonexistent owner, 281 backend passes/one fixture message, and 208 backend passes/two legacy reads. Corrected scopes were separately rechecked; original logs and historical E1/manual evidence remain unchanged."
  ],
  "residualRisks": [
    "Baseline reset breaks A2-A4 selected-only runtime scope until finding 1 is repaired and rechecked, including reload and no-query v2 reset.",
    "Strict HTTP version validation and CRUD addressability for dot-segment names require repair and focused regression coverage.",
    "Stage U still owns visual controls, selected-only mounted rendering, async switching, native focus/dirty/pending/auth guards and browser acceptance.",
    "Parent owns complete frozen-source suites, changed-path native LSP, build/package and actual A8 publication. No release or operator installation is certified.",
    "Predecessor docs/admin-experience.md:92 wording nit and four existing lint warnings remain."
  ],
  "noStagedFiles": true,
  "diffSummary": "Reviewed the exact 26-file Stage S admission-relative delta covering named v2 routing/layout storage, selected-only runtime filtering, CRUD/query APIs, legacy migration, supplier-reference reconciliation and pure frontend/client contracts. Reviewer wrote only the bound check report.",
  "reviewFindings": [
    "P1: jev_gateway/gateway.py:1318 - baseline reset removes explicit selection, allowing runtime widening to select a model absent from configuration.selected_models; native runtime/reload probe confirmed it.",
    "P2: jev_gateway/gateway.py:1048 - HTTP version 2.0 is accepted and normalized before strict disk validation; both validate and apply returned 200.",
    "P2: jev_gateway/routing_overlay.py:17 and frontend/src/shared/api/client.ts:130 - '.'/'..' are admitted but DELETE URLs normalize to other endpoints, returning 405/404.",
    "Standards: no additional ownership, credential, supplier-tag or geometry violation found in this state seam.",
    "Specification/documentation: predecessor stale explicit-value clause at docs/admin-experience.md:92 remains nonblocking and integration-owned."
  ],
  "manualNotes": "Read-only reviewer used explicit task context without activation or child agents. Applied installed Humanizer in embedded mode. Production/tests/docs/task source and all predecessor reports were preserved. Synthetic TemporaryDirectory fixtures only; no staging/reset/clean/commit/push/publication, operator runtime/tool/service mutation or upstream credential calls. Reviewer failure and successful defect observations are retained in this authoritative report."
}
```
