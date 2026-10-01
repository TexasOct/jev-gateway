# Icon implementation evidence

## Changes

Installed exact `lucide-react@1.48.0`. Compared with the supplied baseline, the
lockfile changes only its root dependency entry and `node_modules/lucide-react`.
No existing dependency version changed.

The installed package's `dist/lucide-react.d.ts` and runtime exports confirmed
all chosen names and `LucideIcon`. A rendered component confirmed `currentColor`,
size, stroke width, `aria-hidden` and `focusable` forwarding. The docs helper did
not resolve the nested frontend installation reliably, so local installed files
were used to verify the API.

Changed frontend files:

- `package.json`, `package-lock.json`: exact dependency.
- `src/app/AppShell.tsx`: refresh icon.
- `src/features/routing/RoutingCanvas.tsx`: select, pan, add, zoom and directional controls.
- `src/features/routing/RoutingEditor.tsx`: grip, reorder, close and disclosure icons.
- `src/features/routing/components/CanvasNodeContent.tsx`: six-category typed static component map, retaining 14px size and 1.8 stroke.
- `src/features/routing/__tests__/CanvasNodeContent.test.tsx`: all six categories in both locales, SVG attributes and distinct library components without path snapshots.
- `src/features/routing/__tests__/RoutingEditor.test.tsx`: localized names, decorative SVGs, pressed/disabled/disclosure state and sortable attributes.
- `tests/browser/icons.spec.ts`: browser cases for controls at 1280px, 390px and 320px in English and Chinese, including alternate-font measurements added in review.
- `README.md`: static imports, control naming, sizing and custom-graphic boundaries.

No backend, shared spec, locale catalog, style source, task-state or Git-index
changes were made. RouteTrace, diagram geometry, route-description arrows and
the J brand remain unchanged. Existing control handlers and DnD bindings remain
on their original elements.

## Verification

All commands used bounded subprocess timeouts (300 seconds for lint/build/check,
600 seconds for tests). No command reached its bound.

| Check | Baseline | Final |
| --- | --- | --- |
| Frontend lint | Exit 0; 0 errors, 4 warnings | Exit 0; same 4 warnings |
| Frontend unit tests | 25 files, 186 passed | 25 files, 188 passed |
| Frontend build and TypeScript | Passed | Passed |
| Bundle staleness check | Not run before edits | Passed: dashboard bundle is current |
| Full browser suite | 22 passed, 1 failed | 29 passed, 1 failed |
| Icon browser cases | Not present | 14 passed over two runs after review fixes |
| `git diff --check` | Not run before edits | Passed |

The four lint warnings are existing `react-refresh/only-export-components`
warnings in `src/shared/i18n/index.tsx`. Both builds report the existing 500 kB
chunk warning. JS size changed from 540.92 kB (167.92 kB gzip) to 549.00 kB
(170.59 kB gzip); CSS changed from 45.36 kB to 45.54 kB.

An active LSP probe reported no diagnostics on seven touched TS/TSX files, with
three confirmed clean and four inconclusive push-only results. The successful
build and browser-test TypeScript commands provide the compiler checks.

### Browser failure outside this task

`tests/browser/monitoring.spec.ts:206` times out at line 211 while waiting to
click `Refresh activity`. That button is inside the existing collapsed Settings
disclosure, which the test does not open. The same failure occurred when the
full pre-change frontend copy was built and served in an isolated temporary
directory. It was not fixed or skipped. Baseline reproduction used the installed
node_modules; the only added package was Lucide, unused by baseline source.

### Icon browser coverage

The new tests check emitted SVG attributes, accessible names, pointer-events and
computed dimensions. They exercise refresh with Enter, toolbar keyboard focus,
select/pan pressed state, plus/minus zoom, all directional pan actions, add-rule
focus, disclosure in both states, inspector close, earlier/later reorder and DnD
keyboard pickup/drop. Real pointer drag starts over the node icon after checking
`elementFromPoint`. Configuration writes are forbidden by the fixture; only
synthetic canvas-layout writes occur in the new tests.

The initial tests needed to wait for Fit's nested animation frames and the DnD
KeyboardSensor's deferred keydown listener. Those waits are test-only. The
fixtures use isolated loopback Vite preview and synthetic APIs; no live gateway,
credentials or real configuration writes were used.

Direct comparison against baseline browser measurements caught wider compact
controls after introducing SVGs. Narrow inline slots preserve their previous
footprint and text spacing without shrinking the 16px SVG. Across both locales
and all three widths, control heights are unchanged and widths differ by at most
0.6px. Toolbar controls remain 40×40px; nodes remain 190×56px with 14×14px icons.
The new tests assert these bounds. Existing responsive tests also passed at
1430×2511, 1280×900, 390×820 and 320×820 in both locales and color schemes.

## Scoped review artifacts

Baseline and logs:
`/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-icons-baseline-t07euvz7`

- `task-scoped.patch`: initial frontend delta against baseline; `task-scoped-current.patch` captures the current pre-commit scope, including reviewer fixes.
- `baseline-{lint,test,build,browser}.log`: pre-change results (browser reproduced after implementation in a copy).
- `final-{lint,test,build,bundle-check,browser,icons-repeat}.log`: final results.
- `control-measurements-matrix.json`: baseline/current control dimensions across both locales and three widths.
- `geometry-baseline/`: separate baseline build used for geometry comparisons.

The Git index still matches `index.txt` byte-for-byte. The shared dashboard spec
still matches its baseline copy byte-for-byte. The baseline already differed
from the live tree at `frontend/dist/mock-api.js`; that unrelated generated
artifact was excluded from the scoped patch and not edited.

The full browser suite has one reproduced monitoring-test failure. Backend
pytest, Pyright and wheel packaging were not run for this frontend-only change.
Independent review passed after a reviewer fixed a platform-font-sensitive
browser assertion. See `check-evidence.md` for the review findings and the
separate pre-existing disclosure-label overflow. Nothing has been staged or
committed; task state remains `in_progress`.
