# Frontend icon migration inventory

## Scope and conventions

`frontend/` is the React 19/Vite/npm app, with no current icon dependency (per task context). `Button` accepts `size="icon"`; `.trellis/spec/backend/dashboard-routing-config.md` describes `npm --prefix frontend run lint|test|build` as frontend gates (lines 166–185). Canvas UI changes need responsive desktop/mobile and both-locale checks; the spec calls for browser verification of actual pointer gestures, keyboard alternatives, node hit-testing, viewport fitting, and drawer boundaries (lines 314–326). Keep this migration visual and behavior-preserving: retain names, pressed/disabled state, handlers, hit areas, and geometry.

## Semantic glyph inventory

| Location | Current glyph/use | Meaning and accessibility | Recommendation |
|---|---|---|---|
| `frontend/src/app/AppShell.tsx:172-180` | `↻` refresh | `ToolButton` already has localized `aria-label` and `title`; adjacent localized text appears at xl widths. | Replace with refresh icon; keep both accessible and visible labels. |
| `frontend/src/features/routing/RoutingCanvas.tsx:550-554` | `↖`, `✋`, `＋`, `−`, `+`, `← → ↑ ↓` | Select and pan tools have localized `title`/`aria-label`/`aria-pressed`; add-rule and zoom controls have localized names; directional pan buttons have localized `aria-label`. | Replace tool/action glyphs with icons; plus/minus and pan directions are controls, not data. Preserve accessible names and pressed state. `1:1` is a meaningful zoom-reset label and `Fit` is text, so keep. |
| `frontend/src/features/routing/RoutingEditor.tsx:127-137` | `⠿` sortable handle | Localized dynamic `aria-label` from `reorderRule`; drag attributes/listeners applied to same button. | Could use grip icon, retaining accessible name and DnD target. |
| `frontend/src/features/routing/RoutingEditor.tsx:169-185` | `↑`, `↓` rule reorder controls | Localized dynamic `aria-label` for earlier/later. | Replace with directional/reorder icons, preserve handlers, disabled conditions and names. |
| `frontend/src/features/routing/RoutingEditor.tsx:573` | `×` close inspector | `title` and `aria-label` use `closeInspector`. | Replace with close icon. |
| `frontend/src/features/routing/RoutingEditor.tsx:585` | `▾` / `▴` information disclosure indicator | Button has `aria-expanded` and `aria-controls`, but no explicit `aria-label`; visible localized text `canvasInformation` names the control. | Prefer disclosure/chevron icon with state driven by `infoOpen`; retain text and expanded semantics. |

The main additional semantic glyph surface found in frontend TS/TSX is above. There is no CSS/test selector dependency found for these glyph strings in frontend CSS or routing tests. Avoid tests asserting rendered Unicode icon text; assert button accessible names, state, and action instead.

## Keep as content or graphics

- `frontend/src/features/routing/RoutingEditor.tsx:77,83-86` and `frontend/src/features/routing/components/CanvasNodeContent.tsx:59`: `→` separates route condition/label and before/after values. It conveys data flow and change, not a toolbar icon.
- `frontend/src/features/routing/model/draft.ts:367`: arrow is part of a textual route description.
- `frontend/src/features/monitoring/components/RouteTrace.tsx:285`: `✓` marks a visited step in a numbered route trace; treat as status/data unless scope explicitly includes status iconography.
- `frontend/src/features/monitoring/components/StrategyDistribution.tsx:130,156` and monitoring tests: em dash is the unavailable/unknown count placeholder, not an icon.
- `frontend/src/features/routing/components/CanvasNodeContent.tsx:24,83-84`: six semantic node-category graphics were initially recorded as existing inline SVG paths. Planning review resolved these as in scope for replacement with typed, statically imported Lucide components; preserve their category mapping, 14px dimensions, 1.8 stroke, currentColor, and decorative accessibility attributes.
- `frontend/src/features/routing/RoutingCanvas.tsx:581-590`: route connector SVG paths are diagram edges and must remain.
- `frontend/src/features/routing/RoutingEditor.tsx:93`: route connector/edge SVG with dashed unmatched path; preserve.
- `frontend/src/app/AppShell.tsx:104-108`: `J` monogram is project branding, not an icon-library migration target.

## Tests and likely regression coverage

- `frontend/src/features/routing/__tests__/RoutingEditor.test.tsx`: editor controls and workflow behavior; inspect/update assertions if they target glyph child text. Preserve user-facing action names and state.
- `frontend/src/features/routing/__tests__/CanvasNodeContent.test.tsx`: node contents and SVG-adjacent representation; leave node category graphics and route summaries intact.
- `frontend/src/features/routing/__tests__/canvas.test.ts`, `drag-interaction.test.ts`, `layout-race.test.ts`, `ConfiguredRouteFlow.test.tsx`: canvas geometry, pointer interactions, layout, and route flow. Icon replacement should not alter node/edge graphics or pointer behavior.
- `frontend/src/app/AppShell.tsx` has no adjacent shell-specific test file surfaced by filename scan. Shared button contract test is `frontend/src/shared/ui/controls.test.tsx`; it verifies forwarding `aria-label` and disabled state. Consider accessible-role queries for refresh if shell behavior needs regression coverage.
- No CSS selectors depending on the listed glyph contents were found. The icon controls use class/role/accessibility attributes, so selectors should not be coupled to icon text.

## Bounded recommendation

Migrate the shell refresh; canvas select/pan/add/zoom/directional-pan controls; rule drag/reorder controls; inspector close; information disclosure; and six semantic node-category icons. Retain visible labels and all existing ARIA names/state. Leave route arrows, status/check marks, em-dash placeholders, connector diagrams, and the `J` brand mark untouched. Verify `RoutingEditor.test.tsx`, `canvas.test.ts`, drag-interaction behavior, shared button accessibility coverage, plus frontend lint/test/build and browser checks for canvas interaction and responsive layouts.
