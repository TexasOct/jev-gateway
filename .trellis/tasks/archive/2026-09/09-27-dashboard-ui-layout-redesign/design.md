# Design: Excalidraw-inspired dashboard workspace

## Scope and approvals

The user requests a full frontend visual redesign inspired by Excalidraw, keeps monitoring as a structured inspector, selects Magpie-inspired configured-policy-only routing flow with motion, approves Tailwind as the main styling system, permits selective shadcn/ui controls, and chooses to retain all existing canvas interactions without undo/redo. The user approved the prior plan and implementation began; this revision refines that work toward shadcn's New York design language. Preserve all in-flight and uncommitted changes.

## Architecture and ownership

### Source and test structure

The latest user-provided tree is the final acceptance target. Earlier no-move language applied only to the first staged pass and is superseded. Move the root `App.tsx` into `src/app/`, all monitoring/routing/appearance code into `src/features/`, and API/i18n/theme/ui into `src/shared/`. Put pure-function and component tests beside source when there are only a few; group larger suites in a feature-owned `__tests__/` directory. Move implementation helpers omitted from the compact tree into their owning `components/` or `model/` directories, with their tests. Keep `main.tsx` as the only root source file. Use the TypeScript/Vite `@/` alias at cross-module boundaries, and relative imports only for files within the same module. Preserve original behavior and API contracts, including API memory-only credentials. Retain the existing formal Playwright configuration and update it for the named specs.

Sequence: (1) preserve the already recorded pre-migration baseline; (2) finish the nine-file CSS consolidation while verifying computed styles, utility generation, geometry and virtual-list dimensions; (3) relocate source and tests with imports updated atomically by ownership slice; (4) move API and monitoring files after verifying the interface and 401 semantics against tests; (5) apply `@/` imports across module boundaries and collect larger unit/component test suites under owning `__tests__/` directories; (6) finish split browser fixtures/specs and the full acceptance matrix. Run lint, tests, build and browser checks at each boundary. Pause a conflicting slice rather than overwrite concurrent work.

### Stylesheet boundaries and loading

All maintained application CSS belongs under exactly nine files in `frontend/src/styles/`: `index.css`, `tokens.css`, `base.css`, `shell.css`, `monitoring.css`, `routing.css`, `canvas-geometry.css`, `appearance.css`, `virtual-list.css`. `index.css` is the sole CSS entry with Tailwind theme/utilities and controls import order. The user now wants even static canvas and virtual-list geometry, SVG paint and pointer-hit presentation on the owning JSX elements as Tailwind utilities. Keep CSS only for frequently reused global element/control defaults, runtime theme variables, Tailwind declarations and named keyframes. Keep all nine owner files, including an empty/comments-only file when rules migrate. Dynamic JS-measured coordinates and data-derived colors remain inline or element-level custom properties. Preserve existing calculated dimensions, stacking, pointer hit areas, scroll/focus behavior and reduced-motion semantics with real-browser checks at desktop, tall, 390px and 320px; tests that previously asserted CSS text must assert emitted class behavior and browser measurements instead. Do not introduce a new giant stylesheet, `@apply` pseudo-components or generic selector-to-class registry.


Keep React and the current single-page view state. `App.tsx` remains the API/auth/theme orchestration boundary; `MonitoringView`, `RoutingEditor`/`RoutingCanvas`, and `AppearanceView` own their presentation. The previous uncommitted redesign is the baseline, not a disposable prototype. No backend, catalog or evidence changes are planned.

An integration owner exclusively edits the application shell, `main.tsx`, CSS entry, i18n, Vite/package/lock/TS configuration and task/spec artifacts. Monitoring owns only `monitoring/` presentation and tests. Appearance owns `appearance/`. The coupled strategy editor and canvas interaction files must have one strategy owner. A new policy-path presentation helper may be developed independently under a new `config/` filename, then integrated by the strategy owner. No concurrent edits to the same file.

## Unified design language and Tailwind migration

Use shadcn/ui New York's neutral surfaces, compact typography, `rounded-xl` Cards, `rounded-md` controls, restrained borders and limited elevation as the target design language. Keep JEV's theme seed as the source for its primary action and semantic status colors. Map shadcn's subtle accent surface separately to `--surface-alt`; do not replace the seed contract with a fixed black primary.

Tailwind v4 with `@tailwindcss/vite` is installed while preserving Vite's `/dashboard/` base and `../jev_gateway/static` output. Use utilities as the main styling system. Preserve JEV's dynamic variables and `data-scheme`; the Tailwind map does not create another theme store.

Use the small set of project-owned shadcn-derived Button/Card/Separator controls. Avoid blind CLI scaffolding or a second global reset. Tailwind Preflight is not imported; a scoped component/control base establishes the needed element behavior while utilities own per-component variants. Continue migrating the shell and views, then remove obsolete global selectors only after browser computed-style and interaction checks. Retain dedicated CSS only for runtime theme variables, broadly reused element defaults and named keyframes; put static graph/port/SVG/pointer/list dimensions in component Tailwind utilities and keep measured dynamic coordinates inline. No remote assets or browser storage.

The shared shell becomes a compact destination switcher with contextual refresh/settings controls. Keep monitoring first, strategy second and appearance third. Use visual grouping instead of large outlined panel stacks. Monitoring stays information-first, while the strategy view is a spacious workspace with floating tool groups and a contextual inspector. Responsive layouts stack or allow internal scrolling; no canvas-wide scale transform on control overlays.

## Configured-policy flow diagram

`RoutingEditor` owns one `RoutingDraft`; `workflowEdges(draft, config)` is the sole graph projection. The branching visual reads that projection and node identities: questions, ordered rules, fallback, labels and models. It must not persist another topology, infer rule order from node coordinates or create unsupported connections. Show rule match and unmatched/fallback with distinct line/label treatments, and label model edges as pool membership rather than broadcast. The diagram visibly distinguishes pending draft changes from applied policy.

The route explanation is a user-triggered selection of an existing rule/branch. Highlight that configured path and animate a short, finite tracer along its visible edges. Animation communicates policy structure, not a measured request. For `prefers-reduced-motion`, immediately render the full highlighted path and equivalent explanatory text without moving a packet. Switching selection, changing the draft, closing inspector, or unmounting cancels old animation. Keep the existing retained-request `RouteTrace` separate; it continues to replay retained fields only.

## Interaction contracts

Preserve current select/pan tools, marquee and layout-only multi-select/move, zoom/Fit, node/edge keyboard alternatives, supported connections, inspector and bottom drawer. Reorganize tool grouping and styling without turning drag or viewport saves into policy edits. Canvas layout remains `{version:1,nodes,viewport}` in the separate write path, with unscaled coordinates and existing race/rollback behavior. Inspector and toolbar must continue to expose measured `[data-canvas-occlusion]` bounds for Fit/reveal and hit testing.

Policy edits stay in the existing draft mutation functions. Validation creates a review payload; warnings require acknowledgement; only explicit apply sends the policy PUT. Reset retains its confirmation. Existing read-only/403 and auth behavior is unchanged. No undo/redo history or persistent draft is added.

Monitoring's list/detail remains cursor-based and virtualized. Keep session preview explicitly unselected, recorded outcome labels, request loading/error/empty distinctions and advanced evidence disclosure. Theme settings retain seed preview/save/reset and measured contrast.

## Compatibility, rollout and rollback

Tailwind and the selected shadcn-derived component dependencies are the only toolchain additions. Preserve API, backend schema, browser storage keys, routes, configuration behavior, `/dashboard/` asset base/output, same-origin CSP and memory-only credentials. Changes can be rolled back by reverting only redesign-owned frontend files and restoring package manifests; generated `jev_gateway/static/` assets remain untracked and are rebuilt after source changes.

## Verification

Run frontend lint, unit tests, TypeScript/Vite build and `scripts/build-frontend.sh --check` after integration. Run focused gateway/dashboard CSP/auth/asset tests and full project gates where relevant. Use an isolated synthetic server, not the user's running gateway. Cover desktop/tall/390px/320px, EN/ZH, light/dark and reduced motion. Verify no page overflow, actual pointer hit testing and drag, keyboard focus, virtual pagination, route explanation cancellation, no policy PUT from layout or playback, and validate/review/explicit apply for policy changes.
