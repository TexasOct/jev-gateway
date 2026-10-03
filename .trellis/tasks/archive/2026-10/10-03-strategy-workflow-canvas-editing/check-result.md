# Canvas review result

No scope-local defects remain after review and fixes. Runtime routing semantics and backend schemas are unchanged. This child made no commits and did not edit App, AppShell, ConnectionPage, Key-page tests, specs, HTTP docs, Python tests or task status.

## Fixes

- `model/draft.ts`: question validation now blocks blank instructions, criterion names and criterion descriptions, including whitespace-only values. Each reason has specific English and Chinese feedback in `RoutingEditor.tsx` and the locale catalogs.
- `model/outputs.ts`: invalid questions expose no result channels. Valid choice questions still feed the canonical ordered rule entry; the decision-failure output remains separate. Repair restores result ports.
- `model/canvas.ts`: arrangement reserves the full width of each stage, including overflow columns, before placing later stages. Columns advance by their measured maximum width. Twelve 2000px rules now stay separate from label pools and model sinks while cumulative height exceeds 20000.
- `__tests__/outputs.test.ts`: eight invalid-question cases and a cross-stage rectangle collision regression cover repair, bounds, valid persistence, and existing capacity/Unicode byte-limit rejection.
- `canvas-connections.spec.ts`: native blank-field edits block review and recover after repair. Additional assertions verify wire endpoints against both port centers, left input/right output placement and arrow markers.
- `canvas-visual-acceptance.spec.ts`: enter keyboard navigation before testing `:focus-visible`. The original test focused through JavaScript immediately after mouse input, when Chromium correctly suppresses the keyboard outline. The new test asserts both `:focus-visible` and the solid computed outline. No CSS change was needed. The instructions-field test uses the textbox accessible name so textarea content cannot affect label matching.
- Targeted follow-up in `RoutingCanvas.tsx`: connection state now retains the source node and exact visual output descriptor alongside the canonical mutation intent. Only that output's SVG path is highlighted and pressed. The panel shows the localized source title, exact criterion/model/output name and connected destination; empty matches display the localized rule/fallback title. Direct SVG pointer/keyboard selection and port gestures pass their descriptor; legacy edge-list controls resolve the first corresponding output. Clearing the combined state removes both identities on cancellation, Escape, tool changes and completion. Existing stale-draft and focus-return guards remain in place.
- `canvas-connections.spec.ts`: two locale cases select both question outputs individually with native pointer and keyboard input, assert a single pressed tuple and exact panel text, retain fixed-path restrictions, verify port selection and clear selection on tool change/Escape. Existing match, pool and empty-fallback tests now assert their panel descriptions. Native drag preparation waits for measured canvas layout frames and verifies both source and target hit points; the second pool addition is asserted before review.

## Verification

Logs and screenshots are under `verification/`. All commands ran from the repository root. Playwright launched a fresh loopback Vite preview on the free port 4178, with server reuse disabled and synthetic API fixtures; no live gateway or upstream traffic was used.

| Command | Exit | Result / log |
| --- | --- | --- |
| `npm --prefix frontend run lint` | 0 | Four existing Fast Refresh warnings; `check-selection-lint.log` |
| `npm --prefix frontend run test` | 0 | 233 tests, 33 files; `check-selection-unit.log` |
| `npm --prefix frontend run build` | 0 | TypeScript and Vite; `check-selection-build.log`; full browser command also rebuilt the final source |
| `npm --prefix frontend run test:browser -- --output=../.trellis/tasks/10-03-strategy-workflow-canvas-editing/verification/browser-selection-confirmed` | 0 | Fresh production build, source/test TypeScript compilation, 118 browser tests in 20.5s; all 16 dense scenarios; `check-selection-browser-confirmed.log` |
| `npm --prefix frontend run test:browser -- canvas-connections.spec.ts --output=../.trellis/tasks/10-03-strategy-workflow-canvas-editing/verification/browser-selection-focused` | 0 | 13 focused native interaction tests; `check-selection-focused.log` |
| `scripts/build-frontend.sh --check` | 0 | Current bundle; `check-selection-bundle.log` |
| `uv run pytest -q` | 0 | 764 passed in 54.72s; `check-pytest.log` |
| `uvx pyright` | 0 | Zero errors/warnings; `check-pyright.log` |
| `git diff --check` | 0 | `check-selection-whitespace.log` |

Backend/Pyright entries are the previous verified runs, retained as requested; this targeted frontend follow-up did not rerun them. The full browser count includes the two new question-selection locale cases and the current Key-page regression suite.

Active LSP probes covered 26 routing, locale and synthetic test files. The final error probe returned zero diagnostics: 23 confirmed clean and three push-only silent rechecks unconfirmed. Both TypeScript compilation gates passed. An earlier all-severity probe confirmed all 15 targeted files and reported only auxiliary hints/advisories: mandated dynamic inline geometry, valid Vite extensionless imports, string sorting and filter/map style suggestions. No suppressions or configuration changes were added. Details are in `verification/check-lsp.log`.

Initial failed runs are retained in `check-build.log` and `check-browser.log`; the test-data type error and browser selector/focus setup were corrected before the successful final gates.

The follow-up's first full browser run exposed a stale coordinate measurement in the pool test immediately after closing the connection panel. `check-selection-browser-final.log` preserves that failure. Waiting for canvas layout frames before native pointer coordinates and asserting the second membership addition resolved it; the final full suite passed. This changes test readiness, not routing or pointer mutation semantics. A fresh two-file LSP probe reported zero errors, one confirmed clean file and one silent push-only recheck; final source/test TypeScript compilation passed.

A final staleness check observed a concurrent write to the unrelated `ConnectionPage.test.tsx` after the browser build. Rebuilding the ignored dashboard assets and repeating unit/staleness checks restored passing gates; this child did not edit that file. Playwright released its preview process, and port 4178 had no listener afterward.

## Acceptance evidence

| Criterion | Reviewed evidence |
| --- | --- |
| AC1 | Paired locale keys, unchanged catalog identifiers, English/Chinese dense matrix |
| AC2 | Five node roles, truncated long identifiers, header/row alignment; native group alignment and reload restoration |
| AC3 | Native source/target endpoint centers, arrow marker and left input/right output assertions; inspected desktop screenshot |
| AC4 | Exact visual wire selection despite shared canonical edges; localized source/output/destination panel; native drag connect/reconnect, match/fallback empty-port repair, pool disconnect, keyboard activation/focus return/cancel, fixed/explicit/last-member reasons |
| AC5 | Question and pool growth/shrink, dense handle size/spacing, shared bounds for marquee/movement/Fit/reveal/inspector; existing routing/responsive suites passed |
| AC6 | Draft edits do not PUT configuration before review/apply; layout-only saves, stale gesture rejection, pointer cancellation, readonly and review guards passed |
| AC7 | Full frontend/backend gates above; synthetic fixtures and saved screenshots |
| AC8 | Configured preview/graph tests and backend decision-matrix regressions distinguish successful no-match from failure, with rules and with zero rules |
| AC9 | Cross-stage overflow regression, coordinate/256-node/65536-byte checks, visible 257-node rejection without PUT, layout persistence and rollback regressions |

The dense matrix saved 16 strategy screenshots under `verification/browser-final/canvas-visual-acceptance-*/`. I inspected `strategy-320-zh-CN-dark.png`, `strategy-1280-en-light.png` and `verification/canvas-repaired-draft.png`: identity rows, output spacing, focus indication and node ports are visible without text overlap. At narrow widths the toolbar scrolls horizontally and Fit focuses a readable node, as the existing responsive contract specifies.

All previous passing logs and the 16 dense screenshots remain intact. The final follow-up also saved 16 dense screenshots under `verification/browser-selection-confirmed/`. Selected-connection screenshots for parent acceptance:

- English: `verification/browser-selection-confirmed/canvas-connections-selects-258a5--and-names-its-output-in-en/connection-en.png`
- Chinese: `verification/browser-selection-confirmed/canvas-connections-selects-209ec-d-names-its-output-in-zh-CN/connection-zh-CN.png`

I inspected both selected-panel images: the heading names `intent = other`, only its wire is highlighted, and fixed-path help remains visible. The parent owns final screenshot acceptance and the scoped commit; its updated docs/spec and Python tests were untouched. No out-of-scope blockers remain.
