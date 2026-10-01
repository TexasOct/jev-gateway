# R6 component utility migration

Static canvas geometry, hit rules, and overlay positioning were already migrated to `RoutingCanvas.tsx` and `RoutingEditor.tsx`; `canvas-geometry.css` now retains only `node-drag-pulse` keyframes. The migration preserves JS-measured coordinates, origin offsets, drag/zoom transforms, inline node positions, and persisted layout values. Browser pointer/keyboard tests cover the 190 × 56px node box, `elementFromPoint`, Fit, layout-only writes, and 320/390/1280px workspaces.

The remaining component-specific styles were moved from `monitoring.css`, `routing.css`, `virtual-list.css`, `appearance.css`, and the table overflow rule in `base.css` onto the owning components:

- `ConfiguredRouteFlow.tsx`: SVG stroke, width, dash, transition, finite trace animation, and reduced-motion handling. `routing.css` retains only the named keyframes.
- `StrategyDistribution.tsx`: measured SVG presentation and path strokes, including static/reduced-motion states. Connector geometry remains inline; `monitoring.css` retains only the named keyframes.
- `RouteTrace.tsx`: stage minimum, connectors, gaps, packet paint/positioning, and mobile selected-card geometry. Packet coordinates and SVG viewBox remain inline.
- `VirtualList.tsx`: the session viewport remains 480px desktop / 280px narrow; timeline remains 480px desktop / 62vh narrow. Row top/height values remain dynamic inline. Tailwind's class ordering made competing 280px and 62vh utilities on the same timeline element unsafe, so each variant now emits only its own mobile height utilities.
- `SessionInspector.tsx` and `AppearanceView.tsx`: mobile table row/cell labels and scrollable contrast table respectively. The provider fixture with a populated row verifies that `td[data-label]::before` still displays the label.

`index.css` remains the sole entry and imports exactly the nine required stylesheets. `tokens.css` retains runtime palette variables; `base.css` and `index.css` retain shared element/control defaults. Feature owner files with no remaining rules are comments-only. No `@apply` or selector-to-class registry was added. Browser tests verify actual viewport heights, SVG paint, pointer behavior, provider-label display, focus, scroll pagination, reduced motion and responsive overflow with synthetic API data. Theme seed and `data-scheme` remain unchanged.
