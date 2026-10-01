# CSS cascade migration record

## Scope

This pass relocates CSS under `frontend/src/styles/` and routes all app styling
through `styles/index.css`. It preserves CSS declarations and their effective
load order. No TSX/TS application behavior, backend/API contract, canvas
geometry, virtual-list dimensions, or pointer hit regions are in scope.

## Pre-migration snapshot

The snapshot lives under `research/css-migration-baseline/`. `manifest.json`
records byte lengths and SHA-256 checksums for every source CSS file, the entry
point and theme contract test, plus the built CSS bundle. Source CSS checksums:

| Source | Bytes | SHA-256 |
|---|---:|---|
| `src/tailwind.css` | 2,552 | `85aac57c6f8b403104b012d2db21e928ae3a9df4d4a343802df7852f91bb386e` |
| `src/styles.css` | 22,873 | `35d7c48d6daaf1c875fd4548e08ea64c12ab0ddea825e7c01ae308585eb6488a` |
| `src/monitoring/monitoring.css` | 5,610 | `739f7adec1a6aaa720cb14393cf68596b9974805af25175c06504923064d4c07` |
| `src/appearance/appearance.css` | 2,166 | `f651e62388e620ea68d6c336ba88fe249cdf907582f8685a44c506b3c1a7ba42` |
| `src/config/configured-route-flow.css` | 687 | `120b78c439c5bf8fdc88a007d712cfaaab33bc3f04998478bfc0f9406171c758` |
| `src/config/routing-editor-presentation.css` | 12,241 | `6c20ff355fe1aa6d504d47a1f5aea2d550f4fe6a1bc1368b5c6666b41f00deaa` |

The built baseline bundle was 54,842 bytes with SHA-256
`57f8149751c75adbe71a1b93cea3a407095c07fb295827e9a00dd6f758f60060`.
The checked-in research snapshot has its own manifest and exact file copies for
independent comparison.

## Cascade and split map

The original order was view-owned CSS imports first (`AppearanceView`,
`ConfiguredRouteFlow`, `RoutingEditor`, `MonitoringView`), then the Tailwind
entry in `main.tsx`, then `styles.css`. That last unlayered sheet overrode
component styles in several places. The new `styles/index.css` preserves that
ordering: the four view sheets are imported first, Tailwind follows, and the
legacy rules are split into source-ordered numbered purpose slices. The slices
are grouped by broad purpose (`base-*`, `shell-*`, `routing-*`,
`canvas-geometry-*`, `virtual-list-*`, and `monitoring-*`) because the old
stylesheet interleaved these concerns. The numbered suffixes are cascade-order
continuations, not a final one-file-per-view naming scheme. Some blocks cross
those categories: for example, `canvas-geometry-06.css` contains responsive
canvas tools and drawer rules. Consolidating category slices or renaming files
without tracing their imports would make the order harder to audit and could
change equal-specificity overrides. A later Tailwind conversion can retire or
rename slices as their residual rules shrink. Tokens live in `tokens.css`,
imported at the legacy location after Tailwind to preserve precedence.

The Vite/Tailwind extraction previously resolved utilities by scanning from
`src/tailwind.css`. Since the Tailwind entry moved, `@source "../"` explicitly
scans `src/` relative to `styles/index.css`; comparing the built utility layer
before and after found identical rule content and order.
Preflight remains absent. The only JavaScript CSS import is
`src/main.tsx -> ./styles/index.css`.

`canvas-geometry-*.css` contains original rules and media queries copied from
`styles.css` without changing declaration values. The responsive virtual list
height declarations remain verbatim in `virtual-list-*.css`. All 907 PostCSS
rule, at-rule, and declaration nodes retain their sequence and values. Four
source comments were omitted during the split; they have no CSS effect.

## Verification

- Pre-migration `npm run build` passed; baseline browser matrix (recorded by the
  task owner) had 6 passing tests and the unit suite had 181.
- Current `npm run lint`: passed with 4 existing Fast Refresh warnings in
  `src/i18n.tsx`.
- Current `npm test`: 22 files and 181 tests passed.
- Current `npm run build`: passed. Vite continues to report the existing JS
  chunk size warning (514.57 kB).
- Current `npm run test:browser`: 6 tests passed, including real canvas pointer
  drag, route explanation/reduced motion, pagination retry, keyboard selection,
  and 320/390px EN/ZH overflow coverage.
- Current `sh scripts/build-frontend.sh --check`: passed (bundle current).
- `git diff --check`: passed.
- A fresh PostCSS comparison of the old and migrated legacy slices found all
  213 original CSS rules and 907 non-comment nodes in the same sequence, with
  the same selectors, at-rules, declarations, and values. The baseline and
  current built bundles each contain 222 Tailwind utility rule nodes, identical
  in content and order; their 213 distinct parsed utility selectors match.
  An earlier selector-string comparison counted 209 because it used a different
  counting method. Built
  CSS sizes were 54,842 bytes before and 58,190 after (current SHA-256
  `0526db003f2159cfb53ded02b21bcaf624853a31809df47863d4279db22ac997`).
  The Tailwind plugin places its generated property-support block at the start
  of the consolidated entry; no source application rule/value changed.
- The final `index.css` references all 31 stylesheet files under `styles/`
  exactly once; no CSS import remains in the view TSX files. The 26 late legacy
  slices reproduce the original 213 PostCSS rules in exact semantic sequence.

The baseline artifact is retained to allow a reviewer to verify source hashes,
rule ordering, and declarations without relying on this summary. This CSS-only
step establishes location and cascade boundaries; the separate Tailwind-first
migration remains open because the legacy slices still include ordinary
presentation declarations beyond theme and geometry-sensitive CSS.
