# Drag interaction update

`RoutingCanvas` now accepts optional `onDraggingChange?: (dragging: boolean) => void`. It calls `true` only after the pointer moves more than 4 CSS pixels and calls `false` after successful release, unchanged release, pointer cancel, or lost pointer capture. Parent can keep the inspector mounted while hiding it during that interval.

Drag previews are derived from the gesture's captured starting positions, selected group and zoom. They persist only on a successful release that changed at least one coordinate. Cancellation restores the captured layout. A pending debounced viewport save is canceled when drag begins, and scroll persistence is suppressed during capture to avoid saving preview coordinates on cancel. Active nodes carry `.dragging` and `data-dragging`; status shows selected-node x/y while moving.

Viewport restore measures workspace/chrome without an inspector anchor update before computing the canonical viewport restoration on the next animation frame. This prevents a stale zero `originY` from shifting restored scroll.

The node button renders the visual agent's `CanvasNodeContent` while retaining its title, short accessible name and fixed outer geometry. It exposes `data-node-kind` and keeps the existing click and keyboard handlers.

`npm --prefix frontend run test`: 89 tests passed across 8 files. `npm --prefix frontend run lint`: passed with 4 existing fast-refresh warnings in `i18n.tsx`. `npm --prefix frontend run build`: passed, regenerating the ignored bundle. Tests cover pure gesture calculations; native browser pointer capture, layout-only PUT and fresh-load viewport restoration still need browser verification. No Editor, CSS, i18n, backend or release changes by this agent.