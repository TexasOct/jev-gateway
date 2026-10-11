Optional model import and editing are implemented for A1. Supplier ownership and
upstream identity remain required. Supplied capabilities, effort lists, prices
and limits retain their domain checks; omitted facts stay unknown. Management
reads use stored facts instead of the catalog's legacy serving defaults. The
shared editor preserves false, zero, empty effort lists, explicit null and
source history, and removes confirmations when an optional fact is cleared.

The native incomplete-model import/reopen case passed against the final bundle.
Fifteen existing browser checks passed for dirty/pending/readonly guards, source
adoption, conflict and committed-write recovery, and 320px layouts in English and
Chinese with both themes. Native controls and their inventory were retained.
No strategy implementation, staging, commit, publication or operator-runtime
mutation was performed. Independent review is PENDING.

Admission and delivery remain at
`a7c57da6730705d2cae3242ab5bacb3cc76c0513`. The admission-relative tracked diff is
`receipts/implementation.diff`, SHA256
`5f28c5c7606babbac2fb4293d016d026fc7754685f3197abfe7f1456b8120b57`.
`receipts/admission.json`, `receipts/delivery-source.json` and the final command
JSON receipts bind source hashes and working directories. Original tracked
source is preserved in `receipts/predecessor/`. The task artifacts and receipt
files are untracked additions outside that tracked diff.

Failures are retained separately: two mistaken orientation paths, initial new
test fixture omissions, two old frontend completeness assertions, the occupied
4178 preview port, and 40 backend assertions for the superseded completeness and
omission contracts. The corrected assertions preserve business, provenance,
file/mode, reload and SQLite publication checks. No historical E1 or manual
acceptance report was changed. The port recheck used the existing configuration's
`JEV_BROWSER_PORT=4196` override and left the existing listener alone.

Final scoped evidence is 143 provider-owner tests, 60 cases in the changed HTTP
domain/legacy groups, 65 frontend draft/envelope tests, the native import case,
TypeScript build/browser checks, lint, Pyright and bundle freshness. The broader
backend attempt had 740 passing cases and 40 old-contract failures; its passing
cases were not repeated for ceremony. The initial frontend command selected all
53 unit files because the npm script already includes `src`: 409 tests passed
and two old-contract assertions failed. Their changed groups and the final
envelope paths were rechecked. Complete stable-source suites, native LSP and
independent review remain with the parent. Lint retains four existing React
Refresh warnings, and Vite retains the existing chunk-size warning.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "A1 implemented with minimal/partial transaction and HTTP import/update/read/reload coverage, invalid supplied-value rejection, draft/envelope regressions and a final-source native import/reopen PASS. Residual integration and review work is stated explicitly."
    }
  ],
  "changedFiles": [
    "jev_gateway/provider_config.py",
    "frontend/src/shared/api/types.ts",
    "frontend/src/features/providers/models/model.ts",
    "frontend/src/shared/i18n/en.ts",
    "frontend/src/shared/i18n/zh-CN.ts",
    "frontend/tests/fixtures/provider-management.ts",
    "frontend/tests/browser/supplier-models.spec.ts",
    "frontend/src/features/providers/__tests__/model.test.ts",
    "frontend/src/features/providers/__tests__/model-workspace.test.ts",
    "frontend/src/features/providers/__tests__/evidence-regression.test.ts",
    "tests/test_provider_config.py",
    "tests/test_model_value_domains.py",
    "tests/test_model_legacy_and_evidence_isolation.py",
    "docs/http-api.md",
    "docs/models-config.md",
    "docs/admin-experience.md",
    ".trellis/spec/backend/provider-configuration.md",
    ".trellis/tasks/10-11-model-optional-016/task.json",
    ".trellis/tasks/10-11-model-optional-016/implement.md",
    ".trellis/tasks/10-11-model-optional-016/implementation-handoff.md",
    ".trellis/tasks/10-11-model-optional-016/receipts/admission.json",
    ".trellis/tasks/10-11-model-optional-016/receipts/implementation.diff",
    ".trellis/tasks/10-11-model-optional-016/receipts/delivery-source.json"
  ],
  "testsAddedOrUpdated": [
    "tests/test_provider_config.py: minimal/partial import-update-read, omission, explicit null metadata, confirmation presence and invalid partial facts",
    "tests/test_model_value_domains.py: HTTP import-update-reload for minimal/partial records; known evidence remains unconfirmed; omitted cache fields remain absent",
    "tests/test_model_legacy_and_evidence_isolation.py: management omission assertion; existing runtime legacy defaults and business checks retained",
    "frontend/src/features/providers/__tests__/model.test.ts: optional field validation, false/zero/empty/null round trips, cleared confirmations and manual null cache protection",
    "frontend/src/features/providers/__tests__/model-workspace.test.ts: serving invalidation preserves remaining facts and history",
    "frontend/src/features/providers/__tests__/evidence-regression.test.ts: serving invalidation permits incomplete records without confirming missing facts",
    "frontend/tests/browser/supplier-models.spec.ts: native incomplete-model import and reopen",
    "frontend/tests/fixtures/provider-management.ts: omitted-field transaction projection and validation"
  ],
  "commandsRun": [
    {"command": "ls frontend/e2e; cat frontend/src/features/providers/models/ConfiguredModelList.tsx (separate orientation commands, cwd=/Users/texas/Workspace/jev-gateway)", "result": "failed", "summary": "Each native exit 1: paths do not exist. Both failures retained; actual owners were located and read."},
    {"command": "uv run pytest -q tests/test_provider_config.py (initial, cwd=/Users/texas/Workspace/jev-gateway)", "result": "failed", "summary": "Native exit 1: 138 passed, 3 new fixtures omitted catalog_from_document source argument. Original log retained."},
    {"command": "frontend/node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json (initial, cwd=/Users/texas/Workspace/jev-gateway)", "result": "failed", "summary": "Native exit 2: new source evidence fixture omitted source_field. Original log retained; corrected compiler checks pass."},
    {"command": "npm --prefix frontend run test -- src/features/providers/__tests__ (cwd=/Users/texas/Workspace/jev-gateway)", "result": "failed", "summary": "Native exit 1: actual script vitest run src src/features/providers/__tests__ selected all 53 files; 409 passed, 2 superseded completeness assertions failed. Original log retained."},
    {"command": "./node_modules/.bin/playwright test -c playwright.config.ts tests/browser/supplier-models.spec.ts --grep 'incomplete supplier model' (initial, cwd=/Users/texas/Workspace/jev-gateway/frontend)", "result": "failed", "summary": "Native exit 1: preview launch failed because port 4178 was occupied. No browser assertions executed; original launch receipt retained."},
    {"command": "uv run pytest -q tests/test_admin_model_contracts.py tests/test_provider_config_regressions.py tests/test_model_legacy_and_evidence_isolation.py tests/test_model_value_domains.py tests/test_model_management_boundaries.py (cwd=/Users/texas/Workspace/jev-gateway)", "result": "failed", "summary": "Native exit 1: 740 passed, 40 superseded completeness/omission assertions failed. Full original output retained."},
    {"command": "uv run pytest -q tests/test_provider_config.py (backend-model-final, cwd=/Users/texas/Workspace/jev-gateway)", "result": "passed", "summary": "Native exit 0: 143 passed; includes corrected new fixture tests and supplied partial-value rejection."},
    {"command": "uv run pytest -q tests/test_model_value_domains.py tests/test_model_legacy_and_evidence_isolation.py -k 'cache_unknown_zero or known_suggestion_keeps or legacy_omissions or minimal_and_partial_http' (cwd=/Users/texas/Workspace/jev-gateway)", "result": "passed", "summary": "Native exit 0: 60 passed, 626 deselected; rechecked changed groups and new minimal/partial HTTP cases only."},
    {"command": "./node_modules/.bin/vitest run src/features/providers/__tests__/model.test.ts src/features/providers/__tests__/model-workspace.test.ts src/features/providers/__tests__/model-envelope.test.ts src/features/providers/__tests__/model-python-capacity.test.ts src/features/providers/__tests__/evidence-regression.test.ts (final, cwd=/Users/texas/Workspace/jev-gateway/frontend)", "result": "passed", "summary": "Native exit 0: 5 files, 65 tests passed; includes old assertion repairs and final null/provenance/envelope changes."},
    {"command": "JEV_BROWSER_PORT=4196 ./node_modules/.bin/playwright test -c playwright.config.ts tests/browser/supplier-models.spec.ts --grep 'incomplete supplier model' (final, cwd=/Users/texas/Workspace/jev-gateway/frontend)", "result": "passed", "summary": "Native exit 0: 1 passed in 1.8s against final bundle; existing deadlines and zero retries."},
    {"command": "JEV_BROWSER_PORT=4196 ./node_modules/.bin/playwright test -c playwright.config.ts tests/browser/supplier-models.spec.ts --grep 'dirty model import|pending model transaction|read-only supplier|reference source values|import conflict reload|committed import recovery|supplier model settings fit' (cwd=/Users/texas/Workspace/jev-gateway/frontend)", "result": "passed", "summary": "Native exit 0: 15 passed in 4.5s; dirty/pending/readonly/recovery/source adoption and both locale/theme narrow layouts. Before final cache-null-only refinement; final integration owns complete frozen suites."},
    {"command": "npm run build (final, cwd=/Users/texas/Workspace/jev-gateway/frontend)", "result": "passed", "summary": "Native exit 0: tsc --noEmit and Vite build passed; existing chunk-size warning retained."},
    {"command": "npm run lint (final, cwd=/Users/texas/Workspace/jev-gateway/frontend)", "result": "passed", "summary": "Native exit 0: 0 errors, 4 existing React Refresh warnings in shared/i18n/index.tsx."},
    {"command": "frontend/node_modules/.bin/tsc -p frontend/tests/tsconfig.json (final, cwd=/Users/texas/Workspace/jev-gateway)", "result": "passed", "summary": "Native exit 0: browser TypeScript check passed."},
    {"command": "uvx pyright (final, cwd=/Users/texas/Workspace/jev-gateway)", "result": "passed", "summary": "Native exit 0: 0 errors, 0 warnings, 0 informations."},
    {"command": "scripts/build-frontend.sh --check (cwd=/Users/texas/Workspace/jev-gateway)", "result": "passed", "summary": "Native exit 0: dashboard bundle is current."},
    {"command": "git diff --check; git diff --cached --name-only (separate checks, cwd=/Users/texas/Workspace/jev-gateway)", "result": "passed", "summary": "Both native exits 0, both outputs empty; no whitespace errors and no staged files."},
    {"command": "python3 handoff JSON/source hash/diff/index check (inline script, cwd=/Users/texas/Workspace/jev-gateway)", "result": "passed", "summary": "Native exit 0: exact acceptance keys, all 17 changed-source hashes, admission-relative diff SHA256 and empty staged index verified."}
  ],
  "validationOutput": [
    "Receipts retain actual cwd, argv, native exit and complete stdout/stderr; final compiler/unit/browser receipts also include changed-source SHA256 hashes.",
    "Provider owner: 143 passed. Changed HTTP/legacy groups: 60 passed, 626 intentionally deselected by named scope.",
    "Frontend final draft/envelope scope: 65 passed across 5 files; original 409-pass/2-failure full frontend receipt remains unchanged.",
    "Final native A1 import/reopen: 1 passed, exit 0, port 4196. Existing native guard/responsive scope: 15 passed, exit 0. Initial occupied-port launch exit 1 retained.",
    "Initial broader backend receipt: 740 passed, 40 failed; only superseded completeness/omission assertions changed, with source copies retained and changed groups rechecked.",
    "Final build/type gates passed; Pyright reports 0 errors/0 warnings/0 informations. Lint reports 0 errors and 4 existing warnings. Bundle freshness reports dashboard bundle is current.",
    "HEAD equals admitted a7c57da6730705d2cae3242ab5bacb3cc76c0513; diff SHA256 5f28c5c7606babbac2fb4293d016d026fc7754685f3197abfe7f1456b8120b57; cached diff is empty."
  ],
  "residualRisks": [
    "Independent review PENDING; parent owns native LSP and complete stable-source integration suites.",
    "Management model projections now omit absent facts, including cache price fields. External management consumers must handle optional facts; supplied frontend DTOs and fixtures do.",
    "Four existing lint warnings and the existing Vite bundle-size warning remain."
  ],
  "noStagedFiles": true,
  "diffSummary": "17 tracked files change the optional-model parser/read projection, frontend DTO/draft/confirmation/import fixture, localized guidance, model docs/spec and meaningful regression tests. Task artifacts, predecessor source, source manifests and full command receipts accompany the handoff. No strategy code changed.",
  "reviewFindings": [
    "PENDING: independent review has not run; this writer report does not certify reviewer approval."
  ],
  "manualNotes": "All command logs and JSON receipts, including intermediate passing rechecks, are under .trellis/tasks/10-11-model-optional-016/receipts/ and inventoried in delivery-source.json. Parent planning artifacts and predecessor reports were preserved. No historical E1 failure or historical manual PASS was relabeled. The shared editor retains its native control inventory; no new cache checkbox was delivered. Cache null and null metadata survive unrelated edits, and manual null ownership remains protected during refresh. Complete task status remains in_progress pending independent review."
}
```
