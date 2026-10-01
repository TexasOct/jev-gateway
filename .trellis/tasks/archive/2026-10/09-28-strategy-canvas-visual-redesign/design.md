# Strategy canvas visual design

## Presentation boundary

Keep the existing `RoutingEditor` draft/selection/review owner and `RoutingCanvas` gesture/layout owner. Restyle editor and canvas presentation to a compact shadcn-like neutral workspace, using Magpie's directed branch structure as visual reference. Configure questions, ordered first-match rules, fallback, labels and models from the current draft projection only; do not infer topology from node position or invent execution probabilities.

Preserve data attributes, node hit areas, port/edge hit testing, measured `[data-canvas-occlusion]` surfaces, coordinate transforms, drag scroll lock, layout write queue/rollback and the separate routing-policy write boundary. Geometry-critical styles remain explicit. Any dimension changes require matching coordinate logic and browser pointer/Fit checks.

## Interaction and visual states

Improve the visual hierarchy around current question/rule editing, first-match order, fallback selection, model-pool membership and connection feedback. Keep invalid/unsupported connection reasons legible. Identify pending policy changes separately from node-position/viewport changes so operators can see which review/apply path applies. This is an affordance and explanation refinement; it must not add policy options or new canvas operations.

Preserve tool mode transitions, selection, pan, marquee/multi-move, zoom/Fit, supported connections and keyboard paths exactly. Restyle toolbar, node classes, path emphasis, inspector, advanced drawer and review/apply states. A finite selected-branch explanation may animate path direction; reduced motion shows a complete static path with equivalent text. This is configured policy, not current session traffic.

## Ownership

One strategy owner edits coupled `RoutingEditor.tsx`, `RoutingCanvas.tsx`, config-specific styles/tests. Shared tokens, app shell, i18n and global CSS belong to the shared-shell owner. Coordinate any geometry or selector migration before changing it.
