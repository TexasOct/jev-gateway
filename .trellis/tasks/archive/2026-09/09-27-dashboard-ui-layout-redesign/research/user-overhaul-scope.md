# Full frontend overhaul scope

## Confirmed requests

- Completely redesign the frontend's visual language and interactions.
- Aim for a simple, attractive, Excalidraw-inspired workspace.
- Monitoring stays a structured inspector, not a canvas.
- Strategy workflow becomes the primary visual route map, with a Magpie-inspired branched flow and purposeful motion.
- The map represents configured policy only. It must not show observed traffic distributions, percentages, or implied frequencies.
- shadcn/ui may be introduced if needed for reliable base components.
- Preserve the gateway's policy semantics, evidence meaning, validation/review/explicit-apply safety, auth boundaries and independent canvas-layout storage unless separately approved.

## Proposed visual/interaction direction

- Compact application shell with a small number of clear top-level destinations and contextual actions.
- Excalidraw-like workspace: generous canvas region, floating grouped tool shelf, minimal surfaces, context-sensitive inspector and collapsible advanced information.
- Monitoring remains list/detail structure with fast reading order and optional evidence detail.
- Strategy diagram uses existing question/rule/fallback/label/model graph generated from the first-match policy. Distinguish configured alternatives by connector style, labels and node types. Animate only a selected/previewed configured path or a user-triggered explanation; provide static equivalent and honor reduced motion. Animation does not represent real request execution or frequency.
- shadcn components are an optional foundation, not a target aesthetic. If used, adopt only primitives needed and restyle them to the project tokens; avoid adding a second design system or wholesale replacement of canvas/editor contracts.

## Constraints and unresolved planning checks

- Several active dashboard tasks already touch `App.tsx`, `styles.css`, `RoutingEditor.tsx`, `RoutingCanvas.tsx`, and i18n. The previous implementation is uncommitted. Before implementation, identify exact current ownership and preserve it.
- Full redesign changes navigation, layout and some interaction affordances; it supersedes the earlier preserve-navigation/behavior-only presentation scope where the latest request clearly requests a complete redesign, while preserving routing and safety semantics.
- Need confirm which interactions the Excalidraw analogy means beyond canvas/tool-shelf structure: e.g., draw/select/pan parity, keyboard shortcut expectations, multi-select, undo/redo. Existing editor already supports some of these; do not promise new behavior without audit.
- Need specify whether user-triggered path animation is an explainer using current policy nodes or merely a passive visual accent, and what to do for multiple matching branches (first-match order).
- Need assess shadcn integration compatibility with current Vite/CSS/TypeScript stack from authoritative package docs before deciding to add it.
- This is a planning artifact. No new interaction or product code is approved by this note.
