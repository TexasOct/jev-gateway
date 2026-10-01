# Nine-file CSS consolidation

## Boundary and source

This pass changed only `frontend/src/styles/**`, the CSS source contract in `frontend/src/ui/theme-contract.test.js`, and this record. Application TSX, API and backend code remain untouched. The immediately preceding 32-file intermediate state, documented in `css-migration.md`, is the visual and interaction baseline. The earlier source snapshots under `research/css-migration-baseline/` were also checked. `src/main.tsx` was already importing only `./styles/index.css`; its source was not changed.

`src/styles/` now has exactly nine files. `index.css` owns Tailwind theme/utilities, the custom dark variant, the scoped control base and eight purpose-specific imports. Preflight remains disabled and `@source "../"` still scans `src/`. `tokens.css` keeps the original late root defaults and `data-scheme` color-scheme rule. `base.css` has shared element/state rules; `shell.css` has header and page-shell rules; `monitoring.css` has monitoring and retained route trace; `routing.css` has configured flow and policy-editor presentation; `canvas-geometry.css` has canvas dimensions, scroll, overlays and hit regions; `appearance.css` has theme-editor presentation; `virtual-list.css` has fixed window and mobile table rules. No numbered continuation or extra feature/Tailwind sheet remains.

## Cascade method

The intermediate entry interleaved purpose slices because it preserved original source order. Combining by filename and merely reordering the imports would have changed equal-specificity winners. Each old declaration was retained without changing its selector, property, value or enclosing media rule. I parsed the baseline source files and the eight destination sheets with PostCSS: 375 rules and 1,146 declarations before and after, with a zero-difference multiset of selector/at-rule/property/value signatures. The same selector/at-rule/property final-value map has zero differences. This does not alone prove the cascade (different selectors can compete), so I compared rendered computed styles below. Editor paint selectors are scoped by `.workflow-workspace` and retain their higher specificity than the generic canvas geometry selectors, even when `canvas-geometry.css` follows `routing.css`. The virtual-list mobile selector retains its own media condition; token defaults still load after Tailwind. No `@layer` was imposed on the legacy unlayered selectors, which would have reversed their relationship with Tailwind utilities.

The older source copies of Tailwind, appearance, monitoring, configured-flow and editor presentation rules remain verbatim within their new owners except the editor stylesheet's stale location comment. The previous bundled CSS contains 250 Tailwind utility rules; the new bundle has the same 250 rule bodies in the same order, including the generated support rules. Utility rule-content SHA-256 for each is `29fcdde0fba2a2673fe4ddd3cb32472d54d6d63047e8b2578907719e920a8c5f`.

This structural pass preserves ordinary presentation rules as well as geometry rules. `routing.css` is still 723 lines and `monitoring.css` is 193 lines. The larger Tailwind-first reduction remains open: moving those presentation declarations into JSX utilities would require changing TSX, explicitly outside this dispatch. Removing them now would change the current visual result, so they have not been deleted or replaced with one giant global sheet.

## Rendered comparison

I built the intermediate state, served its static bundle on an isolated Vite preview with the existing synthetic API interception, and captured computed styles for monitoring with a selected request, strategy with a mounted canvas/expanded drawer, and appearance. Each was sampled at 320×820, 390×820 and 1280×900, in both light and dark schemes and with reduced motion. After consolidation, I rebuilt and repeated the same captures. Across 18 snapshots, 4,506 matched DOM elements and 256,842 checked computed property values had **zero differences**. The sample covered layout and box dimensions, overflow/scroll, pointer-events, touch-action, colors/background/borders, typography, animation and transition properties, palette variables, and `::before` content. No snapshot had document-level horizontal overflow. This is a computed-style comparison, not a full visual diff of all states, hover or active animations.

Specifically, the question canvas node remained 190×56 CSS pixels with `touch-action: none`; the canvas scroll surface kept `touch-action: none`, and the narrow toolbar kept `touch-action: pan-x`. Forty-two protected canvas-node/virtual-list bounding-box comparisons were unchanged. At 320/390px, the session virtual-list window remained 280px and the request window 62vh; at desktop both windows remained 480px. Their computed `height`, `min-height` and `max-height` values matched before and after. The browser tests additionally exercised real canvas `elementFromPoint`/drag, list pagination and keyboard focus, configured path/reduced motion, and EN/ZH responsive overflow. They do not establish every pointer/hover combination or the full visual acceptance matrix.

## Verification

- `cd frontend && npm run lint`: exit 0, four existing Fast Refresh warnings in `src/i18n.tsx`, zero errors.
- `cd frontend && npm test`: 23 files, 184 tests passed, including the new exact-nine-files, sole-import and protected-dimension source test.
- `cd frontend && npm run build`: passed. Existing JavaScript chunk-size warning persists (516.61 kB).
- `cd frontend && npm run test:browser`: 6 Chromium tests passed after stopping the temporary baseline preview process on port 4178. The first attempt was blocked by that owned preview occupying Playwright's strict port, not by a test assertion; rerun passed.
- `sh scripts/build-frontend.sh --check`: passed, bundle current.
- `git diff --check`: passed.

The temporary snapshot/build scripts and output lived under ignored `frontend/node_modules/.cache` and `/tmp`, not in application source. No commit was made.
