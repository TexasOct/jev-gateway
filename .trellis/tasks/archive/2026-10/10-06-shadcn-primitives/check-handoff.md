Independent review found no concrete defect in the owned production slice.
P1 and P3 are supported by current-source receipts. P2 remains blocked on the
explicit native-select popup-first Escape evidence required by the migration map.

Reviewed public wrappers, all ten registry primitives, native Checkbox and Field,
control defaults, dependencies/docs, adjacent production callers and original
browser assertions. All 30 final snapshot entries and six additional LSP harness
entries match live bytes. The Label lock delta is three additions, zero removals
and no existing non-root package changes. No production fix was warranted.

Existing final evidence supports 10 unit cases, lint with four existing warnings,
production TypeScript/Vite build, browser/compiler types, 21 select cases, 21
Dialog/auth/model cases, six native compatibility cases and 33 clean native LSP
files. These passing checks were not repeated on unchanged source. The reviewer
inspected the dark 320px controls and dark Chinese production dirty-close Dialog
screenshots listed in acceptance.md.

The new supplemental production popup probe uses the original synthetic Dialog
fixture, native select click, CSS `:open`, Playwright keyboard Escape and original
focus/write boundaries. Click establishes `:open=true`; Escape leaves it true
through the normal 5000ms predicate deadline. The supervisor authorized one plain
native-select control in the same installed Chromium runner. It reproduces the
failure without React/Radix/Dialog. Both commands exit 1. This demonstrates a
runner limitation; it cannot establish the required production dismissal result.
The open-state screenshot was inspected, but browser capture omits the native
popup surface. The parent supplied no current accepted receipt or waiver.

Added only three supplemental test/config files and review artifacts. Supplemental
lint and browser tsc exit 0. Original assertions, deadlines, zero retries and
production collection remain intact. No files are staged. Source identities,
commands/exits and runner identity are in `research/check-validation.json`;
original failures remain in `research/check-popup.log` and
`research/check-popup-control.log`, with screenshots under
`research/check-popup-results/` and `research/check-popup-control-results/`.
Admission boundaries are in `research/check-initial-boundary.json` and
`research/check-initial-working.diff`.

Remaining action: obtain supported native-popup Escape evidence with the installed
browser runner, or resolve the clause explicitly in the parent contract review.
The plain control failure does not justify a production workaround. Downstream
stages remain unstarted; feature-site B layouts and the full stable-source gate
remain with their owning stages. Historical archive exceptions remain separate.

Stage verdict: BLOCKED

```acceptance-report
{
  "criteriaSatisfied": [{"id":"criterion-1","status":"satisfied","evidence":"P1/P3 verified against unchanged final source; P2 popup evidence gap and same-runner plain-control failure documented with native exits, source hashes and precise remaining action."}],
  "changedFiles": ["frontend/tests/browser/primitives-popup.check.ts", "frontend/tests/browser/primitives-popup-control.check.ts", "frontend/tests/browser/primitives-popup.config.ts", ".trellis/tasks/10-06-shadcn-primitives/acceptance.md", ".trellis/tasks/10-06-shadcn-primitives/check-handoff.md", ".trellis/tasks/10-06-shadcn-primitives/research/check-initial-boundary.json", ".trellis/tasks/10-06-shadcn-primitives/research/check-initial-working.diff", ".trellis/tasks/10-06-shadcn-primitives/research/check-validation.json", ".trellis/tasks/10-06-shadcn-primitives/research/check-popup.log", ".trellis/tasks/10-06-shadcn-primitives/research/check-popup-control.log"],
  "testsAddedOrUpdated": ["frontend/tests/browser/primitives-popup.check.ts", "frontend/tests/browser/primitives-popup-control.check.ts", "frontend/tests/browser/primitives-popup.config.ts"],
  "commandsRun": [
    {"command":"TRELLIS_CONTEXT_ID=pi_01a111be-5788-7169-b951-a0f2417171c2 python3 ./.trellis/scripts/task.py start .trellis/tasks/10-06-shadcn-primitives","result":"passed","summary":"Existing Primitives stage active; downstream unstarted."},
    {"command":"npm exec -- playwright test -c tests/browser/primitives-popup.config.ts (frontend cwd)","result":"failed","summary":"Production popup opens; Escape leaves :open=true through 5000ms predicate deadline."},
    {"command":"npm exec -- playwright test -c tests/browser/primitives-popup.config.ts primitives-popup-control.check.ts --output=../.trellis/tasks/10-06-shadcn-primitives/research/check-popup-control-results (frontend cwd)","result":"failed","summary":"Plain native select reproduces identical failure without React/Radix/Dialog."},
    {"command":"npm exec -- eslint tests/browser/primitives-popup.check.ts tests/browser/primitives-popup-control.check.ts tests/browser/primitives-popup.config.ts (frontend cwd)","result":"passed","summary":"Exit 0, no diagnostics."},
    {"command":"npm exec -- tsc -p tests/tsconfig.json (frontend cwd)","result":"passed","summary":"Exit 0, no diagnostics."},
    {"command":"git diff --check; git diff --cached --name-only","result":"passed","summary":"No whitespace errors or staged files."}
  ],
  "validationOutput": ["36 reviewed source/harness hashes match existing final receipts.", "Existing current-source gates: units 10/10, select 21/21, Dialog/auth/model 21/21, native primitive 6/6, LSP 33 clean/zero diagnostics.", "Two popup probes exit 1; plain control demonstrates runner limitation without certifying production popup-first Escape.", "Reviewer supplemental lint and browser tsc exit 0.", "Screenshot and source/runner identity pointers are preserved in acceptance.md and research/check-validation.json."],
  "residualRisks": ["P2 native popup-first dismissal remains unverified and unwaived; stage cannot claim PASS.", "Feature-site B layouts and parent full stable-source integration remain downstream."],
  "noStagedFiles": true,
  "diffSummary": "Production source unchanged; added isolated popup evidence probes and additive independent review receipts.",
  "reviewFindings": ["blocker: migration map native select popup-first dismissal has no passing current-source receipt; same-runner plain control reproduces Escape dispatch limitation.", "No concrete owned production defect found."],
  "manualNotes": "Supervisor authorized the single plain-control diagnostic. No native-menu/HID helper, runner switch, weakened assertion, retry/timeout change or downstream start. Historical exceptions preserved."
}
```
