# Current baseline and reference findings

## Scope confirmed by the user

Monitoring and appearance may be redesigned visually and interactively. The strategy canvas must receive a complete visual redesign, including nodes, connectors, toolbar and inspector, without changing its interaction logic. These requirements replace the earlier Excalidraw visual direction. The current task remains in planning; no product code has been changed for it.

## Current source findings

Read-only source inspection found:

- `frontend/src/theme/palette.ts:13` sets the default seed to `#3b66d9`. `buildPalette` at line 179 derives both schemes from a seed. `applyPalette` at line 225 writes runtime variables and `data-scheme`.
- `frontend/src/api.ts:251` exposes the existing theme GET/PUT/DELETE interface. PUT stores `{ version: 1, seed }`. A separate persistent theme mode or neutral-primary field is not part of that contract.
- `frontend/src/tailwind.css:38` maps primary to the seed-derived `--accent`; line 46 maps shadcn's accent surface separately. Adopting neutral primary changes the current visual role of the saved seed even if the API remains unchanged.
- `frontend/src/App.tsx:418`, `:445`, `:463` retain view orchestration, API callbacks and theme ownership. Monitoring and appearance should consume those callbacks rather than duplicate transport state.
- `frontend/src/config/RoutingEditor.tsx:293`, `:403`, `:419`, `:476`, `:565` own the draft, selection, DnD, review/apply/reset and mutation flow. Preserve those behaviors.
- `frontend/src/config/RoutingCanvas.tsx:54`, `:75`, `:152`, `:307`, `:419` own layout and viewport state, gestures, the save queue and measured overlays. Preserve hit testing and coordinate conversion, drag cancellation, write ordering and failure rollback.
- `frontend/src/config/canvas.ts:134`, `:220`, `:251`, `:317`, `:349` contain geometry and gesture helpers. Styling work must preserve their inputs, measured occlusion hooks and data attributes. Node dimensions cannot change through CSS alone without matching the coordinate contract.
- `frontend/src/styles.css:117`, `:131`, `:155`, `:175` mix paint with geometry. Existing global controls in `frontend/src/tailwind.css:6` can interfere with component classes. Audit computed styles before removing legacy selectors or adopting a reset.

These line references describe the inspected working tree, including existing uncommitted edits, not just HEAD.

## Reference evidence

Magpie reference: https://usemagpie.ai/#routing. Existing source and browser captures are recorded in `.trellis/tasks/archive/2026-09/09-27-dashboard-ui-layout-redesign/research/magpie-reference-capture.md` and `.trellis/tasks/archive/2026-09/09-27-dashboard-visual-language/research/reference-analysis.md`. They describe restrained neutral surfaces, compact tabs, bordered nodes and equal-width branching SVG connectors. The demonstration's account quotas, counters, failover states and autoplay are not JEV evidence and must not be copied as runtime facts.

The shadcn theming page was fetched during this planning turn: https://ui.shadcn.com/docs/theming. It recommends semantic CSS variables and a neutral base. Its current example names `base-nova`; related older component documentation and this project's components use `new-york`. The word "default" therefore describes the requested visual direction, not authorization for a blind registry migration.

The fetched neutral scaffold uses `--radius: 0.625rem`, light primary `oklch(0.205 0 0)` and dark primary `oklch(0.922 0 0)`. Its standard `.dark` selector must be adapted to the project's `data-scheme`, not added as a second competing theme state.

## Resolved product decision

The user chose to retain configurable accent colors. Use the saved seed as the action/selection accent on neutral surfaces; keep theme persistence and API unchanged. Changing storage or deleting a saved theme is not authorized.

## Verification plan inputs

- `npm --prefix frontend run lint`
- `npm --prefix frontend run test`
- `npm --prefix frontend run build`
- `sh scripts/build-frontend.sh --check`
- Relevant dashboard/auth/configuration pytest coverage, followed by broader gates as warranted by changed files.

Existing safe browser checks used an isolated Vite server and intercepted `/v1/` requests with synthetic records, fake credentials and a fabricated catalog: `.trellis/tasks/archive/2026-09/09-24-dashboard-routing-workflow/research/browser-verification.md`. Those earlier scripts were temporary, so a reproducible harness needs to be checked or added during implementation. Do not inspect the real records database, configuration secrets, logs or running gateway for visual testing.

Browser acceptance must cover desktop and narrow layouts, EN/ZH, both schemes, reduced motion, real pointer hit testing, focused virtual rows, detail loading/error/empty states, policy review/apply, and layout-only saves. Pure helper or server-rendered tests are insufficient for canvas gestures.
