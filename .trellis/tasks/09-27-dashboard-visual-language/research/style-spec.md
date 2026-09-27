# JEV Gateway Dashboard style specification

## Design intent

A focused operations workspace with a quiet technical character. Use the existing hue-tinted neutral theme as the main canvas, clear typographic contrast for data, and a restrained accent for selection and navigation. The routing graph remains the visual center of the strategy view. Monitoring is information-dense but orderly. Decorative graphics should not compete with live status or policy structure.

This document defines a reviewable direction for the static style board and the visual foundation for the monitoring prototype. Values are proposals for review; palette-seed generation, product geometry and strategy-editor interaction behavior remain unchanged. The monitoring route replay is a separate interaction concept captured in `monitoring-motion-proposal.md`, not a finalized production behavior.

## Theme and color roles

Retain the roles emitted by `frontend/src/theme/palette.ts`:

| Token role | Use |
| --- | --- |
| `--bg` | Application background and exposed canvas around work areas. |
| `--surface` | Header, panels, inspector, drawer, inputs, toolbar surfaces. |
| `--surface-alt` | Quiet secondary regions, table hover, nested information, code areas where appropriate. |
| `--code-bg` | Code/evidence blocks. |
| `--border` | Panel boundaries, dividers, control outlines and graph grid. |
| `--text` | Titles, values and primary body copy. |
| `--text-muted` | Secondary labels, descriptions, timestamps and supporting detail. |
| `--accent`, `--accent-hover`, `--accent-active`, `--on-accent` | Navigation selection, keyboard focus, active selection and primary action. |
| `--good`, `--bad`, `--warn` | Success, failure and warning only. Do not use as decorative category colors. |

Do not hard-code a new brand color. The static board has light and dark theme examples based on the existing default seed `#3b66d9`, but product output remains seed-derived. Keep status meaning and existing contrast algorithm. Avoid gradients, outer glow, glass blur and texture overlays.

## Typography

Use the current system stack: `system-ui, -apple-system, "Segoe UI", sans-serif`; do not fetch fonts or add font assets.

| Role | Proposed spec |
| --- | --- |
| Product title | 20px / 1.2, weight 650, slight negative tracking. |
| Page/view title | 17px / 1.3, weight 620. |
| Panel/section title | 14px / 1.35, weight 620. |
| Body/control | 13px / 1.45, weight 450–500. |
| Supporting text | 12px / 1.45, weight 450, `--text-muted`. |
| Compact labels / node type | 10–11px / 1.2, weight 550–600. |
| Numeric metrics, indices, zoom | 12px, tabular figures; monospace only where it conveys identifiers or code. |
| Node title | 13px / 16px, weight 620, retain fixed 190×56 node box. |
| Node summary | 10px / 12px, weight 450. |

Avoid all-caps micro-labels. Use sentence case, and preserve existing text strings.

## Spacing and sizing

Use a compact 4px base scale suitable for an operations dashboard:

- 4px: icon/text gap, dense metadata.
- 8px: control internals, label/input gap, tight component groups.
- 12px: control group and panel sub-section spacing.
- 16px: panel padding and main content gutters.
- 20–24px: separation between major dashboard regions where viewport allows.

Minimum standard button/input height: 36px on desktop, 40px for canvas tools and touch-sized controls. Preserve existing virtual list row heights, canvas workspace size, drawer/inspector bounds and node geometry. Do not use larger page padding inside the full-height strategy shell.

## Shape, borders and elevation

- Main panels: 8px radius, one quiet 1px border, no default shadow.
- Inputs/buttons: 6px radius, matching 1px border.
- Nested cards: 6px radius or divider-only grouping; use a background change only when it indicates hierarchy.
- Inspector/drawer/tool shelf: 8px radius at exposed corners; subtle theme-tinted separation, no heavy black shadow. Their anchoring, bounding box and occlusion measurement remain unchanged.
- Status markers: compact rectangular/square treatment; reserve pills only where already semantically necessary.
- Separators use `--border`; do not apply a border around every piece of metadata.

## Controls and feedback states

- Default controls use `--surface`, `--text`, `--border`.
- Hover: shift border/background subtly toward the accent; no scale or movement that can shift canvas geometry.
- Pressed: use the existing active semantic fill; do not animate layout or alter hit target.
- Focus-visible: consistent 2px accent outline with 2px offset. Keep the outline visible against both themes and do not clip it at overflow boundaries.
- Disabled: muted appearance plus cursor feedback; do not reduce text contrast so far that the disabled label is unreadable.
- Validation/error: retain inline placement, wording and status semantics. Use `--bad`/`--warn` for message boundary/icon as well as text only where existing semantic content already communicates the state.
- Reduced motion: transitions may be disabled. Do not introduce automatic motion.

## Surfaces by area

### Shared header

Keep current three-part structure: product identity, view navigation, global theme/language/refresh controls. Use a single clean surface, compact 72px-ish desktop height when content fits, aligned control heights and clear active-view fill. At narrow sizes preserve wrapping/scrolling and control order. Avoid gradients, decorative logo art and extra navigation elements.

### Monitoring

Retain current grid and panel ownership. Panel titles lead; status explanation is secondary; empty/loading content stays visible without invented metrics. Tables use a clear header row, stable numeric alignment and restrained row separation. Provider and session evidence remain text-first. Preserve fixed virtual viewport dimensions and mobile `data-label` presentation.

### Strategy canvas

Keep full-viewport work area and dotted grid, but let dots recede: low-contrast, 22–24px rhythm, one-pixel marks. Keep existing absolute node positions and connection routing. Connection paths remain subdued neutral strokes; interactive handles and selection use the accent. Node type distinctions use the existing semantic category colors with restrained backgrounds. Do not add gradients, texture, cursor effects or animated edges.

Toolbar is a compact control shelf with aligned 36–40px targets, logical grouping and restrained separation. Inspector and bottom drawer remain separate, readable work surfaces. The drawer's current collapsed/expanded behavior, available vertical space and internal scroll remain unchanged. Use typography and border hierarchy to distinguish overview, advanced help and review actions without reordering them.

### Theme/appearance

Show the existing seed input, save/reset actions, swatches and contrast table in a plain two-column desktop composition where available, collapsing through existing flow on narrow widths. Do not invent theme presets or add a new control. Status swatches preserve their semantic colors.

## Responsive rules

- Keep current breakpoints and behavior unless the board shows text clipping that calls for an existing container's overflow presentation to change.
- At 900px, retain monitoring split collapse behavior as implemented by current media query; at 720px keep mobile table labels and shorter list windows; at 600px preserve compact header and horizontally scrollable canvas controls.
- At 390px and 320px, prioritize readable control labels, existing horizontal scroll affordances and reachable actions. Never shrink touch targets to fit all tools on one line.
- Simplified Chinese can be wider than English in buttons and toolbar labels. Allow wrapping in non-fixed areas; use the established horizontal scroll container where fixed geometry demands it.

## Do not change in a future product integration

Navigation/action order outside the separately approved monitoring redesign, visible product wording, unrelated React state, API calls/payloads, keyboard commands, strategy-canvas pointer gestures, strategy selection logic, drawer expansion, node 190×56 geometry, node ports, graph layout, scroll ownership, virtual row heights, CSS query hooks, DnD context, theme palette algorithm, locale/credential storage or persistence boundaries. Monitoring replay semantics need a separate explicit product decision before implementation; the prototype does not authorize a production behavior change.
