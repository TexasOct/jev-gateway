# Verification evidence

## Test environment

Browser checks use the repository's isolated Playwright preview on loopback with synthetic API responses. Unknown origins and writes are rejected. Backend tests use temporary catalogs and dummy credentials from `tests/conftest.py`.

## Final checks

| Command | Result | Evidence |
| --- | --- | --- |
| `uv run pytest -q tests/test_gateway.py -k disconnected_canvas_match` | 2 passed, 85 deselected | `verification/backend-disconnected-match.log` |
| `uv run pytest -q tests/test_decision_matrix.py tests/test_routing_overlay.py tests/test_canvas_layout.py` after invalid-question regressions | 46 passed | `verification/backend-policy-boundaries.log` |
| `uvx pyright` | 0 errors, 0 warnings, 0 informations | `verification/pyright.log` |
| `uv run pytest -q tests/test_decision_matrix.py` after terminal-path and invalid-type regressions | 16 passed | `verification/backend-terminal-semantics.log` |
| `npm --prefix frontend run lint` | Passed, four existing Fast Refresh warnings | `verification/check-selection-lint.log` |
| `npm --prefix frontend run test` | 233 passed in 33 files | `verification/check-selection-unit.log` |
| `npm --prefix frontend run build` | TypeScript and Vite passed | `verification/check-selection-build.log` |
| Full rebuilt browser suite after the individual-wire correction | 118 passed | `verification/check-selection-browser-confirmed.log` |
| Canvas connection and dense geometry suite | 15 tests passed, including all 16 locale/theme/viewport combinations | `verification/check-browser-geometry.log` |
| `uv run pytest -q` | 764 passed | `verification/check-pytest.log` |
| Final independent Pyright and bundle checks | Passed | `verification/check-pyright.log`, `verification/check-selection-bundle.log` |
| Task-only checkout lint and unit tests | Passed; 232 tests in 32 files | `verification/scoped-lint.log`, `verification/scoped-unit.log` |
| Task-only checkout build, source/test TypeScript and full browser suite | Passed; 103 browser tests | `verification/scoped-browser.log` |
| Task-only bundle freshness, wheel/sdist build and wheel asset parity | Passed; all four static files matched | `verification/scoped-bundle.log`, `verification/scoped-package.log`, `verification/scoped-package-assets.json` |

The shared workspace also contains a separately owned Key-page feature. A temporary index excluded its files and shared-file hunks, then an isolated checkout of the exact proposed source passed the task-only gates above. Shared and isolated test counts differ because the Key-page tests are absent from the isolated checkout. Python sources and tests did not change during the final frontend correction; the 764-test backend result remains applicable. The packaged assets came from the verified isolated source build.

Active LSP probes found no source errors. Some TypeScript rechecks were unconfirmed because the push-only server stayed silent; both source and browser TypeScript compilation passed. The final Python probe had one existing spelling advisory for synthetic stream text, with no type errors. Vite's existing large-chunk warning remains.

## Independent browser scenario

`frontend/tests/browser/canvas-visual-acceptance.spec.ts` uses six question options, twelve pool outputs and long Unicode model names. Its matrix covers 320 × 900, 390 × 900, 1280 × 900 and 1430 × 2511, in English and Chinese with light and dark schemes. It checks canvas/header bounds, document overflow, node header hit-testing, keyboard focus, shared node width, expanded dense-node height and nonoverlapping stage columns, then captures screenshots and geometry.

The parent inspected all 16 `strategy-*.png` screenshots from `verification/browser-geometry/`, plus `verification/canvas-repaired-draft.png`. Both schemes preserve node-role contrast and output-row separation. Narrow widths show a readable selected node with horizontally scrolling controls; the tall viewport offers a whole-board overview. The repaired-draft image shows all five node roles and the separate default/failure paths.

The final isolated run writes geometry JSON to disk so dimensions, canvas/header bounds and document width survive a list-reporter run. All 16 records contain 17 nodes with 190px widths, a 420px dense pool, 48px minimum default column gaps and no document overflow. Canvas bottoms match 900px or 2511px viewport heights; canvas tops remain below the measured header. Curated evidence is in `verification/final/`.

## Final review correction

The parent found that question result wires sharing one canonical rule-entry edge also shared their selected state, and the action panel omitted the chosen criterion name. The correction retains visual output identity separately from the runtime mutation intent, highlights one selected wire, shows its exact output name and uses localized source titles for disconnected matches. Native pointer/keyboard, cancellation, focus return, stale-draft and panel-description regressions passed in both final browser runs. The parent inspected the English and Chinese selected-panel screenshots: only `intent = other` is highlighted, its source/output/destination are named, and fixed-path help remains visible.

## Requirement acceptance

| Criterion | Status | Authoritative evidence |
| --- | --- | --- |
| AC1: Chinese copy and English usability | PASS | Locale parity/selection-caption tests, both locale browser matrices and panel screenshots |
| AC2: five node roles, alignment and persistence | PASS | Native group alignment/reload cases, long-name screenshots and measured header/row geometry |
| AC3: left inputs, right outputs and anchors | PASS | Native assertions for both endpoint centers, arrow markers and handle placement |
| AC4: select/connect/reconnect/disconnect/repair and keyboard | PASS | Individual criterion-wire tests, match/fallback repair, pool edits, Escape/focus, fixed/explicit/last-member restrictions |
| AC5: output growth/shrink and shared geometry | PASS | Output/dimension unit tests; native criterion/member changes; 16 dense scenes; marquee, movement, Fit/reveal and inspector regressions |
| AC6: draft, review/apply and layout boundary | PASS | No policy PUT before validation/review/confirmation; layout-only alignment; stale and read-only browser cases; backend byte/hash/version protection |
| AC7: verification and inspectable artifacts | PASS | Final shared and task-only gates, wheel parity, saved logs, screenshots and geometry JSON |
| AC8: default versus decision failure | PASS | Matrix no-match/failure tests with and without rules, distinct label/selection modes, preview and canonical graph tests |
| AC9: capacity and restored layouts | PASS | Over-20000 stage collision regression, 257-node and Unicode-byte limits, visible no-write rejection, restored layouts after growth and layout rollback cases |

## Design review resolution

The independent review identified the existing UI's conflation of no-match default and decision-failure fallback, missing question-type boundaries and unspecified layout overflow handling. All three were verified from source and incorporated into the PRD/design. Backend tests now distinguish valid-no-match from failure with and without conditional rules, and cover unsupported question types and too few criteria. No backend runtime change is required.
