# Mixboard-inspired strategy editor redesign

## Goal

Redesign the strategy editor as a cohesive visual workspace, using observed Google Mixboard layout and editing interactions as references. Help operators understand and edit supported module connections without changing the gateway's first-match strategy semantics or configuration contracts.

## Background

The current editor already has a workflow canvas, draggable nodes, an inspector, keyboard-accessible node and edge lists, and a draft/review/apply flow. Its policy is an ordered first-match matrix, while the canvas visualizes and edits that matrix. Canvas layout is stored separately from policy configuration.

Relevant implementation includes `frontend/src/config/RoutingEditor.tsx`, `frontend/src/config/RoutingCanvas.tsx`, `frontend/src/config/draft.ts`, `frontend/src/config/canvas.ts`, `frontend/src/styles.css`, and `frontend/src/i18n.tsx`. The project contract is `.trellis/spec/backend/dashboard-routing-config.md`; related workflow planning is in `.trellis/tasks/09-24-dashboard-routing-workflow/`.

## Requirements

- Ground the redesign in Mixboard editing interactions that have been observed in the official landing page and video. Record inaccessible or unverified details rather than treating them as confirmed behavior.
- Unify visual style and editing UI. Editing controls, affordances, and feedback should belong to the same Mixboard-inspired workspace. Include object selection and context actions, viewport zoom, and layout-only multi-selection/marquee movement; multi-selection must never apply bulk policy edits.
- Adopt the constrained-workspace direction: retain the strategy editor's ordered first-match policy model. Plan an explicit editor-side compatibility matrix for existing module and connection types, with visual affordances for supported targets and clear feedback for rejected links. Do not create new policy relationships that the current schema cannot represent.
- Keep policy changes within the existing draft, validation, review, apply, and reset flow.
- Keep visual layout state separate from routing policy state.
- Reserve a future prompt-based strategy-generation entry point in the workspace structure, without implementing prompt input, AI generation, or an API in this task. The reservation must not expose a non-functional control or persist prompt data.
- Retain keyboard-accessible ways to inspect and edit supported workflow elements.
- Keep the interface consistent with the dashboard's English and Simplified Chinese support.

## Acceptance Criteria

- [ ] Planning artifacts document the Mixboard interactions directly observed in official sources and distinguish them from unverified or unavailable behaviors.
- [ ] The workspace design reserves an integration boundary for future AI-generated strategies, while this task ships no visible prompt control, AI behavior, endpoint, or prompt persistence.
- [ ] Planning artifacts define the cohesive workspace visual design and editing interaction UI, informed by the observed Mixboard interface and grounded in existing editor constraints.
- [ ] Operators can zoom the board and select/move multiple modules for layout only; node coordinates persist unscaled, and these gestures do not mutate routing policy.
- [ ] The plan defines an explicit connection compatibility matrix for strategy module types, explains allowed and blocked connections, and states how validation and user feedback work for pointer and keyboard input.
- [ ] Changes to available module connections are treated as an editor capability boundary. They do not imply arbitrary DAG execution or a strategy-engine semantic change unless later approved.
- [ ] The validate/review/apply/reset lifecycle and separate layout persistence remain intact in the planned scope.
- [ ] The plan describes keyboard access for core editor actions.

## Out of Scope

- Changes to routing semantics or the strategy engine.
- Arbitrary DAG execution, collaboration, or per-user canvas persistence.
- Changes to provider credentials, provider configuration, or catalog storage.

