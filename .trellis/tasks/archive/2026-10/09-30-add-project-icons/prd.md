# Add an icon library to the project

## Goal

Give the dashboard a consistent, maintainable icon system that replaces ad hoc Unicode glyphs and hand-drawn icon paths where appropriate.

## Background

The React/Vite frontend currently has no icon package. The shell and routing UI use Unicode glyphs and local inline SVG paths; shared button styles already size child SVGs. The frontend uses npm.

## Requirements

- Evaluate `lucide-react` and any clearly better-fitting alternatives for this React dashboard, considering tree-shaking, accessibility, visual consistency, maintenance, and project compatibility. Record the evidence and selection in task research.
- Add the selected icon library as a frontend dependency and document a simple, consistent usage pattern.
- Migrate shell refresh; canvas select/pan/add/zoom/directional-pan actions; rule drag/reorder actions; inspector close and information disclosure; and the six semantic node-category icons. Keep meaningful control text such as `1:1` and Fit.
- Give icon-only controls accessible names, hide decorative icons from assistive technology, and preserve keyboard/pointer behavior, disabled/pressed/disclosure state, English/Chinese localization, theme styling, and responsive layout.

## Acceptance Criteria

- [ ] The selected icon package is installed and lockfile is updated.
- [ ] Every action and node-category icon listed in the requirements uses the selected library; custom diagram geometry remains unchanged.
- [ ] Icon-only actions retain their accessible labels and state, and decorative SVGs do not add screen-reader names or keyboard focus stops.
- [ ] The developer guide explains static imports, sizing, accessible icon-only controls, and when custom graphics should remain.
- [ ] Existing UI behavior, layout, and tests remain intact; frontend lint, tests, and production build pass. Browser checks confirm both locales, desktop/narrow layouts, pointer and keyboard controls, and readable node icons.

## Out of scope

- Replacing diagram geometry, route connectors, animated trace graphics, or bespoke illustrations with library icons.
- Changing the `J` brand mark, route arrows inside data descriptions, unavailable-value placeholders, or monitoring trace status content.
- Broad redesign, new icon-only actions, backend changes, or behavior changes unrelated to icon integration.
