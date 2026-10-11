Foundation F1-F3 pass after independent review. No blockers remain in this owned
stage. Parent integration and historical admin acceptance exceptions remain
separate.

Fixed the broken action-accent sentence in `frontend/src/shared/ui/README.md`.
Also fixed a concrete contrast failure in the adjacent
`frontend/src/shared/ui/button-variants.ts` with supervisor approval: dark
destructive hover at 90% background opacity measured 3.9002:1. Keeping its
background opaque restores 4.5505:1; light normal/hover destructive labels measure
5.3536:1. Actual default normal/hover labels also pass in both schemes. The
maintenance workflow now documents this constraint for the primitives owner.

Reviewed the pinned CLI/config, installed schema, actual lock delta, disposable
initialization/add/import/build receipts, complete MIT notice and semantic theme
mapping. The lock adds 250 package entries, removes none and leaves every existing
package object unchanged. Palette authority, aliases, `cn`, Preflight exclusion,
Radix dependency and API/state ownership are preserved.

Affected lint, 18 existing controls/theme tests, the production TypeScript/Vite
build and all 37 unchanged appearance/connection/auth/Settings browser tests pass.
The added disposable browser contrast probe preserves the original 4.5:1 assertion
and records native normal/hover paint with background compositing. Its failing
before and passing after receipts are retained. A reviewer Vitest invocation from
the wrong cwd also failed and is preserved; the documented frontend cwd passes.
No retries or deadlines were changed.

`acceptance.md` contains exact commands, native exits and F1-F3 receipt pointers.
`research/check-initial-boundary.json` and `check-initial-working.diff` capture
review admission; `research/check-reviewed-source.json` contains final hashes and
screenshot paths. Final dark Button, 320px custom Settings and focused connection
screenshots were inspected. No files are staged, and no downstream task was
started.

Next-owner constraints: preserve opaque destructive hover and local `cn` imports;
review generated Input text/sizing before production adoption. The final full
integration gate remains with the parent.

The parent-requested hash reconciliation is in
`research/check-hash-reconciliation.json`. The README mismatch is the reviewer's
restored sentence; early and completion reviewer hashes agree. Corrected contrast
receipts bind identical live/disposable/completion button, CSS token and palette
bytes. The minimal authorized adjacent change is
`hover:bg-destructive/90!` to `hover:bg-destructive!` in `button-variants.ts`.

Inherited ModelDialog/ModelFields/model source, locales, supplier-models browser
regression, model-source-values fixture, backend metadata/tests, provider spec
and admin docs retain their admission diffs. Their current hashes are passed in
the reconciliation receipt for later owners; they are outside Foundation PASS.
No active changes in those overlapping files were observed at completion. No
already-passing gate was repeated for this documentation follow-up.

Stage verdict: PASS

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "F1-F3 reviewed against final source; acceptance.md records fixes, native receipts, inspected screenshots and next-owner constraints."
    }
  ],
  "changedFiles": [
    "frontend/src/shared/ui/README.md",
    "frontend/src/shared/ui/WORKFLOW.md",
    "frontend/src/shared/ui/button-variants.ts",
    ".trellis/tasks/10-06-shadcn-foundation/acceptance.md",
    ".trellis/tasks/10-06-shadcn-foundation/check-handoff.md"
  ],
  "testsAddedOrUpdated": [
    ".trellis/tasks/10-06-shadcn-foundation/research/check-button-contrast.cjs"
  ],
  "commandsRun": [
    {"command": "Installed rawConfigSchema validation", "result": "passed", "summary": "Exact configuration accepted; CLI 4.21.4"},
    {"command": "npm --prefix frontend exec -- vitest run src/shared/theme/palette.test.ts (root cwd)", "result": "failed", "summary": "Wrong cwd collected historical copies; preserved check-command-2.log"},
    {"command": "npm exec -- vitest run src/shared/theme/palette.test.ts (frontend cwd)", "result": "passed", "summary": "11 tests passed"},
    {"command": "node research/check-button-contrast.cjs before", "result": "failed", "summary": "Actual dark destructive hover contrast 3.9002:1; preserved"},
    {"command": "node research/check-button-contrast.cjs after", "result": "passed", "summary": "Eight actual rendered normal/hover states pass 4.5:1"},
    {"command": "npm exec -- eslint src/shared/ui/button-variants.ts (frontend cwd)", "result": "passed", "summary": "No diagnostics"},
    {"command": "npm exec -- vitest run src/shared/ui/controls.test.tsx src/shared/ui/theme-contract.test.js src/shared/theme/palette.test.ts (frontend cwd)", "result": "passed", "summary": "18 tests in 3 files passed"},
    {"command": "npm --prefix frontend run build", "result": "passed", "summary": "Production TypeScript/Vite passed; existing chunk-size warning"},
    {"command": "JEV_BROWSER_PORT=4193 npm exec -- playwright test -c playwright.config.ts tests/browser/appearance.spec.ts tests/browser/connection.spec.ts tests/browser/auth-workspace.spec.ts tests/browser/settings.spec.ts (frontend cwd)", "result": "passed", "summary": "37 passed, zero retries, original deadlines/assertions"},
    {"command": "git diff --check; git diff --cached --name-only", "result": "passed", "summary": "No whitespace errors; no staged files"}
  ],
  "validationOutput": [
    "research/check-after-commands.json and check-browser-command.json retain native exits",
    "Dark destructive normal/hover: 4.5505:1; light: 5.3536:1",
    "research/check-reviewed-source.json records source hashes and screenshot inventory",
    "250 lock entries added, zero removed, zero existing package-object changes"
  ],
  "residualRisks": [
    "Primitives must preserve opaque destructive hover and review generated Input text/sizing and local cn imports before adoption",
    "Parent full stable-source integration remains required"
  ],
  "noStagedFiles": true,
  "diffSummary": "Reviewed foundation setup/tokens/lock/docs; fixed README prose and adjacent destructive hover contrast; added independent browser evidence.",
  "reviewFindings": [
    "fixed: README action-accent sentence was incomplete",
    "fixed: destructive dark hover contrast fell to 3.9002:1 with a translucent background",
    "no blockers"
  ],
  "manualNotes": "Supervisor authorized the minimal adjacent button fix. Predecessor source and historical failures remain preserved; no downstream task was started."
}
```
