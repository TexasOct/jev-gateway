# Unified dashboard design language

## Source and intent

Use shadcn/ui New York as the visual baseline: neutral surfaces, restrained borders, compact type and consistent component shapes. Preserve JEV's seed-derived action/status colors and current `data-scheme` behavior. The previous dashboard style study remains the source for geometry, accessibility and operational constraints, not as a competing visual target.

This remains an operator interface with two reading depths. The initial monitoring view should answer in plain language which session is selected, where its request was routed, what outcome was recorded, and what the user can inspect next. Detailed evidence, provider observations and policy editing remain accessible and may retain technical density.

This is an operator interface with two reading depths. The initial monitoring view should answer in plain language which session is selected, where its request was routed, what outcome was recorded, and what the user can inspect next. Detailed retained evidence, provider observations and strategy editing remain discoverable but can retain technical density. Treat the pasted image as a visual guide, not as an authorization to add its illustrative fabricated metrics, session rows, time-range control, or status claims.

## Tokens and typography

- Continue using `--bg`, `--surface`, `--surface-alt`, `--code-bg`, `--border`, `--text`, `--text-muted`, `--accent`, its hover/active/on-accent variants, and semantic `--good`, `--bad`, `--warn` from `palette.ts`.
- Use a consistent shadcn-like neutral base for page, cards, muted regions and borders, while keeping the seed-derived JEV primary action and semantic statuses. Do not replace the saved seed behavior with a fixed black primary.
- Preserve dynamic CSS variables and `data-scheme`. Map shadcn `accent` to a subtle surface role, not to JEV's actionable `--accent`.
- Use a consistent system sans stack and tabular figures. Adopt shadcn-like scale: compact labels 12px, control/body 14px, section title 14px, workspace title 18-20px, and supporting copy 12-13px.
- Avoid all-caps micro-labels, decorative gradients, external fonts, textures, and non-semantic status colors.

## Surfaces and spacing

- Use Tailwind spacing utilities around a 4px rhythm, with control internals around 8px, groups around 16px, and card sections around 24px where space permits.
- Follow the New York shape rhythm: rounded-md controls, rounded-xl general Cards, soft borders and a restrained shadow only on raised surfaces. Keep canvas node sizes, measured overlays and hit geometry intact.
- Avoid default panel shadows; use subtle theme-tinted separation only where layering requires it.
- Standard controls are at least 36px high, with canvas/touch actions remaining 40px or larger.
- Preserve current strategy node size, graph geometry, canvas bounds and overlay measurements.

## View composition

- Shared header keeps product identity, three existing view-navigation choices, then theme/language/refresh controls. Preserve order and labels. At narrow widths wrap or scroll intentionally.
- Monitoring is the first-use surface. Lead with the latest-session preview and known route/result in clear language, then offer an obvious action to select it. Keep request-level evidence and route playback alongside the route trace, with source sections independently expandable. Session selection remains visible and the detail receives available width. Move dense metadata, raw identifiers, and retained provider observations to secondary visual priority or disclosure without deleting them. Put the evidence caveat before any collapsed provider table. Stack the areas on smaller viewports. Keep existing list viewport and row geometry, evidence caveats, and contained table overflow/mobile labels.
- Empty/loading/error/evidence-unavailable states tell the user what is known and what action is available. Do not turn missing retained evidence into an implied pending request or live provider status.
- Strategy keeps the graph as the visual center. Use a clean workspace surface, floating grouped tools, contextual inspector and disclosure-based advanced drawer, borrowing Excalidraw's hierarchy without adding general drawing tools. Retain the existing node/edge semantics and interactions. No undo/redo in this revision.
- Appearance retains the seed editor, save/reset controls, swatches and contrast table. Use the same surface and spacing system without introducing presets or changing palette math.

## States and accessibility

- Keep existing focus-visible outlines and keyboard paths. When a focused virtual row moves outside the rendered window, keep that row mounted until focus leaves it. Maintain readable contrast for selected, hover, disabled, success, failure, warning and unknown states in both schemes.
- Do not change virtualized viewport sizes or fixed session/request row dimensions.
- Preserve evidence as retained best-effort information. Never label observations as provider health or live throughput.
- The configured-policy route explainer may use finite, user-triggered line motion with a complete static and textual equivalent under `prefers-reduced-motion`. It does not depict real execution. Preserve reduced-motion behavior for retained-request replay and canvas drag feedback.

## Explicit exclusions

No remote assets/fonts, synthetic metrics in production, backend/API or schema changes, route label changes, persistence changes, CSS transforms on interactive canvas objects, or changes to the established routing write safety flow. Tailwind and selective shadcn-style components are approved. Existing gestures remain; undo/redo and general drawing tools remain out of scope.
