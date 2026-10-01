# Tailwind-first migration decision

## User decision

The user asks to replace native CSS with Tailwind to reduce manual styling effort. shadcn/ui is permitted where reliable foundations are needed, but is not itself mandatory. This supersedes the previous no-new-dependencies/native-CSS constraint for the new full redesign; existing uncommitted frontend work remains the baseline and must not be discarded.

## Official sources consulted

- Tailwind's current Vite integration: install `tailwindcss` and `@tailwindcss/vite`, add `tailwindcss()` to the Vite plugins, then import Tailwind CSS. https://tailwindcss.com/docs/installation/using-vite
- For an existing project, Tailwind v4 supports importing theme and utilities without Preflight; importing the full package includes the global reset. https://tailwindcss.com/docs/preflight
- A separate architecture audit covers shadcn's Vite integration and exact project risks in `research/overhaul-architecture.md`.

## Migration approach proposed for review

1. Add Tailwind v4 and the Vite plugin centrally. Preserve `base: /dashboard/`, `outDir: ../jev_gateway/static`, existing CSP, and bundle packaging.
2. Import Tailwind theme/utilities without Preflight initially. Existing global element styles and virtual-list/canvas geometry depend on explicit CSS. Removing reset conflicts first is safer than introducing two simultaneous resets.
3. Map Tailwind utility colors/radii/spacing onto existing seed-derived CSS variables. The dynamic `data-scheme` palette stays the authority for light/dark and custom seed; do not replace it with static Tailwind colors or `.dark` localStorage state.
4. Convert shared shell, monitoring, appearance and simple controls to utilities/component primitives in slices. Retain a small dedicated CSS layer for graph coordinate transforms, pointer-hit regions, measured overlay geometry, SVG path effects, virtual list dimensions, and theme variable definitions. A zero-CSS rule would force fragile utility strings for geometry-critical behavior.
5. Consider shadcn only after core migration passes. Add selected components if native controls cannot satisfy accessibility and focus behavior. shadcn brings alias/config, primitive and theme integration work; do not wholesale scaffold or overwrite `styles.css`.
6. Verify build, lint, frontend tests, packaging/CSP, keyboard, reduced motion, mobile, and pointer hit testing after each slice.

## Open product approval boundary

This migration changes the toolchain and a large part of the stylesheet. It is authorized in principle by the user's direction, but the revised PRD/design/implement plan still needs final review under Trellis before package installation or source edits. The user chose to preserve existing strategy-canvas actions and defer undo/redo. The revised PRD/design/implement plan is ready for user review; no package install or product edits occur before the fresh implementation approval.
