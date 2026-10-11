Stage verdict: PASS

This PASS covers report recovery and preservation checks only. The existing local C1–C4 implementation evidence remains available for independent review. E1 native select popup-first Escape remains UNVERIFIED under the approved exception. Independent Config acceptance and the parent complete integration gate remain pending.

The original native delivery failed with: "Acceptance rejected: commands-run evidence missing from child report." This recovery supplies command evidence in the final acceptance payload. Local payload validation does not establish native delivery acceptance.

Recovery changed only this handoff and `research/report-only-validation.json`. No implementation, test, build, install, staging, reset, commit, publication or archival operation ran during recovery. Historical commands below describe preserved executions, not recovery reruns.

The read-only Python comparison ran from `/Users/texas/Workspace/jev-gateway`, exited 0, and compared the current files with `/Users/texas/Workspace/jev-config-report-recovery-3ab35112-xfk39ssh`. All 24 source/test records matched their saved SHA256, backup bytes and the composed native LSP manifest. All 532 saved task files matched, including 524 research files. The original implementation handoff SHA256 remains `fa8ebfb75b74e91f871a53d7f3101f09bca7cd43428cb88861e54013ab21fbc0`. Scope SHA256 remains `8d2a164b8576ecb1509ef9b31c02525d94f85586e7f5cf817ac44d63cddfffb7`.

`git rev-parse HEAD`, `git branch --show-current`, `git ls-files --stage -z`, `git diff --cached --binary` and `git rev-parse --git-path index` each exited 0. HEAD remains `8352e4b0818c73c5f2dee6a98345e655b85a1cba`, branch remains `main`, the 94,468-byte stage listing matches the backup, the raw index matches, and cached diff is empty. No files are staged.

The source/assertion inspection confirmed the existing outer `data-model-field={field}` hook, exact owning-control locators, checked owning field keys, SVG and legacy CSS arrow branches, forced-colors fallback and supplier-owned navigation through `openProviderModels`. These approved reconciliations remain unchanged. The original implementation changed 12 production files and eight test files; recovery adds no source or test changes. See the preserved `implementation-handoff.md`, `acceptance.md` and `research/implementation-delta.diff` for the implementation scope and criterion evidence.

All 27 entries in `research/final-evidence.json.commands` match the real receipt fields `command` (argv), `cwd`, `exit` and `log`. Each row below identifies the receipt and corresponding log in `research/`; these original JSON files preserve exact argv and execution timestamps. All npm commands ran from `/Users/texas/Workspace/jev-gateway/frontend`; the Python commands ran from `/Users/texas/Workspace/jev-gateway`.

| Receipt stem | Native exit | Preserved output |
| --- | ---: | --- |
| arrow-raster | 0 | Light/dark PNG painted inset 14px, center difference 0px |
| browser-types | 0 | Browser TypeScript check, no diagnostics |
| browser | 1 | 116 passed, 3 locator failures |
| build | 0 | Build passed; existing chunk-size warning |
| canvas-model-consumers | 0 | 18 passed |
| cloud | 0 | 9 passed |
| compact-build | 0 | Build passed; existing chunk-size warning |
| compact-visual | 0 | 12 passed; final B matrix |
| consumers-recheck | 0 | 4 repaired consumer cases passed |
| final-browser-types | 0 | Browser TypeScript check, no diagnostics |
| final-build | 0 | Build passed; existing chunk-size warning |
| final-lint | 0 | Scoped lint, no diagnostics |
| final-reconciliation | 0 | 12 production files, 20 owned source/test files, 24 LSP files, 16 protected Primitives entries, 78 PNGs, no staged files |
| lint | 0 | Scoped lint, no diagnostics |
| missing-consumers | 1 | 110 passed, 4 harness failures |
| overflow-diagnostic | 1 | 2 narrow English overflow failures |
| pending-recheck | 0 | 2 model-state cases passed |
| raster-final | 0 | Light/dark PNG painted inset 14px, center difference 0px |
| rework | 1 | 3 repaired original consumers passed, 2 narrow English visual failures |
| scoped-final-browser-types | 0 | Browser TypeScript check, no diagnostics |
| scoped-final-lint | 0 | Final scoped lint, no diagnostics |
| scoped-final-unit | 0 | 3 files, 21 tests passed |
| stable-build | 0 | Build passed; existing chunk-size warning |
| stable-visual | 1 | 14 passed, 2 model-state harness failures |
| unit | 0 | 20 files, 127 tests passed |
| visual | 1 | 10 passed, 2 narrow English visual failures |
| wrapped-build | 0 | Build passed; existing chunk-size warning |

Failure disposition remains explicit: `browser.json` is still exit 1; its three failed identities passed in the separate `rework.json` execution, which itself remains exit 1 because the two visual cases failed. `missing-consumers.json` remains exit 1; its four failed identities passed in `consumers-recheck.json`. Narrow visual failures in `visual.json`, `rework.json` and `overflow-diagnostic.json` are followed by the passing full final matrix in `compact-visual.json`. The two failed model-state cases in `stable-visual.json` passed separately in `pending-recheck.json`. Passing rechecks do not rewrite earlier failures. The preserved implementation evidence covers 276 distinct browser identities; it is scoped evidence and does not replace the parent's complete integration gate.

The parent native LSP receipts remain `parent-native-lsp-frozen-source.json` (21 files) and `parent-native-lsp-affected-source.json` (4 files, including one replacement and three additions). Their composition covers the current 24 files with zero diagnostics and zero hash mismatches. Compiler checks are separate evidence. Recovery did not invoke native LSP.

The original Primitives BLOCKED handoff, both failed popup diagnostics and all protected evidence remain unchanged. Optional PIL probes previously failed with `ModuleNotFoundError: No module named 'PIL'`; preserved raster checks used the standard-library PNG decoder. Recovery installed nothing.

The acceptance payload below contains actual historical commands with native results and receipt references. The local validator checks the exact key whitelist, required evidence, enum values, current preservation boundary and an unknown-key negative control. Its output is recorded in `research/report-only-validation.json`. Native delivery acceptance is still determined by the runtime.

```acceptance-report
{
  "criteriaSatisfied": [{"id": "criterion-1", "status": "satisfied", "evidence": "Recovered command evidence from 27 matching native receipts; 24 source/test files and 532 existing task files match the preservation backup. This criterion covers report recovery only."}],
  "changedFiles": [".trellis/tasks/10-06-shadcn-config-surfaces/implementation-recovery-handoff.md", ".trellis/tasks/10-06-shadcn-config-surfaces/research/report-only-validation.json"],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {"command": "git rev-parse HEAD", "result": "passed", "summary": "Recovery; repository cwd; exit 0; HEAD 8352e4b0818c73c5f2dee6a98345e655b85a1cba matches backup."},
    {"command": "git branch --show-current", "result": "passed", "summary": "Recovery; repository cwd; exit 0; main matches backup."},
    {"command": "git ls-files --stage -z", "result": "passed", "summary": "Recovery; repository cwd; exit 0; 94468 bytes match backup."},
    {"command": "git diff --cached --binary", "result": "passed", "summary": "Recovery; repository cwd; exit 0; empty output; no staged files."},
    {"command": "git rev-parse --git-path index", "result": "passed", "summary": "Recovery; repository cwd; exit 0; resolved raw index matches backup."},
    {"command": "npm exec -- vitest run src/features/settings src/features/appearance src/features/providers/__tests__", "result": "passed", "summary": "Historical; frontend cwd; native exit 0; 127 passed; research/unit.json and unit.log."},
    {"command": "npm exec -- vitest run src/features/settings src/features/appearance", "result": "passed", "summary": "Historical; frontend cwd; native exit 0; 21 passed; research/scoped-final-unit.json and scoped-final-unit.log."},
    {"command": "npm exec -- tsc -p tests/tsconfig.json", "result": "passed", "summary": "Historical; frontend cwd; native exit 0; no diagnostics; research/scoped-final-browser-types.json and scoped-final-browser-types.log."},
    {"command": "npm run build", "result": "passed", "summary": "Historical; frontend cwd; native exit 0; research/compact-build.json and compact-build.log; chunk-size warning retained."},
    {"command": "npm exec -- playwright test -c playwright.config.ts tests/browser/config-surfaces.spec.ts --grep 'B configuration surfaces'", "result": "passed", "summary": "Historical; frontend cwd; native exit 0; 12 passed; research/compact-visual.json and compact-visual.log."},
    {"command": "npm exec -- playwright test -c playwright.config.ts tests/browser/config-surfaces.spec.ts --grep 'B model states.*readonly false'", "result": "passed", "summary": "Historical; frontend cwd; native exit 0; 2 passed; research/pending-recheck.json and pending-recheck.log."},
    {"command": "npm exec -- playwright test -c tests/browser/supplier-cloud.config.ts", "result": "passed", "summary": "Historical; frontend cwd; native exit 0; 9 passed; research/cloud.json and cloud.log."},
    {"command": "npm exec -- playwright test -c playwright.config.ts tests/browser/canvas-model-handoff-repair.spec.ts tests/browser/canvas-modal-ownership-wave3.spec.ts", "result": "passed", "summary": "Historical; frontend cwd; native exit 0; 18 passed; research/canvas-model-consumers.json and canvas-model-consumers.log."},
    {"command": "npm exec -- playwright test -c playwright.config.ts tests/browser/config-surfaces.spec.ts", "result": "failed", "summary": "Historical; frontend cwd; native exit 1; research/visual.json: 10 passed/2 failed; research/stable-visual.json: 14 passed/2 failed. Separate compact-visual and pending-recheck receipts passed."},
    {"command": "npm exec -- playwright test -c playwright.config.ts tests/browser/settings.spec.ts tests/browser/appearance.spec.ts tests/browser/supplier-connections.spec.ts tests/browser/supplier-models.spec.ts tests/browser/model-dialog-rework.spec.ts tests/browser/model-workspace.spec.ts tests/browser/select-controls.spec.ts tests/browser/dialog-escape-rework.spec.ts tests/browser/supplier-cloud-workspace.spec.ts tests/browser/supplier-tail-rework.spec.ts", "result": "failed", "summary": "Historical; frontend cwd; native exit 1; 116 passed/3 failed; research/browser.json and browser.log. Three identities passed in rework.json, whose overall exit remains 1."},
    {"command": "npm exec -- playwright test -c playwright.config.ts tests/browser/model-tail-rework.spec.ts tests/browser/model-ownership.spec.ts tests/browser/provider-icons.spec.ts tests/browser/provider-presets.spec.ts tests/browser/provider-management.spec.ts tests/browser/successor-settings-acceptance.spec.ts", "result": "failed", "summary": "Historical; frontend cwd; native exit 1; 110 passed/4 failed; research/missing-consumers.json and missing-consumers.log. Four identities passed in consumers-recheck.json."},
    {"command": "npm exec -- playwright test -c playwright.config.ts tests/browser/model-tail-rework.spec.ts tests/browser/provider-management.spec.ts tests/browser/successor-settings-acceptance.spec.ts --grep 'retained automatic cache| null beside known|^null beside known|Settings owns gateway editing'", "result": "passed", "summary": "Historical; frontend cwd; native exit 0; 4 passed; research/consumers-recheck.json and consumers-recheck.log."}
  ],
  "validationOutput": ["24 preserved source/test files match SHA256 and backup bytes; zero mismatches.", "532 existing task files including 524 research files match backup bytes; zero mismatches.", "27 real command receipts match recorded argv/cwd/native exit/log fields.", "HEAD, branch, stage listing and raw index match backup; cached diff is empty.", "Local acceptance key-whitelist and unknown-key negative-control results are in research/report-only-validation.json; local validation does not establish native delivery acceptance."],
  "residualRisks": ["E1 native select popup-first Escape remains UNVERIFIED under the approved exception.", "Independent Config acceptance and parent complete integration remain pending.", "Original native delivery rejection remains preserved; runtime acceptance of this recovery is pending.", "Existing build chunk-size warning remains."],
  "noStagedFiles": true,
  "diffSummary": "Report-only recovery adds the handoff and validation receipt; existing implementation, tests, reports and failed evidence remain unchanged.",
  "reviewFindings": ["No preservation drift found in the checked backup boundary.", "The prior native delivery was rejected for missing commands-run evidence; this recovery includes nonempty commands and validation evidence.", "Product acceptance remains limited by E1 and the pending independent and parent gates."],
  "manualNotes": "No suites were rerun during recovery. Historical command results retain their original failures and separate passing rechecks. Parent native LSP evidence covers the unchanged 24-file scope; compiler evidence does not replace it. Local payload validation cannot certify native delivery acceptance."
}
```
