# Component Tailwind migration evidence

## Scope

This migration places component-specific static presentation on owning JSX `className` utilities. The exact nine stylesheet owners and `styles/index.css` entry remain. Cross-module imports use `@/`; module-internal imports may be relative. Large monitoring and routing test groups live in their feature `__tests__/` folders.

## Migration slices

- Appearance surfaces, seed inputs, notices, swatches and contrast table presentation moved into `features/appearance/AppearanceView.tsx`. `appearance.css` remains comments-only.
- Monitoring dashboard cards, route map, provider/session inspector and retained trace presentation moved into feature components. `monitoring.css` retains the named measured SVG route-flow animation keyframes. Geometry values such as the viewport/trace stage and measured SVG path coordinates remain inline or on their elements.
- Routing inspector, drawer, policy editor, toolbar and configured route presentation moved to JSX utilities. `routing.css` retains finite configured-route trace keyframes.
- Canvas static layout, node 190×56 box, SVG hit rules, canvas toolbar/drawer presentation, scrolling/touch behavior, and responsive positions moved into `RoutingCanvas.tsx` class names. `canvas-geometry.css` retains only the node-drag pulse keyframes plus comments; JS-measured coordinates and CSS custom-property values remain inline.
- Virtual list viewport heights (480px desktop, 280px narrow sessions, 62vh narrow timeline), fixed rows (132px/360px), positioning, scroll and responsive mobile table `data-label` presentation moved into JSX utility classes. `virtual-list.css` is comments-only.
- `base.css` keeps universal box sizing and body reset/type defaults; `index.css` owns the reused native button/input/select/textarea and focus defaults. Component `details`/`summary` and `pre` presentation is expressed on their owning JSX elements. `shell.css` keeps root mount min-width/100dvh. `tokens.css` owns runtime theme variables. `index.css` owns Tailwind configuration and sole import order.

## Behavioral checks

- Browser suite passed 22 synthetic-data Chromium tests on current tree. The responsive matrix covers 320×820, 390×820, 1280×900 and 1430×2511 across all three views, EN/ZH and light/dark without horizontal document overflow.
- Canvas suite checks computed node size (190×56), touch/overscroll rules, actual `elementFromPoint`, real drag, toolbar Fit reachability and layout-only writes.
- Monitoring suite checks both virtual-list fixed bounds at desktop/narrow widths, real session-page scroll/retry, row heights, mobile provider `td[data-label]::before`, trace stage/outcome paint, reduced motion, and keyboard session selection.
- Routing suite checks active/unmatched configured path stroke width/color/dash, finite tracer and reduced-motion static path, canvas drag/Fit and absence of policy writes for layout/preview.
- The CSS structure test checks exactly nine file paths, unique CSS import, geometry utilities in owning markup, row-size utility classes, and no component selectors in feature-owner sheets.

## Remaining CSS allowlist

`index.css`: Tailwind theme/utilities imports, palette mappings, control base and `@source` scan.
`tokens.css`: runtime light/dark seed-derived palette variables.
`base.css`: universal box sizing and body reset/type defaults; `index.css` carries only broadly reused native control/focus defaults.
`shell.css`: root mount sizing.
`monitoring.css`: `monitoring-route-flow` keyframes only.
`routing.css`: `configured-route-trace` keyframes only.
`canvas-geometry.css`: `node-drag-pulse` keyframes only.
`appearance.css`, `virtual-list.css`: comments-only owner files required by the exact directory contract.

The CSS module preserves geometry not represented by CSS rules: values calculated from DOM measurements, viewBox/path points, row coordinate positions, and dynamic colors remain runtime values. These declarations stay where they are computed rather than being encoded as static utility classes.

## Final integrated gates

After additional synthetic tests were added for request-detail loading/error/empty/evidence-unavailable/unknown states, request cursor page loading and focused-row retention, activity failure/retry, theme PUT/DELETE, and policy validate/warning acknowledgement/apply/reset, the integrated verification passed: lint (0 errors, 4 existing Fast Refresh warnings), 186 unit tests, TypeScript/Vite build, 22 browser tests, bundle freshness, 24 focused dashboard gateway tests, Pyright, and frontend-scoped `git diff --check`. Browser mock writes remain per-test opted in; other writes and unexpected origins are rejected.
