Primitives P1-P3 pass within the operator-approved scope in
[acceptance-exceptions.md](../10-06-shadcn-ui-adoption/acceptance-exceptions.md).
E1, native select popup-first Escape, remains **UNVERIFIED**. This follow-up
resolves only the acceptance-scope blocker after the operator's explicit “同意”.
No concrete production defect is waived or newly found.

The original independent reviewer reconciled current source with the final
snapshot, native LSP scope and original review. All 39 recorded source/harness/
diagnostic entries match. The original BLOCKED `check-handoff.md`, both failed
popup logs/results and unchanged diagnostic fixtures remain preserved. The plain
native-select failure continues to establish a runner limitation without proving
production popup dismissal. Both diagnostic native exits remain 1.

P1 retains reviewed controls/states, field associations, native geometry and
inspected screenshots. P2 retains native events/refs/raw drafts/form submission,
tri-state/sentinel/indeterminate semantics and guarded Dialog dismissal, pending/
failed saves, focus return and authentication suspension. Its passing browser
receipts cover 21 select cases, 21 Dialog/auth/model cases and six native primitive
cases. Popup-first Escape is excluded only under E1 and stays UNVERIFIED.

P3 retains the full lint receipt (four existing warnings), 10 focused units,
production TypeScript/Vite build, browser/compiler checks and the separately
supplied parent native LSP receipt: 33 clean files, zero diagnostics and no other
outcomes. These checks bind unchanged source. The actual Label lock delta is
three additions, zero removals and no existing non-root package change.
No installation or unchanged passing test rerun was needed.

Updated `acceptance.md` and the owned PRD checklist to state this approved scope.
Production and test bytes remain unchanged. Admission is recorded in
`research/check-exception-initial-boundary.json` and
`research/check-exception-initial-working.diff`; final checks and protected
artifact hashes are in `research/check-exception-final-validation.json`.
Original exact command/exits are in `research/commands.json` and
`research/check-validation.json`. Screenshot paths remain in
`research/final-evidence.json`, including the inspected dark 320px controls,
production dark Chinese dirty-close Dialog and failed popup capture.

An initial receipt-validation script exited 1 after the reviewer duplicated
`research/` in screenshot paths. Its failed output is preserved in
`research/check-exception-path-validation-failed.json`. The corrected task-root
paths find all four screenshots and final receipt validation exits 0.

Only Primitives was activated. No downstream task, staging, commit, publication,
archival, real operator configuration or service change occurred. Feature-site
adoption and B layout screenshots remain downstream; the parent owns the complete
stable-source frontend/browser/Python/package gate. Carry E1 as UNVERIFIED into
every affected downstream handoff and the final A5/A8 report. Historical admin
exceptions remain separate.

Stage verdict: PASS

```acceptance-report
{
  "criteriaSatisfied": [{"id":"criterion-1","status":"satisfied","evidence":"P1-P3 independently accepted within the explicit operator-approved E1 scope; E1 remains UNVERIFIED, unchanged source reconciles with existing receipts, and original BLOCKED/failure evidence is preserved."}],
  "changedFiles": [".trellis/tasks/10-06-shadcn-primitives/prd.md", ".trellis/tasks/10-06-shadcn-primitives/acceptance.md", ".trellis/tasks/10-06-shadcn-primitives/check-exception-handoff.md", ".trellis/tasks/10-06-shadcn-primitives/research/check-exception-initial-boundary.json", ".trellis/tasks/10-06-shadcn-primitives/research/check-exception-initial-working.diff", ".trellis/tasks/10-06-shadcn-primitives/research/check-exception-final-validation.json", ".trellis/tasks/10-06-shadcn-primitives/research/check-exception-path-validation-failed.json"],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {"command":"Current-source SHA256 reconciliation against check-validation.json and actual pre-install/live lock comparison","result":"passed","summary":"39 matching entries, no mismatches; three lock additions, zero removals, no existing non-root package changes."},
    {"command":"TRELLIS_CONTEXT_ID=pi_01a111be-5788-7169-b951-a0f2417171c2 python3 ./.trellis/scripts/task.py start .trellis/tasks/10-06-shadcn-primitives","result":"passed","summary":"Only existing Primitives task activated; exit 0."},
    {"command":"Initial follow-up receipt-validation Python script","result":"failed","summary":"Exit 1: reviewer duplicated research/ in screenshot paths; failed receipt preserved."},
    {"command":"Corrected follow-up receipt-validation Python script","result":"passed","summary":"Exit 0: four retained screenshots exist at task-root-relative paths; no source/evidence changed."},
    {"command":"Final source/protected evidence reconciliation; git diff --check; git diff --cached --name-only","result":"passed","summary":"Source and original BLOCKED/failure artifacts unchanged; no whitespace errors or staged files."}
  ],
  "validationOutput": ["39 current source/harness/diagnostic hashes agree with the original review.", "Retained passing evidence: 10 unit cases, lint/build/compiler checks, 21 select cases, 21 Dialog/auth/model cases and six native primitive cases.", "Parent native LSP receipt remains applicable: 33 clean files, zero diagnostics and no other outcomes.", "Original BLOCKED report and both native exit-1 popup diagnostics remain byte-preserved.", "E1 native select popup-first Escape remains UNVERIFIED under explicit operator approval."],
  "residualRisks": ["E1 popup-first Escape observation remains UNVERIFIED and must appear in affected downstream and final A5/A8 reports.", "Feature-site B layouts and the parent's complete stable-source integration gate remain downstream."],
  "noStagedFiles": true,
  "diffSummary": "Acceptance-only follow-up updates the owned checklist and current verdict under approved E1; product/tests and original reports/failures are preserved.",
  "reviewFindings": ["No unresolved blocker within the operator-approved Primitives scope.", "E1 remains UNVERIFIED; no passing popup receipt is claimed."],
  "manualNotes": "No new tests, reruns, installation, native-menu/HID helper, product workaround or assertion/retry/deadline change. Original reviewer completed the scope reconciliation."
}
```
