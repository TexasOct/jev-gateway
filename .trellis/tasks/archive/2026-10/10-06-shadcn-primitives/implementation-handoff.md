Implemented the shared Primitives slice. Public Button/Card/Separator/ToolButton
and the existing business Dialog now consume the registry directory. Added mapped
Input/Textarea/Label/NativeSelect/Badge/Alert sources, Field associations and a
native Checkbox compatibility adapter. Feature layouts remain with their next
owners. Source admission and final hashes are in `research/initial-boundary.json`
and `research/final-source-snapshot.json`.

Dialog preserves caller-owned close guards, refs, autofocus, visible return
targets, authentication suspension, scrolling body and reachable footer. Native
fields preserve raw drafts, events and form semantics. NativeSelect defaults to
44px and keeps numeric size/multiple/sentinels; one palette-colored SVG chevron
replaces the legacy CSS chevron only on this component. Forced colors restores
native appearance. Checkbox remains native because existing callers depend on
input ChangeEvents and native checked/name/value/fieldset semantics. There is no
matching generic Switch/Tabs/DropdownMenu/Tooltip consumer, so none was installed.

CLI `4.21.4` generated ten sources in a disposable copy. The retained originals
and `research/adaptation-and-coverage.md` document local cn/focused Radix imports,
explicit borders, palette paint, sizing, role ownership and retained behavior.
Live npm 11.16.0 installation adds focused Label and three lock entries, removes
none and leaves existing non-root lock package entries unchanged. Accepted
Foundation Button variants, including opaque destructive hover, are byte-preserved.

Validation: focused units 10/10; full frontend lint exits 0 with four existing
i18n refresh warnings; production TypeScript/Vite build, browser tsc and explicit
new-source/TSX-fixture compiler diagnostics pass. Existing Dialog/auth/model
regressions pass 21/21, final select regressions pass 21/21, and six synthetic
native compatibility cases pass at 1440/390/320px in light/dark. They cover native
refs, raw empty drafts, tri-state/sentinel values, change events, FormData, Enter,
Space, indeterminate, fieldset disabled state, 44px sizing, one inset arrow,
invalid paint, focus, overflow, forced colors and destructive badge contrast.
Representative narrow controls and production dirty-close screenshots were
inspected; `research/final-evidence.json` lists all screenshot paths.

Two failed attempts remain in the receipt: initial fixture-only 320px overflow
and a production forced-colors selector-specificity regression. Both were fixed
with unchanged assertions, retries and deadlines. Final source review removed
redundant all-edge style from Dialog's directional header/footer borders;
direct lint, a fresh build and the 21 affected browser cases pass afterward.
`research/commands.json`
records commands/exits/logs; `acceptance.md` records criterion evidence.

Native LSP is unavailable in this child profile. The parent supplied the native
probe against the frozen final snapshot: 33 clean files, zero diagnostics and no
unsupported/unavailable/failed/inconclusive outcomes. Before/after hashes agree;
the receipt is [parent-native-lsp-replacement.json](./research/parent-native-lsp-replacement.json).
The earlier clean probe is retained in
[parent-native-lsp.json](./research/parent-native-lsp.json) as earlier-source
evidence only. P1-P3 developer
checks pass; independent Trellis acceptance remains pending. This handoff
does not claim independent stage PASS.

Next owners should import public lowercase controls and `Field`/`Dialog` using
their existing case. NativeSelect's className targets its select; apply grid/flex
placement to a surrounding field. Spread Field associations onto the actual
control, retain every sentinel option and pass input drafts unchanged. Alert
roles/live regions stay caller-owned. Keep native color preview/commit and canvas
coordinate menus with their existing owners. Page-site adoption, B layout
screenshots and the full stable-source integration gate remain downstream.

No files are staged. No downstream task was started, and no commit, publication,
archival, real configuration or service mutation was performed. Inherited source,
planning edits and historical admin acceptance exceptions were preserved.

```acceptance-report
{
  "criteriaSatisfied": [{"id":"criterion-1","status":"satisfied","evidence":"Owned Primitives implementation completed; acceptance.md and research receipts record P1-P3 developer checks, source hashes, failures/fixes, native browser/LSP results and downstream limits."}],
  "changedFiles": [
    "frontend/package.json", "frontend/package-lock.json", "frontend/src/styles/base.css",
    "frontend/src/shared/ui/button.tsx", "frontend/src/shared/ui/card.tsx", "frontend/src/shared/ui/separator.tsx", "frontend/src/shared/ui/Dialog.tsx",
    "frontend/src/shared/ui/Field.tsx", "frontend/src/shared/ui/input.tsx", "frontend/src/shared/ui/textarea.tsx", "frontend/src/shared/ui/label.tsx", "frontend/src/shared/ui/native-select.tsx", "frontend/src/shared/ui/checkbox.tsx", "frontend/src/shared/ui/badge.tsx", "frontend/src/shared/ui/alert.tsx",
    "frontend/src/shared/ui/primitives/button.tsx", "frontend/src/shared/ui/primitives/card.tsx", "frontend/src/shared/ui/primitives/separator.tsx", "frontend/src/shared/ui/primitives/dialog.tsx", "frontend/src/shared/ui/primitives/input.tsx", "frontend/src/shared/ui/primitives/textarea.tsx", "frontend/src/shared/ui/primitives/label.tsx", "frontend/src/shared/ui/primitives/native-select.tsx", "frontend/src/shared/ui/primitives/badge.tsx", "frontend/src/shared/ui/primitives/alert.tsx",
    "frontend/src/shared/ui/README.md", "frontend/src/shared/ui/fields.test.tsx", "frontend/tests/browser/primitives.check.ts", "frontend/tests/browser/primitives.config.ts", "frontend/tests/browser/primitives.html", "frontend/tests/browser/primitives.tsx",
    ".trellis/tasks/10-06-shadcn-primitives/task.json", ".trellis/tasks/10-06-shadcn-primitives/acceptance.md", ".trellis/tasks/10-06-shadcn-primitives/implementation-handoff.md", ".trellis/tasks/10-06-shadcn-primitives/research/"
  ],
  "testsAddedOrUpdated": ["frontend/src/shared/ui/fields.test.tsx", "frontend/tests/browser/primitives.check.ts", "frontend/tests/browser/primitives.config.ts", "frontend/tests/browser/primitives.html", "frontend/tests/browser/primitives.tsx"],
  "commandsRun": [
    {"command":"Pinned CLI view/add in disposable frontend","result":"passed","summary":"Ten mapped sources generated; originals retained."},
    {"command":"npm install @radix-ui/react-label (frontend cwd, npm 11.16.0)","result":"passed","summary":"Three lock package additions; no removals or existing non-root package changes."},
    {"command":"npm exec -- vitest run src/shared/ui/controls.test.tsx src/shared/ui/theme-contract.test.js src/shared/ui/fields.test.tsx (frontend cwd)","result":"passed","summary":"10 tests in 3 files."},
    {"command":"npm run lint (frontend cwd)","result":"passed","summary":"Only four existing i18n refresh warnings remain; direct final Dialog/test lint clean."},
    {"command":"npm run build (frontend cwd)","result":"passed","summary":"Final TypeScript/Vite build passes; existing chunk-size warning."},
    {"command":"Browser tsc and explicit new-source/TSX-fixture compiler diagnostics","result":"passed","summary":"No diagnostics."},
    {"command":"Primitive native Playwright probe, first attempt","result":"failed","summary":"4 passed; 2 fixture-only 320px overflow failures, retained and fixed without changing assertions."},
    {"command":"Original select/Dialog/auth/model Playwright suites, first attempt","result":"failed","summary":"41 passed; forced-colors selector-specificity failure retained and fixed."},
    {"command":"Final original select-controls.spec.ts Playwright recheck","result":"passed","summary":"21 passed after fresh build."},
    {"command":"Final original dialog-escape-rework/auth-workspace/model-dialog-rework Playwright recheck","result":"passed","summary":"21 passed after directional-border fix and fresh build."},
    {"command":"Final native primitive Playwright probe","result":"passed","summary":"Six cases pass in both schemes at 1440/390/320px with unchanged overflow/contrast/focus/native semantics assertions."},
    {"command":"Parent lens_diagnostics(source=lsp, scope=paths, severity=all, serverScope=primary, includeGenerated=true, concurrency=8, waitMs=1500, refreshRunners=none)","result":"passed","summary":"33 clean files, zero diagnostics; final source hashes unchanged before/after."},
    {"command":"git diff --check; git diff --cached --name-only","result":"passed","summary":"No whitespace errors or staged files."}
  ],
  "validationOutput": [
    "research/commands.json records exact commands, exits and logs; failed attempts remain preserved.",
    "research/final-source-snapshot.json SHA256 ff9b78b71462bcca9951850f98c92f72c29e26e4d042bf2cbe729fef7d226354.",
    "Parent native scope SHA256 9c3f3edf1700ca5d6b2e6c1247d79d0c594fbf50be43c890142b1d341a43aaaa; clean=33, diagnostics=0, all other outcomes=0.",
    "Native geometry assertions establish 44px input/select height, single current-color SVG arrow with >=12px inset, right padding >=32px, forced-colors native appearance and no overflow.",
    "Native form assertions establish raw empty drafts, select sentinels, refs/events, indeterminate checkbox, Enter/Space, disabled fieldset exclusion and exact FormData; destructive badge paint clears 4.5:1.",
    "Representative final controls and dirty-close Dialog screenshots inspected; inventory is research/final-evidence.json."
  ],
  "residualRisks": [
    "Independent P1-P3 Trellis acceptance is pending; no downstream task started.",
    "New mapped field/feedback controls await feature-site substitution and B layout screenshots by Config/Operational/parent owners.",
    "Parent full stable-source integration remains required; historical admin acceptance exceptions remain separate."
  ],
  "noStagedFiles": true,
  "diffSummary": "Added reviewed registry primitives and thin public adapters; retained business Dialog/focus/auth and native form semantics; added focused Label dependency, scoped arrow fallback and owned compatibility evidence.",
  "reviewFindings": ["Fixed forced-colors selector specificity and directional Dialog border styling during implementation; no known implementation blockers."],
  "manualNotes": "Sole-writer implementation; inherited planning/source receipts preserved. Parent performed native LSP and child recorded its receipt. No git staging/commit/publication/archival or real operator changes."
}
```
