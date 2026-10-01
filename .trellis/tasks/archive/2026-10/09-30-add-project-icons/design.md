# Dashboard icon integration design

## Boundaries

Add `lucide-react` to `frontend/` and migrate existing semantic UI icons. No backend API, routing policy, persistence format, localization contract, or canvas geometry changes are needed. Keep the current component structure and button hit areas.

The package selection and compatibility evidence are in `research/icon-library-decision.md`; `research/icon-inventory.md` records the glyph audit and resolved node-icon scope.

## Component changes

| Owner | Migration |
| --- | --- |
| `frontend/src/app/AppShell.tsx` | Refresh glyph only; retain the `J` brand mark and refresh text. |
| `frontend/src/features/routing/RoutingCanvas.tsx` | Select, pan, add rule, zoom plus/minus, and directional pan glyphs. Preserve `1:1`, Fit text, zoom output, and edge SVG. |
| `frontend/src/features/routing/RoutingEditor.tsx` | Drag grip, earlier/later actions, inspector close, and disclosure chevrons. Preserve arrows within textual rule descriptions and connector SVG. |
| `frontend/src/features/routing/components/CanvasNodeContent.tsx` | Replace the six semantic node-category paths with statically imported icons using a typed category map. Preserve category detection and all labels/summaries. |

Use direct named imports from `lucide-react`. Do not add a runtime string-to-icon resolver, import the full icon namespace, or generate raster assets. Check actual installed exports before fixing icon names. Choose familiar semantic matches for the existing meanings.

## Rendering and accessibility

- Inherit `currentColor` and existing theme tokens. Keep node icons at 14px and preserve their existing 1.8 stroke treatment; action icons should use the existing control SVG sizing where available.
- Explicitly hide decorative SVGs with `aria-hidden="true"` and keep them unfocusable. Buttons retain localized accessible names, visible labels, tooltips, disabled state, focus treatment, `aria-pressed`, and disclosure state.
- Keep DnD attributes/listeners on the existing drag button. SVG pointer handling must not interfere with drag, canvas hit-testing, or button activation.
- Use component props/classes for SVG sizing. Change CSS only if inspection proves existing control sizing insufficient; avoid global SVG rules that would affect diagrams.
- Preserve English and Chinese behavior and narrow-screen toolbar wrapping. Do not replace meaningful text with icons.

## Dependency and documentation

Install the researched `lucide-react@1.48.0` version with npm during implementation and commit the corresponding manifest/lockfile changes together. Do not upgrade React, Vite, or unrelated dependencies. The registry metadata supports the current React major, but lint, type-check, and build remain required compatibility checks.

Create a short developer usage guide at `frontend/README.md` (currently absent). Document static imports, decorative SVG treatment, accessible icon-only controls, sizing, and the distinction between semantic icons and custom diagrams. Review whether `.trellis/spec/backend/dashboard-routing-config.md` needs an icon convention after verification; preserve its unrelated existing changes.

## Verification and rollback

Add focused render tests for named controls and decorative SVGs. Existing routing tests must still cover drag/reorder, pan/zoom, inspector close, and disclosure behavior. Test node category coverage and text independently from path data.

Run lint, tests, production build, bundle staleness check, and the existing browser suite. In a browser, inspect both locales, desktop/narrow layouts, pointer and keyboard controls, node visibility, and unchanged diagram geometry. A passing pure-function test is not a browser check.

The worktree contains unrelated staged and unstaged edits. The task baseline and scoped patch are saved under the temporary baseline directory recorded in `research/implementation-evidence.md`. Review and commit only the task's dependency, icon-rendering, tests, documentation, and task-artifact changes. Do not stage or restore whole mixed files. No deployment or data migration is required.
