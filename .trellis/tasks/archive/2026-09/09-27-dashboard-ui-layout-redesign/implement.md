# Implementation plan: full frontend overhaul

## Baseline and gates

The previous visual iteration and interaction clarification are implemented as uncommitted work. The full overhaul is active. Preserve the index and working tree, do not reset or commit automatically. Before each dispatch, verify dirty paths and file ownership; related Mixboard/global-canvas tasks may overlap strategy files.

## Ordered work

- [x] Establish and record baseline: frontend lint, existing unit/component tests, typecheck, build, and dashboard bundle freshness check. The pre-install results and browser-config gap are recorded in `research/frontend-test-baseline.md`.
- [x] Define browser-test configuration and synthetic API setup/fixtures in `frontend/tests/` before adding interaction specs. The first six Chromium checks cover pagination restoration, animation/reduced-motion state, keyboard operation, real canvas hit testing and dragging, and 320px/390px responsive layout. Browser tests do not connect to a live gateway; remaining matrix gaps are documented in the baseline.
- [x] Create a behavior-preserving CSS migration baseline and the sole `index.css` entry point; the 32-file intermediate layout and cascade evidence are documented in `research/css-migration.md`.
- [x] Collapse intermediate styles into the exact nine-file `src/styles/` target without changing computed geometry, hit areas, list sizing, token precedence, or Tailwind utility output. Evidence is in `research/css-consolidation.md`; independent check passed.
- [x] Complete the latest user's exact target tree: `src/app/`, `src/features/{monitoring,routing,appearance}/`, `src/shared/{api,i18n,theme,ui}/`, nine files under `src/styles/`, and split synthetic browser fixtures/specs. API type extraction and routing component placement are done. Cross-module imports use `@/`, and larger monitoring/routing test suites are grouped under their feature `__tests__/` directories; smaller unit/component test sets remain beside their module.
- [x] Extract state from `App.tsx` after the baseline and initial CSS/import migration; preserve orchestration and move it into `src/app/App.tsx` in the final relocation phase.

- [x] Capture the earlier iteration's source hashes and identify dirty paths. Preserve those edits as the baseline.
- [x] Confirm ownership and integration boundaries for shared shell, view components and coupled canvas files.
- [x] Install Tailwind v4 with the Vite plugin; preserve `/dashboard/` base and `../jev_gateway/static` output.
- [x] Apply shadcn New York neutral surfaces, type scale, radii and control-state treatments consistently across all views, preserving dynamic JEV seed behavior and both schemes.
- [x] Migrate shared shell/chrome and common controls to Tailwind and selected shadcn-derived components. Keep only geometry/theme-critical CSS and remove duplicate global selectors after checking computed styles.
- [x] Migrate monitoring and appearance views without changing their state or data contracts.
- [x] Complete the Excalidraw-inspired strategy workspace and configured-policy route diagram/motion. Preserve current canvas operations, graph projection, layout persistence, DnD context and explicit policy review/apply flow.
- [x] Finish the user's component-utility refinement: migrate static canvas, SVG, pointer-hit, trace and virtual-list rules to the owning component `className`. Preserve nine CSS paths; residual CSS holds only shared defaults, theme/Tailwind definitions and named keyframes. Evidence and computed browser assertions are recorded in `research/component-tailwind-migration.md`. Independent R6 reviewer passed and confirmed utilities in the production bundle.
- [x] Integrate the final class/token system across appearance, monitoring, routing, canvas, virtual list, shell and base. English/Simplified Chinese labels remain; final focused and responsive state review remains part of acceptance gates.
- [x] Run frontend lint/tests/typecheck/build, bundle freshness, focused dashboard auth/CSP/configuration tests, full Python suite, Pyright/package build and isolated browser checks for pointer, focus, pagination, route/trace motion, theme writes, EN/ZH, light/dark, desktop/tall/mobile viewports. Latest integration: lint 0 errors and 4 existing Fast Refresh warnings; 186 unit tests passed; 22 synthetic browser tests passed; frontend build/bundle freshness passed; 24 focused gateway tests passed (67 deselected); full Python suite 565 passed; Pyright 0 diagnostics; `uv build` passed. Independent checker reviewed nine CSS files, sole import, Tailwind output, geometry and state styling. Remaining broader UX gaps are documented in `research/acceptance-test-gaps.md`.
- [x] Update `.trellis/spec/backend/dashboard-routing-config.md` with the final source paths, Tailwind/component CSS ownership and geometry boundaries.
- [ ] Prepare a scoped commit plan and request confirmation before committing; exclude unrelated changes and generated bundle.

## File ownership

| Owner | Exclusive files | Boundary |
| --- | --- | --- |
| Integration | `frontend/package*.json`, `vite.config.ts`, `tsconfig.json` if needed, `src/main.tsx`, `src/app/**`, `src/styles/**`, `src/shared/i18n/**`, specs/task docs | One writer for toolchain, shell, palette integration, CSS entry/load order and final bundle. |
| Monitoring | `src/features/monitoring/**`, component and model tests | Preserve the finalized API contract, VirtualList and RouteTrace behavior. |
| Appearance | `src/features/appearance/**` | Seed/API state stays in `src/app/`. |
| Policy-flow helper | `src/features/routing/ConfiguredRouteFlow.tsx`, `model/configured-route-flow.ts`, tests in routing `__tests__/` | Pure draft/config projection and explanatory animation; no network/write state. |
| Strategy | `src/features/routing/RoutingCanvas.tsx`, `RoutingEditor.tsx`, `components/CanvasNodeContent.tsx` and `model/**` | One owner for canvas/inspector/toolbar integration and geometry-sensitive behavior. |

## Verification commands

```bash
cd frontend && npm run lint && npm test && npm run build
cd .. && sh scripts/build-frontend.sh --check
uv run pytest -q tests/test_gateway.py -k 'dashboard or canvas_layout or configuration'
uvx pyright
uv build
```

Full frontend and backend suites, exact release-packaging checks, and browser assertions are required before claiming completion; if a tool or fixture cannot run, report the gap instead of marking it passed. Check `git diff --check` and task manifests. Do not run tests against the live gateway or send upstream traffic.

## Rollback and risk points

- Tailwind Preflight or old unlayered global CSS can override new utilities. Start with Preflight disabled and prove each migrated component's computed style before removing its old selector.
- A CSS or DOM change around canvas controls can break `elementFromPoint`, inspector anchoring or Fit calculations even when screenshots look correct. Verify hit testing at zoom and on narrow screens after strategy integration.
- Model-pool edges are eligibility, not simultaneous requests. Trace only configured first-match paths, with no traffic counters or health claims.
- Keep policy mutations and layout saves separate. Review payload must remain complete and apply explicit; animation and layout drag cannot write routing overlay.
- The current worktree contains uncommitted redesign changes; never reset, overwrite or automatically commit them outside the approved scope.
