# Design: Mixboard-inspired strategy workspace

## Evidence and scope

The interaction evidence and access limits are in `research/mixboard-interactions.md`. The official video shows a pale dotted open canvas, compact project and zoom controls, a small tool rail, object selection outlines and floating actions, a multi-object selection rectangle, and a bottom prompt composer. The authenticated Mixboard editor could not be inspected directly. Reuse the observed interaction grammar, not unverified shortcuts, image-specific actions, sharing, or image-generation semantics.

This is one integrated editor redesign. Workspace chrome, selection/context actions, and connection feedback all share the same `RoutingEditor`/`RoutingCanvas` state and need one end-to-end review; splitting them into separate Trellis tasks would duplicate the interaction contract.

## Workspace and editing UI

Keep the strategy view as a dedicated workspace. Give the board most of the available width, a subtle dotted background, sparse elevated module cards, a compact workspace header for strategy name, edit status, viewport controls and review/apply/reset, and a compact tool rail containing only actions the routing editor can perform. The current inspector remains the detail surface, but selected-node outline and a nearby context action bar expose relevant edit actions, such as open details, add a rule when available, or begin a compatible connection. Avoid icon-only ambiguity with tooltips and accessible names. Do not reproduce Mixboard's Share control or image-generation controls.

Single selection remains the primary policy editing mode. A marquee or additive selection selects several modules for layout-only group movement, with the inspector falling back to a selection summary; it must not create a bulk policy mutation, silently reorder rules, or imply grouping in the persisted schema. Blank-board gestures and node/edge gestures must be distinguishable; clicking versus dragging a node must not create unintended policy changes. If this interaction fails browser checks, pause the release for an explicit scope decision instead of silently omitting it.

Keep the existing scroll-based board and add transient local zoom controls (zoom in/out, reset or fit); verify pointer mapping before acceptance. `CanvasLayout` version 1 continues to store integer node positions and scroll viewport only; zoom is per-client UI state and is not persisted. Transform and inverse pointer coordinate math must agree for dragging and edge hit-testing; never save scaled coordinates. A responsive inspector becomes a lower panel on narrow viewports. Respect reduced-motion and focus visibility. The old list/chip editor can remain behind an explicit advanced/accessibility affordance during transition, but must not compete with the board as the primary editing surface.

The official bottom prompt composer is excluded from this release. Reserve a named, non-rendered composition boundary in the workspace implementation for a future AI strategy proposal surface. Future generation should produce a proposal consumed by the same draft/validate/review/confirm/apply pipeline and require a separately designed API, safety and authorization contract. Do not add a disabled composer, dead placeholder, prompt persistence, speculative server endpoint, or automatic apply.

## Connection compatibility contract

`workflowEdges` in `draft.ts` remains the sole graph projection from `RoutingDraft`; visual links are not persisted in the layout file. Centralize a pure connection-intent classifier in `canvas.ts` that returns an operation and an allowed/blocked reason. Both pointer preview and keyboard target lists consume it. Existing mutation functions remain authoritative and re-check stale edges on commit. The matrix below describes supported operations; anything else is rejected and leaves the draft unchanged.

| Source / intent | Target | Representable operation | Rejection and special cases |
| --- | --- | --- | --- |
| `questions` context | `rule-0`, or `fallback` only when no rules | Display-only derived first-match entry | No user-created, deleted, or rewired context edge; other targets blocked. |
| `rule-N` existing `match` edge | Known `zone::tag` label | Update `rules[N].select.label` | Unknown label, stale edge, or invalid target blocked; server validation still decides catalog validity. |
| `fallback` existing `match` edge | Known `zone::tag` label | Update fallback label | Other targets and stale edges blocked. |
| `rule-N` existing `unmatched` edge | A later `rule-M` with `M > N+1` | Move that rule immediately after N; derive the chain again | Earlier/same rule, arbitrary skipping/cycles, or stale edge blocked; existing successor is no-op. The last path to fallback remains fixed. |
| `zone::tag` tag-resolved label, new `pool` edge | Existing `model::id` not yet tagged | Add label membership tag | Duplicate link, explicit-model label, or unknown model blocked. |
| `zone::tag` existing `pool` edge | Existing model not yet tagged, or its current model | Move membership (remove old/add new), or no-op | Refuse removal of last resolved member; explicit-model label and stale edges blocked. |
| `zone::tag` existing `pool` edge, remove | Its connected model | Remove membership tag | Keep at least one resolved model; explicit-model label read-only. |

A connection attempt starts from a visible, labeled port or selected-edge action. During drag, only compatible targets receive the active highlight; incompatible targets remain identifiable and may expose a reason by tooltip/status. On invalid drop, restore the original edge and announce a localized, specific reason through `role=status` or an equivalent accessible live region. Cancellation, pointercancel, disabled edits and stale gestures make no changes. The keyboard equivalent selects source/intent, lists compatible targets and allows cancel; rejection reasons remain available for excluded target classes. Edge-edit controls may remain in the semantic edge list for accessibility.

Do not turn the visual matrix into a free DAG. In particular, questions are context, rule order is the priority order, `fallback` has a fixed entry path, explicit-model labels have read-only membership, and model priority is not implied by layout order. Connection rules may be clarified or surfaced differently, but no new executable relationship is introduced.

## State, persistence and rollout

`RoutingEditor.tsx` owns policy draft, review/apply/reset and selection. `RoutingCanvas.tsx` owns local viewport/selection gestures and layout persistence, using shared pure helpers in `canvas.ts`; `draft.ts` owns graph projection and policy mutations. The proposed AI surface only receives a future design seam and does not mutate the current payload. The backend API and layout JSON remain unchanged. Layout writes stay independent of policy and guarded by existing authorization. Policy edits stay pending until server validation and explicit confirmation.

Keep i18n keys paired in English and Simplified Chinese. Read-only mode shows selection and inspection without mutation affordances. Invalid/corrupt layout keeps default positions and does not block policy editing. A failed layout save rolls back to the last saved layout without rolling back an independent policy draft. Since changes are frontend-scoped, rollback is restoring the previous editor bundle; existing overlay and layout files remain readable.

## Risks and verification

- Pointer capture and hit-testing over SVG/HTML may break when zoom or marquee is added. Verify real pointer sequences, cancel, scroll and narrow viewport in a browser, not just pure helper tests.
- Rapid layout writes and topology slot shifts must retain current serialized write/rollback behavior; rule `N` remains a slot identity.
- A tooltip-only invalid-link explanation is insufficient for touch and keyboard input; pair visual affordances with persistent or announced reasons.
- Group selection is layout-only and must not silently alter routing. If it cannot be delivered reliably, stop for a scope decision rather than shipping a misleading affordance.
