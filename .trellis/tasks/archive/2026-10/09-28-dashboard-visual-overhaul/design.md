# Dashboard visual overhaul design

## User direction

Redesign the dashboard from scratch in a visual style consistent with Magpie and shadcn/ui. The user explicitly allows interaction redesign in monitoring and appearance. The strategy canvas styling must be replaced throughout, while its current interaction logic remains intact. Keep the saved theme seed as a configurable accent on a neutral surface system.

The supplied Magpie screenshot is a direct design reference for the branching strategy composition. Use its compact navigation, dark-neutral framed workspace, clear node hierarchy and SVG branch flow as visual cues. Do not reproduce Magpie's product/account data, quotas, traffic counts, provider logos or live health indicators. Monitoring activity motion is permitted only under the verified recent-request/working-stream contract in `.trellis/tasks/archive/2026-09/09-28-strategy-monitoring-home/prd.md`; configured-policy graphics remain explanatory.

## Current architecture

`App.tsx` owns global API/auth orchestration, top-level view selection, session and request data, pagination, theme seed and scheme. `MonitoringView` and `AppearanceView` consume state and callbacks from this boundary. Keep transport and persistence in the existing owner; redesigned UI components receive data and actions through props.

The strategy stack has two coupled concerns:

- `RoutingEditor.tsx` owns the policy draft, selection, DnD context, supported policy mutations, validate/review/acknowledge/apply/reset sequence and inspector content.
- `RoutingCanvas.tsx` owns node layout, viewport, zoom/pan/select modes, marquee, supported edge gestures, drag lifecycle, canvas layout write sequencing and rollback, hit testing, and measured overlay occlusion.

`canvas.ts`, `draft.ts`, `node-card.ts`, graph projection and API contracts are behavior/geometry boundaries. Restyle components and replace paint rules while keeping data attributes, event handlers, dimensions used for coordinate math, geometry helper inputs, and save boundaries unchanged. Any proposal to change measured dimensions or DOM boundaries requires its own interaction audit and is not presumed by the visual redesign.

## Design system and tokens

Use the existing project-owned, shadcn-derived controls and Tailwind v4 as the implementation base. Do not scaffold a second design system or adopt a new component registry. Use neutral surfaces, borders, restrained elevation, compact sans typography, visible focus states, and consistent shadcn-like control radius. Avoid importing global Preflight while legacy selectors remain.

Keep dynamic `data-scheme` and the `buildPalette(seed)` flow. Neutralize backgrounds, panels and borders as required for the target style, while preserving seed-derived action/selection accents and semantic statuses. Map the shadcn accent surface separately from the actionable primary accent. Do not change the `{version:1, seed}` storage/API shape or introduce another persisted preference. Ensure contrast remains valid for custom seeds in both schemes.

Magpie's screenshot shows dark UI, but the user has explicitly retained current light and dark scheme support. Treat dark Magpie as the composition reference and express the same hierarchy in the light scheme instead of forcing dark-only pages.

## View direction

### Shared application shell

Replace existing visual shell with compact brand/navigation and contextual account/theme/locale/refresh actions. Keep navigation destinations and callback semantics connected to existing view state. At narrow widths, provide an intentional compact or collapsible navigation that remains keyboard accessible and does not obscure the workspace.

### Monitoring

Keep provider-summary read failures separate from session-list failures. Provider observations can be unavailable while current live-session distribution remains usable; surface that degraded state without hiding session counts. Storage-unavailable session payloads still require a recovery action, and counts remain uncertified.

The user explicitly approved adding a read-only activity endpoint and frontend polling to drive actual route animation. Treat this activity telemetry as the scoped exception to the original no-backend-change boundary: content-free, process-local, non-persistent, separate from session/evidence schemas, and unable to affect route selection or outcomes. Follow the detailed lifecycle and API contract in the strategy-monitoring child PRD. The simple monitoring view is strategy-first. Read `/v1/routing/strategies` to enumerate all registered strategies, including those without current sessions. Users browse each strategy's observed current-session distribution by the latest known selected model, then can open sessions and request evidence in secondary views/details. Fetch the existing `/v1/routing/sessions` cursor pages until completion before presenting a complete count. Deduplicate by session ID and group rows by latest known strategy and selected model (`provider` plus `upstream_model`, falling back to the recorded `route` when available). Distinguish unknown/missing route attribution from known model buckets; do not silently drop rows or count them as zero. Label the data as current live sessions, not historical traffic or provider health. A live-session count is one per session, not a count of routed requests. If a session's routing model changes, the row reflects only its latest known selection. Configured model pools must be labeled separately from observed model load; `/v1/routing/configuration` covers only the `task_aware` editable policy, so it cannot enumerate every strategy's configured model branches.

Keep virtualized session/request contracts, request detail loading and cancellation, best-effort evidence distinctions, playback boundaries and provider observation semantics. Show latest recorded route/result when known and put dense payloads or raw evidence behind secondary navigation/disclosure. Any replay is grounded only in retained selected-request data and remains separate from policy-distribution visualization. If pagination or evidence is unavailable, show a distinct incomplete/unavailable state rather than a verified zero. The `09-28-strategy-monitoring-home` child is approved to add content-free, process-local, read-only telemetry for currently in-flight requests and streams, under the contract in that child's PRD. Do not add historical backend aggregation or telemetry outside that monitoring contract.

### Strategy

Create a clean canvas-first workspace with a Magpie-inspired directed policy map. Use visually clear source/question/rule/fallback/label/model node types and equal-weight SVG connectors derived from the existing draft graph. Indicate first-match order and fallback plainly. This diagram describes configured policy, not measured sessions. Highlight a selected/configured path only as an explanation of policy configuration. Draw attention with restrained finite animation only where it clarifies path direction; provide the same complete static view under reduced motion. No counters, probability widths, request packets suggesting live execution, or ungrounded provider states.

Replace styling of nodes, edges, toolbar, inspector, drawers and review controls. Improve discoverability and comprehension of existing question, rule/order, fallback, model-pool and supported-connection editing. Make the difference between canvas layout changes and policy draft changes visible; show supported/unsupported connection feedback in the existing vocabulary. Preserve tool modes and their current transitions; selection/pan/marquee/multi-move, zoom/Fit, supported connection logic, keyboard access, DnD sensors, inspector lifecycle, advanced editing, policy draft safety, and independent layout persistence remain as implemented. Preserve node hit target and coordinate geometry unless expressly re-planned with measured math and browser tests. Do not add arbitrary branches or tools.

### Appearance

Retain theme seed and scheme editing with the current server contract, but redesign presentation to expose the seed as an accent over neutral surfaces. Maintain preview/save/reset and contrast information. Do not store theme choices in localStorage or add persistent theme modes.

## Ownership and integration

Before implementation, inspect `git status`, active-task files and modified-path ownership. Existing uncommitted work belongs to prior dashboard efforts and is not an empty baseline. Designate one integration owner for shared CSS/tokens, `App.tsx`, `i18n.tsx`, `main.tsx` and package/build files. The strategy editor and canvas are a single coupled ownership area; do not delegate their same files to parallel writers. Monitor and appearance can be isolated only after props and shared tokens are agreed. Avoid a broad parallel rewrite of shared CSS.

## Risks and mitigations

- Current-session distribution is bounded by live session retention, TTL/eviction and cursor pagination consistency. Fetch all pages; label the snapshot scope and show incomplete/error states when enumeration fails. A failed page walk must resume from the last successful cursor on retry, not restart from a single page or certify a partial zero. Do not present it as a historical aggregate.
- Per-session `strategy`, `provider` or `upstream_model` may be absent. Preserve an explicit unknown/unattributed bucket rather than making an inferred assignment.
- Legacy global control rules can override utilities or new component styles. Migrate and remove selectors deliberately; verify computed styles before claiming alignment.
- Canvas dimensions, transforms or overlay placement can break pointer hit testing, drag, Fit and reveal behavior. Preserve geometry-critical contracts, retain selectors/measurement hooks and perform real browser interactions at several zoom and viewport sizes.
- Light/dark themes and arbitrary seed-derived accent colors can create contrast failures. Status colors are used for small text, so test them at 4.5:1 or higher, along with other semantic states, across representative seeds in both schemes.
- Theme save and reset requests can race or display stale success. Use a shared pending guard, clear notices at operation start, and show the active error in the appearance view.
- Monitoring activity lines may animate only while the monitoring child can establish at least one in-flight request for that exact destination. Keep that separate from configured-policy graphics. A polished configured-policy diagram can accidentally suggest execution, so use equal branch weight, explicit policy labels and no production-like status or counters.
- User-owned uncommitted changes can be lost through broad rewrites. Review every hunk and keep unrelated changes out of the task's change set.

## Rollback

Keep the redesign and monitoring telemetry in identifiable view/component/style and activity-instrumentation changes. Only the monitoring child's approved read-only activity contract may extend the API; persisted data shape, backend policy semantics and security boundaries stay unchanged. Roll back by reverting only reviewed task-owned hunks, never by resetting the whole worktree. Preserve other in-flight changes and the existing separate theme/layout/policy persistence contracts.
