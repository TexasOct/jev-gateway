The three reviewed strategy-state defects are repaired. Baseline reset now persists a baseline-derived entry with explicit referenced-model selection, retaining inherited global overrides and other workflow/layout state. HTTP validate/apply rejects noninteger or unsupported versions before normalization. Strategy names `.` and `..` are reserved; admitted dotted and Unicode names remain addressable through native URL normalization.

Affected checks passed: 92 backend tests, 22 client tests, Pyright and source TypeScript. Lint passed with four existing warnings. Independent re-review remains PENDING. Parent integration still owns complete frozen-source suites, native LSP, build/package and release; the following UI stage owns visible controls and switching guards.

The exact v2 shapes and API handoff remain in the preserved implementation-handoff.md. The updated spec clarifies reset selection, HTTP integer versions and reserved dot segments. Admission, predecessor source/reports, reconciliation diff, delivery hashes and actual native receipts are under receipts/reconciliation-0/. Original failed receipts and the independent REWORK report remain unchanged.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Repaired the three current reviewed defects with affected backend/client regressions and source-bound checks; independent re-review remains PENDING."
    }
  ],
  "changedFiles": [
    "jev_gateway/gateway.py",
    "jev_gateway/routing_overlay.py",
    "tests/test_strategy_state.py",
    "frontend/src/shared/api/client.test.ts",
    ".trellis/spec/backend/dashboard-routing-config.md"
  ],
  "testsAddedOrUpdated": [
    "tests/test_strategy_state.py",
    "frontend/src/shared/api/client.test.ts"
  ],
  "commandsRun": [
    {
      "command": "uv run pytest -q tests/test_strategy_state.py tests/test_routing_overlay.py (cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0; retained receipts/reconciliation-0/backend.json/.log. 92 passed; affected state and overlay owners."
    },
    {
      "command": "frontend/node_modules/.bin/vitest run --root frontend frontend/src/shared/api/client.test.ts (cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0; retained receipts/reconciliation-0/client.json/.log. 22 passed; client owner with native URL normalization."
    },
    {
      "command": "uvx pyright (cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0; retained receipts/reconciliation-0/pyright.json/.log. 0 errors, 0 warnings, 0 informations."
    },
    {
      "command": "frontend/node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json (cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0; retained receipts/reconciliation-0/types.json/.log. Source TypeScript passed."
    },
    {
      "command": "npm --prefix frontend run lint (cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0; retained receipts/reconciliation-0/lint.json/.log. 0 errors, four existing React Refresh warnings."
    },
    {
      "command": "python3 inline source/diff/receipt audit; git diff --check; git diff --cached --name-only (cwd=/Users/texas/Workspace/jev-gateway)",
      "result": "passed",
      "summary": "Native exit 0: predecessor hashes and reports preserved; 21 untouched delivery hashes unchanged, five-file reconciliation diff bound, log hashes verified, empty staged index."
    }
  ],
  "validationOutput": [
    "cwd=/Users/texas/Workspace/jev-gateway; native backend exit 0: 92 passed. Query-selected and no-query v2 reset preserve explicit selection through reload/runtime widening; untouched state/layout/baseline assertions pass.",
    "Native client exit 0: 22 passed; native URL normalization checked for accepted names, and dot-segment normalization documented by assertions. API create rejects both dot segments and accepted Unicode/dotted names complete deletion.",
    "Native Pyright/source TypeScript exits 0; lint exit 0 with four existing React Refresh warnings. No browser execution or native LSP is claimed.",
    "Reconciliation diff SHA256 a79d276c02775f6b784b30a607df4c33b9b9a18bbb4109ba47526cdebe8531ae; HEAD a7c57da6730705d2cae3242ab5bacb3cc76c0513; all prior source/report/command receipts preserved.",
    "Historical failures remain unchanged in original receipts and check-handoff.md, including reviewer missing synthetic environment exit 1, writer exits 1/1/4/1/1 and prior launch failures. This reconciliation had no failed validation command; affected owner suites were rechecked, unchanged passes were not replayed."
  ],
  "residualRisks": [
    "Independent reconciliation review PENDING; parent owns final frozen suites, native LSP, build/package and release.",
    "UI stage still owns visible controls, selected-only mounted rendering and strategy-switch async/focus/dirty/pending/auth guards.",
    "Four existing lint warnings and predecessor docs/admin-experience.md:92 integration-owned wording nit remain."
  ],
  "noStagedFiles": true,
  "diffSummary": "Five-file reconciliation keeps baseline reset selection explicit, validates HTTP integer versions before normalization, reserves dot-segment names and adds runtime/reload/SQLite/nonmutation/native URL regressions. V2 wire and disk shapes and APIs remain as documented in the preserved handoff.",
  "reviewFindings": [
    "PENDING: independent review of reconciliation source has not run."
  ],
  "manualNotes": "Owned task activated after complete context/plan and predecessor/review reads. Humanizer applied in embedded mode. Production changes used native apply_patch. Preserved predecessor source/reports and original failed receipts. No staging/reset/clean/commit/push/merge, publication/version bump, browser runner replacement, operator mutation, upstream credential call or child agent."
}
```
