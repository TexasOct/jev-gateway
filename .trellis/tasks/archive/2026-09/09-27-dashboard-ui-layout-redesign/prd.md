# Dashboard frontend redesign

## Goal

Redesign the JEV Gateway frontend as a simple, attractive operations workspace. Borrow Excalidraw's restrained canvas chrome for strategy editing and Magpie's readable branching-flow presentation for configured routing. The default monitoring page should remain easy for a first-time client to understand; advanced evidence and policy editing stay available.

## Background

- The current Vite/React/TypeScript dashboard has three views: monitoring, strategy workflow, and appearance. A previous visual iteration is present as uncommitted work in `frontend/`; preserve it as the starting point. This revision supersedes its presentation-only implementation scope.
- Monitoring has a session/request inspector, paginated virtual lists, retained-request trace playback, provider observations, and best-effort storage states.
- Strategy editing already supports selection, pan, marquee/multi-selection, zoom, supported connection editing, node inspection, an advanced drawer, and a validated draft/review/apply lifecycle. The existing graph is an ordered first-match policy, not an arbitrary executable DAG. Canvas layout is saved independently of routing policy.
- Reference observations are recorded in `research/excalidraw-overhaul.md` and `research/magpie-reference-capture.md`. Magpie's live/demo counts and account status are not JEV data.

## Requirements

- R10. The latest user-provided directory tree is the final acceptance target, superseding the earlier temporary no-move instruction. Move application, feature, shared, CSS and browser-test sources into the specified directories and filenames. Keep every additional production helper or colocated test needed by the current implementation under its owning subtree; do not delete behavior merely because the condensed target tree omits a helper. Resolve current API/monitoring contract ownership before their moves, preserving the active interface shape and other agents' uncommitted work.
- R11. `frontend/src/styles/` must contain exactly `index.css`, `tokens.css`, `base.css`, `shell.css`, `monitoring.css`, `routing.css`, `canvas-geometry.css`, `appearance.css`, and `virtual-list.css`. `index.css` is the sole CSS import entry point and controls order; no numbered continuation slices, separate Tailwind file, or feature-owned CSS remain. Tailwind may be imported inside that entry. Preserve theme, canvas hit/coordinate, and virtual-list dimension behavior while consolidating rules by purpose.
- R12. Place `App.tsx`, `AppShell.tsx`, and hooks under `src/app/`; feature code/tests under `src/features/{monitoring,routing,appearance}/`; reusable API, i18n, theme and shadcn-adapted controls/license under `src/shared/`. Use the `@/` TypeScript/Vite alias for imports crossing module boundaries; keep short relative imports within a module. Keep small numbers of tests colocated, but group larger test suites in an owning module's `__tests__/` folder. Split browser fixtures into `strategies.ts`, `sessions.ts`, `activity.ts`, `configuration.ts`; browser specs into `monitoring.spec.ts`, `routing-editor.spec.ts`, `appearance.spec.ts`, `responsive.spec.ts`; retain `setup/mock-api.ts` and a formal isolated browser-test configuration. The tests use synthetic API data only and cannot contact a live gateway.

- R1. Rebuild the shared visual language across all three views: compact navigation, minimal persistent chrome, a clear type/spacing hierarchy, contextual surfaces, consistent actions and states, light/dark themes, and responsive layouts. Maintain English and Simplified Chinese labels and keyboard accessibility.
- R2. Keep monitoring a structured session/request inspector, not a draggable canvas. Lead with a concise latest-session preview or selected-session route and latest recorded result. Keep request evidence, user-started retained-request playback, and provider observations reachable through clear disclosure. Distinguish loading, empty, failure, missing evidence, and unknown outcome without implying live provider health.
- R3. Make strategy editing canvas-first. Preserve all current selection, pan, marquee/multi-move, zoom, supported connection, inspector, advanced-editor, draft, validate, review, acknowledgement, apply, reset and independent layout-save operations. Reorganize their toolbar and surfaces in an Excalidraw-inspired workspace. Do not add undo/redo in this revision.
- R4. Present a Magpie-inspired directed branching diagram of **configured policy only**. It must derive questions, ordered first-match rules, unmatched/fallback paths, labels, model pools and edges from the current policy draft. Branch width, status and animation must not encode observed request counts, probabilities, simultaneous dispatch, retry sequence or provider health. Identify the draft versus applied state.
- R5. Add purposeful animation to help explain a selected/configured route, with clear meaning and a static equivalent under `prefers-reduced-motion`. No fake live-traffic simulation, inferred route execution, perpetual distracting motion or API calls caused by visual playback.
- R6. Express component-specific styling through Tailwind utilities in component `className`, including static canvas geometry, SVG presentation, pointer-hit rules and fixed virtual-list dimensions. Retain only a small set of frequently reused global element/control defaults, runtime theme variables, Tailwind configuration and named keyframes in CSS. Dynamic measured coordinates and data-derived colors may remain inline or in element-level CSS variables; do not change their values or behavior. Keep seed-derived theme roles and both color schemes. Preserve the nine stylesheet paths and sole entry even when an owner becomes comments-only. Do not replace removed CSS with `@apply` classes or a generic selector-to-class registry. shadcn/ui may be used selectively if a base control needs its accessibility behavior.
- R7. Preserve existing same-origin API, gateway auth/CSP, memory-only credentials, locale-only browser persistence, evidence privacy, cursor pagination, configuration overlay validation and independent canvas-layout storage. No backend schema, routing policy semantics or new telemetry in this revision.
- R8. Existing uncommitted work and related active dashboard tasks must be preserved. Split implementation into non-overlapping ownership areas; integration and shared CSS/toolchain files have one owner.
- R9. Preserve existing strategy canvas actions: selection, pan, marquee/multi-move, zoom/Fit, supported connections, inspection and advanced editing. Redesign their presentation but add no undo/redo. Policy changes keep the current draft, validate, review, warning acknowledgement, explicit apply and confirmed reset lifecycle; layout persistence stays separate.

## Acceptance criteria

- [ ] On desktop, 390px and 320px viewports in both locales and light/dark schemes, the three views share an Excalidraw-inspired workspace language with compact navigation, restrained surfaces and contextual inspection, with no document-level horizontal overflow. The strategy canvas fills its available workspace; controls and inspector remain reachable.
- [ ] A new user can identify the current/previewed session, its known route, latest **recorded** result and next action without interpreting raw IDs. Selected-detail loading, unavailable evidence, empty and error states remain distinct; advanced source evidence remains accessible.
- [ ] The strategy diagram exposes the configured first-match order and fallback, label/model membership and the difference between a draft and active policy. It shows no percentages, production traffic counters or fake status.
- [ ] Selecting a configured branch reveals its direction and explanation through short motion; reduced-motion users receive a complete static path and the same text. Selection, playback and layout changes do not send policy PUT requests.
- [ ] Existing canvas gestures, keyboard alternatives, inspector, advanced controls and validate/review/acknowledge/apply/reset work as before. A layout save never updates strategy overlay/hash/version; strategy changes still require explicit review and application.
- [ ] Tailwind utilities own all component-specific static styles, including canvas/list geometry. Remaining CSS is limited to documented shared global defaults, theme/Tailwind definitions and keyframes. Browser comparisons verify unchanged dimensions, hit testing, focus, responsive states and reduced motion. Dynamic theme seed and `data-scheme` still control light/dark, without remote runtime assets.
- [ ] Frontend lint/tests/typecheck/build, dashboard bundle freshness, relevant gateway/security tests and an isolated browser interaction matrix pass on the final integrated tree. Verify real pointer hit testing, virtual-list scroll/focus and reduced motion rather than relying on screenshots alone.
- [ ] Record baseline results before CSS/source organization; after each implementation step run frontend lint, tests and build. Preserve source-adjacent unit/component tests and add browser tests only through an explicitly configured browser-test facility using synthetic API data, never a running gateway.
- [ ] All CSS imports resolve through `frontend/src/styles/index.css`, with purpose-specific stylesheets in `frontend/src/styles/`; geometry/list rule values remain unchanged during relocation.
- [ ] The complete latest target tree is present, imports and test discovery use the new paths, and old source locations plus numbered CSS and combined browser fixture/spec files are absent. API and monitoring moves happen only after verifying the active interface contract; `App.tsx` orchestration behavior remains intact.

## Decisions

- Monitoring remains a structured inspector; the strategy workspace owns the branching diagram.
- Existing strategy canvas interactions remain in scope without undo/redo.
- Adopt shadcn/ui's original New York neutral surfaces, typography and component geometry more closely, while using project-owned components and selectively adopting accessible primitives.
- Preserve the seed-derived palette implementation and `data-scheme` light/dark behavior unless the user explicitly chooses the original fixed neutral primary instead.
- Tailwind is the main styling layer; retain only documented theme and geometry-critical CSS.
- Diagram data is configured policy only. Any observed distribution would need a separately approved data contract.
- Preserve existing strategy canvas operations; do not add undo/redo now.
- Tailwind-first migration is approved. Align the design language closely with shadcn/ui New York: neutral surfaces, clear compact typography, consistent component radius and control states. Prefer project-owned/adapted shadcn components; use Radix-backed primitives where they add needed accessibility.
- Preserve the dynamic seed-derived primary/action and status palette unless separately approved to replace it. Keep shadcn accent as a muted surface role, not the action color.
- Keep only geometry/theme-critical CSS after migration, and retain all agreed canvas interactions without adding undo/redo.
- Prior presentation-only assumptions about no dependencies, no motion, unchanged toolbar layout and native-CSS-only styling are superseded here. Backend and policy safety contracts remain unchanged.

## Out of scope

Observed traffic distribution, provider health, fabricated metrics, general drawing tools, arbitrary DAG execution, undo/redo, collaboration, AI-generated strategies, automatic polling, backend/API/schema changes, credentials in persistent storage, and deployment or publication. Existing unrelated uncommitted changes must not be removed or included in this task's commit without review.
