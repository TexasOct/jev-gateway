# Architecture findings for the frontend overhaul

## Recommendation and research limits

Keep repo-owned React components and native CSS for this overhaul. Excalidraw-style floating tool groups and contextual inspectors do not require Excalidraw, shadcn/ui, a drawing engine, or a new graph execution model. Preserve the current policy and transport modules while redesigning their presentation and explicitly approved interactions.

shadcn/ui can be introduced into this Vite/React app, but it requires a coordinated styling/toolchain migration. Its official docs support Vite and React 19; compatibility with this exact dependency set has not been installed or tested. The current manifest declares React/React DOM `^19.3.0`, Vite `^8.3.0`, TypeScript `^6.0.3`, DnD Kit, and chroma-js. There is no Tailwind, import alias, or `components.json`. Native components are the lower-risk choice under the existing no-new-dependencies requirement.

This is source/documentation research. No code, package files, task planning artifacts, generated assets, or runtime configuration were changed. No live gateway data was read, and no build or browser checks were run. `task.py current --source` returned none; the explicitly assigned task exists with `status: planning`. Only this research file was written.

## Conflicts to resolve before implementation

- The task PRD's opening revision authorizes planning for a complete visual/interaction overhaul, with structured monitoring and a configured-policy strategy diagram. Its later requirements/key decisions still prohibit new dependencies and preserve existing interactions. `design.md`, completed `implement.md`, and `research/design-language.md` remain presentation-only, freezing navigation order, geometry, handlers, and motion. Replace those stale boundaries through the parent planning review before implementing broader changes.
- `09-25-mixboard-strategy-editor/design.md` owns selection, transient zoom, layout-only multiselect, connection compatibility, and advanced accessible editors. Excalidraw inspiration cannot add arbitrary DAG links, an AI composer, collaboration, or bulk policy mutation.
- `.trellis/tasks/archive/2026-09/09-26-global-routing-canvas/design.md` owns the full-height workspace, floating toolbar, anchored inspector, bottom drawer, Fit/reveal geometry, drag cancellation, and layout write sequencing. Moving toolbar/inspector/drawer controls or changing dimensions requires a new shared geometry contract. Some acceptance checkboxes remain open even though later research reports fixes and checks.
- `09-27-dashboard-visual-language/design.md` and PRD explicitly prohibit strategy interaction changes, new dependencies, geometry changes, and automatic motion. The new strategy animation is a separate scope and must not silently replace the retained-request replay contract.
- `research/excalidraw-overhaul.md` still lists monitoring mode as undecided, although the PRD now selects a structured inspector. `research/magpie-routing-analysis.md` records the resolved configured-policy-only diagram. Use those latest decisions.
- Prior documents say appearance markup lives in `App.tsx`; the current working tree already extracts it into `appearance/AppearanceView.tsx`. `MonitoringView.tsx` and its CSS are also extracted and untracked. PRD text describing a clean tree is stale. Preserve the current baseline, including uncommitted shared-file edits.

## State and API boundaries

| Area | Current owner and contract | Redesign risk / required boundary |
| --- | --- | --- |
| Shell and data loading | `src/App.tsx` owns views, auth UI, sessions/providers, selected session/request, generation/abort guards, configuration reads, theme state. | Extract chrome through props; avoid duplicating fetch effects or moving state into panels that remount on disclosure. |
| Policy draft | `config/RoutingEditor.tsx`, pure `config/draft.ts`. | Keep a single draft owner and existing mutations. New inspectors/forms receive commands; they do not maintain independent policy copies. |
| Graph projection | `workflowEdges(draft, config)` in `draft.ts`; connection classification/mutations in `canvas.ts`. | Derive routes from the same draft. Do not persist independent edges or infer rank from node position. |
| Layout | `RoutingCanvas.tsx`, `canvas.ts`, `/v1/dashboard/canvas-layout`. | Keep strict version-1 `{version,nodes,viewport}`; integer unscaled positions; zoom/tool/multiselect remain transient. Layout saves must not apply policy. |
| Retained evidence | `monitoring/MonitoringView.tsx`, `RouteTrace.tsx`, pure playback/trace helpers. | Keep session preview, selected-detail loading, unknown outcome, unavailable evidence, and errors distinct. Policy animation has a different meaning from recorded-request replay. |
| Appearance | `appearance/AppearanceView.tsx`; seed/persistence in `App.tsx`; palette math in `theme/palette.ts`. | Keep preview/save/reset and measured contrast; do not substitute a static theme or local-storage theme system. |

### First-match policy diagram

`draft.ts` projects questions into the first rule (or fallback when no rules), each ordered rule into a match label and the next unmatched rule/fallback, then label pools into configured models. `jev_gateway/strategy/matrix.py` iterates the rules and stops at the first match. Pool edges describe eligibility/membership, not simultaneous dispatch, observed share, retry order, or probability. Explicit-model label membership is read-only; tag-resolved membership preserves other strategy tags and prevents removing the last resolved member.

Use equal-weight branches and clear first-match ordering. A selected configured branch may receive short explanatory motion, with a static reduced-motion equivalent. Label draft versus applied policy clearly. Do not animate all pool members as if a request was broadcast, add traffic percentages/counts/Sankey widths, or mix provider outcomes into policy projection. If an applied-policy preview is added, derive it separately from `draftFromConfiguration(config)` and label it explicitly.

### Draft, validation, review and apply

`RoutingEditor` computes `diffSummary`, captures a complete overlay via `toOverlayPayload`, calls POST `/v1/routing/configuration/validate`, and stores the exact reviewed payload/diff/warnings. Editing is disabled during busy/review/reset confirmation. Warnings require acknowledgement; PUT applies only the reviewed payload. DELETE reset has separate confirmation. Preserve those distinctions even if review moves to a new panel.

`toOverlayPayload` emits the complete rule list, questions/fallback, and model overrides relative to baseline tags/priorities. A partial patch based on the current overlay can erase earlier overrides. Backend PUT revalidates under `reload_lock`, writes atomically, reloads, and restores prior overlay/catalog on failure (`jev_gateway/gateway.py`). Validation itself does not activate policy.

The current API has no expected-hash/ETag field or review token binding validate to apply. Backend serialization and revalidation do not prevent another operator's changes being overwritten. `RoutingEditor` is keyed by `config_hash`; switching away unmounts it, and refreshing/reloading a changed hash can discard local draft and UI state. Draft retention, navigation guards, undo/redo, conflict resolution, and scoped refresh need explicit designs. Do not add browser draft persistence or promise multi-user safety.

### Canvas geometry and save races

The current canvas uses a scrollport and transformed node layer, fixed 190×56 cards, SVG ports, pointer capture, inverse zoom mapping, marquee/group bounds, and slot-based `rule-N` layout reconciliation. Inspector and toolbar placement read `.app-header`, `.workflow-workspace`, `.routing-canvas-scroll`, `[data-canvas-node]`, and `[data-canvas-occlusion]` DOM boundaries. Moving an overlay into a portal or renaming these hooks can make Fit/reveal and hit-testing wrong even when screenshots look correct. Advanced DnD controls must retain the editor's `DndContext`.

The serialized layout write queue invalidates queued revisions on failure, releases an active drag before rollback, and restores the last saved layout without rolling back the policy draft. Node drag locks scroll offsets and prevents wheel scrolling during capture. Preserve those guards. Layout persistence is shared last-writer-wins, with no per-user isolation or server revision check. Current `canEdit` also locks layout writes when policy edits are disabled/reviewing; do not infer a separate writable-layout permission.

`.trellis/tasks/archive/2026-09/09-26-global-routing-canvas/research/layout-race-followup.md` supersedes earlier pre-fix race findings. It reports delayed-failure browser replay and controlled scroll-lock checks, but native OS/trackpad wheel behavior remained a limitation. That evidence does not verify a new interaction design.

### Monitoring, auth and localization

`VirtualList.tsx` uses fixed 132px session and 360px request rows, windowing, focused-row retention, keyboard session navigation, and near-end automatic pagination. A larger request inspector inside a row will clip unless bounded/internal scrolling is retained or virtualization is intentionally redesigned. Keep `App` generation/busy/abort guards and cursor deduplication. Rendering the latest-session preview does not select/fetch detail; a missing outcome means unknown, never in progress. `RouteTrace` is user-started retained-field replay with cancellation and reduced-motion behavior, not routing execution.

`api.ts` holds the Bearer credential in module memory and sends `cache: no-store`; never put it in URLs, cookies, either browser storage, persisted drafts, or layout files. Only the validated `jev-dashboard-locale` may persist locally. Reads can work without a configured key; config/layout/theme writes return `403 config_writes_disabled` without `gateway.api_key_env`. Central `App.run` clears credentials on 401, but editor/layout catch paths currently show their own errors; a new menu must not assume every API error globally triggers reconnect.

Keep `LocaleProvider`, typed `t` keys, English/Chinese parity, accessible labels, and locale-aware formatting (`i18n.tsx`). `App` and monitoring also contain paired inline locale copy. New shared controls should accept localized labels rather than introduce another translation provider. CSP permits local bundled scripts/styles and blocks remote fonts/assets; do not add external runtime design resources.

## If shadcn/ui is explicitly approved

Use a one-time integration owner. Do not run project scaffolding or blindly follow the instruction to replace the global stylesheet.

1. Add Tailwind v4 and `@tailwindcss/vite`; merge the Tailwind plugin into `frontend/vite.config.ts`. Preserve `base: "/dashboard/"`, `outDir: "../jev_gateway/static"`, `emptyOutDir`, and source-map settings.
2. Add `"paths": { "@/*": ["./src/*"] }` to the existing single `tsconfig.json`; add the matching absolute Vite alias. Do not invent `tsconfig.app.json`. Official shadcn Vite docs still show `baseUrl`, but TypeScript 6 deprecates it. Use paths without `baseUrl`. If using Node URL/path helpers for the ESM Vite alias, add `@types/node` and use lint-compatible imports instead of copying an undeclared `__dirname`.
3. Create `components.json` with `rsc:false`, `tsx:true`, Tailwind v4 `config:""`, the actual CSS entry, `cssVariables:true`, and aliases for components/ui, utils, lib, and hooks. Choose and lock a registry style and primitive family. The current manual page's example uses `base-nova`; do not assume historical defaults.
4. The current official manual recipe lists `shadcn`, `class-variance-authority`, `cn`, `lucide-react`, and `tw-animate-css`, with CSS imports for Tailwind, `tw-animate-css`, and `shadcn/tailwind.css`, and `export { cn } from "cn"`. It differs from older clsx/tailwind-merge recipes. Selected interactive components add their own primitive dependencies; inspect their generated registry output. Icons/animation packages can be avoided only by taking ownership of the replacement component code.
5. Run the existing-project `init`/selected-component `add` steps only after approval, then review every changed file and lockfile. No Next.js/RSC framework conversion is needed. No CLI or package installation was performed for this research.
6. Bridge generated theme roles to the existing palette. Map background/foreground/card/popover/primary/muted/ring to JEV variables, and make dark variants follow `data-scheme="dark"`. The default `.dark` selector will not follow `applyPalette`. shadcn's `accent` is commonly a subtle surface; JEV's `--accent` is an actionable foreground/fill. Reusing that name unmodified changes contrast semantics.
7. Audit CSS cascade before converting controls. Tailwind's default import includes Preflight resets for borders, spacing, headings, lists, and replaced elements. Existing unlayered `button`, `input`, `select`, `header`, and `main` rules can also outrank layered utilities. Either coordinate a complete base-layer migration or use selective theme/utility imports without Preflight and adapt generated components. Keeping two global resets/theme systems unmanaged is unsafe.

Even selective shadcn dialogs/popovers can change focus trapping, Escape propagation, scroll locking, and portal geometry. Start with passive controls only if choosing this route; test modal behavior separately from the anchored canvas inspector. Native-owned Button/IconButton/ToolGroup/Disclosure/Panel primitives using existing variables avoid this toolchain migration. Native HTML alone does not provide a complete custom-menu/modal accessibility implementation; use simple existing controls or separately approve a tested primitive when necessary.

## Safe parallel ownership

| Owner | Exclusive files | Coordination rule |
| --- | --- | --- |
| Integration/shell | `App.tsx`, `main.tsx`, `styles.css`, `i18n.tsx`, task manifests/spec updates; package/lock/Vite/TS config if approved | Single writer. Own prop seams, shared tokens, locale-key integration, and final rebuild. |
| Monitoring | `monitoring/MonitoringView.tsx`, `monitoring.css`, view tests | Keep API/state callbacks in App. Treat VirtualList and RouteTrace/playback changes as separately agreed behavior work, not parallel incidental edits. |
| Strategy workspace | `config/RoutingEditor.tsx`, `RoutingCanvas.tsx`, `routing-editor-presentation.css`, related interaction tests | One owner for coupled draft/selection/geometry behavior. Keep `draft.ts`, `canvas.ts`, `node-card.ts` frozen unless expressly included; coordinate with Mixboard/global-canvas work. |
| Appearance | `appearance/AppearanceView.tsx`, `appearance.css`, isolated tests | Props only; palette math/API handlers stay with integration owner. |
| New policy-flow presentation | A new isolated component/helper/CSS/test set under `config/`, path agreed before dispatch | Read-only `RoutingDraft`/`ConfigurationPayload` projection; no fetch/write/independent edge store. Strategy owner integrates and owns changed imports. |

Do not have multiple agents edit separate regions of `RoutingEditor.tsx`, `styles.css`, `i18n.tsx`, or package files. After approving interfaces and tokens, isolated slices can proceed concurrently. Freeze generated bundle writes until integration so concurrent builds do not overwrite one another. Recheck dirty paths before dispatch; active task names do not prove a file is currently unowned.

## Verification required after implementation

Use synthetic delayed/failed/empty/paginated fixtures. Run frontend lint, tests, TypeScript/Vite build and bundle freshness once integration is complete. Browser-check desktop/tall/390px/320px, both locales/schemes, keyboard focus, reduced motion, preview/detail-loading states, pagination, drawer/inspector reachability, zoomed native drag, cancelled gestures, and delayed layout failures. Assert layout gestures call only layout PUT and policy edits call validate before explicit apply. Preserve credential/storage, overlay/backend, and dashboard packaging/CSP tests. Existing SSR/pure tests cannot verify pointer hit-testing, focus traps, or scrolling.

## Sources

Local: the current task PRD/design/implement and `research/{excalidraw-overhaul,magpie-routing-analysis,interaction-analysis,strategy-presentation-audit,design-language}.md`; the PRD/design of the three related tasks above; global-canvas `research/{final-review,layout-race-followup,viewport-gates}.md`; `.trellis/spec/backend/dashboard-routing-config.md`; frontend files named above; `jev_gateway/gateway.py`, `dashboard.py`, `canvas_layout.py`, `routing_overlay.py`, and `strategy/matrix.py`.

Official docs retrieved for this research:
- https://ui.shadcn.com/docs/installation/vite
- https://ui.shadcn.com/docs/installation/manual
- https://ui.shadcn.com/docs/tailwind-v4
- https://tailwindcss.com/docs/preflight
- https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html
