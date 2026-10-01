# Shared visual system design

## Boundary

Keep `App.tsx` as API/auth/session/theme orchestration owner. It continues to mount the existing three views; shell layout and props may change without creating a second route or state store. This child integrates monitoring's new read-data props and new locale keys, but monitoring-specific aggregation/presentation is owned by its sibling.

## Tokens and controls

Use `frontend/src/theme/palette.ts` to derive neutral backgrounds/surfaces and borders from the saved seed while retaining seed-derived primary/selection accent and semantic statuses. `frontend/src/tailwind.css` maps shadcn-like roles onto those runtime variables, and `data-scheme` remains the scheme selector. Keep Tailwind v4 without importing Preflight over the existing base; migrate native styles in controlled steps. Extend the project-owned Button/Card/Separator only for shared use. Do not run shadcn CLI scaffolding or introduce a second global theme.

The compact navigation and action strip adapt to narrow widths with visible keyboard targets, preserving monitoring, strategy, appearance, theme, locale and refresh behavior. No external fonts/assets. Scheme/seed values continue through the current theme API; credential stays in `src/api.ts` module memory and only locale persists in browser storage.

## Integration and rollback

Own `src/App.tsx`, `src/main.tsx`, `src/i18n.tsx`, `src/styles.css`, `src/tailwind.css`, `src/theme/palette.ts`, `src/ui/`, and package/Vite changes if required. Siblings own only view-specific files. Preserve geometry-critical canvas CSS and fixed virtual-list row sizing through each migration. Revert only reviewed shared-file hunks if computed styles, pointer geometry or accessibility regress.
