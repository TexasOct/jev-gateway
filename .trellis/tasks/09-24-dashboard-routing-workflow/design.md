# Design: dedicated AI workflow editor

## Architecture and page boundary

`App.tsx` should treat monitoring and strategy configuration as distinct views. The strategy view is a dedicated full-workspace editor: header toolbar for save state, undo/cancel and zoom/fit; central scrollable/pannable board; selectable node inspector. Theme seed/contrast controls leave the strategy view and remain available from a separate appearance view or collapsed secondary area.

Use existing React, pointer events and SVG for an AI-workflow feel: clear ports, directional Bézier edges, selection outlines, live connection preview, invalid-drop feedback, grid/background and viewport controls. Prefer no new graph dependency. Rules may be added/removed from the draft. Existing `rule-N` keys identify ordered slots rather than immutable rule identity; on reorder/insert/delete, update selected-node state and shift or reset affected layout positions so coordinates do not silently attach to a different rule. Provide a semantic node/edge navigation list as a keyboard-accessible alternative.

## Routing semantics and connection mapping

The runtime remains the existing ordered first-match matrix. Draw question context into the rule chain, each rule's match edge to its selected label and its unmatched edge to the next rule; the final unmatched path goes to fallback. Labels connect to effective model members. A visual connection is accepted only when it maps to the schema:

- Rule `match` to label: set `rules[index].select.label`.
- Rule `unmatched` to a later rule: reorder the intervening sequence so the chosen rule becomes the immediate next rule. The source stays before the destination. No cycle, skip edge, parallel branch, or arbitrary target.
- Final unmatched to fallback is fixed by first-match semantics; it can be displayed but not disconnected/reassigned to another node. Fallback's label target is edited through its node/port selector.
- Label pool to model: update only `{strategy}/{label}` membership tags on tag-resolved labels. Explicit-model labels are read-only. Adding a fresh pool edge begins from a dedicated output port.
- Questions are context/input nodes, not executable branches; attempts to wire arbitrary question-to-model or question-to-fallback routes are rejected.

All accepted gestures update `RoutingDraft` only. Then the existing review flow validates the exact serialized overlay, displays changes and warnings, requires explicit confirmation, and applies atomically. A connection gesture must never write policy directly.

## Layout file and API

`jev_gateway/canvas_layout.py` owns `routing-canvas-layout.json`, located beside the active catalog. Version 1 schema is `{version: 1, nodes: {stable_node_id: {x, y}}, viewport: {x, y}}`; unknown fields are rejected, node count/coordinate/file-size bounds are enforced, and valid Unicode catalog IDs are allowed while control characters are rejected. Use compact UTF-8 JSON for the byte cap, temp file plus `os.replace` for atomic writes, and the process umask for permissions. Missing file returns defaults; corrupt content returns defaults plus a safe read error.

`GET /v1/dashboard/canvas-layout` uses existing read authorization. `PUT` uses `require_config_write`, strict validation and atomic replacement. Layout writes do not call engine reload, modify `routing-overrides.json` or `models.json`, register config versions, or change the policy hash. Layout is installation-wide, shared across browsers; writes are atomic last-writer-wins with no multi-user collaboration guarantee. Layout API failures must not disable policy editing. Client should avoid stale-load overwrites of user changes and serialize/coalesce writes, preserving the latest confirmed layout on failure.

## Cursor pagination boundary

Session/request pagination is owned by `.trellis/tasks/09-24-dashboard-session-list/design.md`. This task integrates with the current API and fixed-height virtual list but must not implement an alternate cursor or retention contract.

## Compatibility and rollout

Version 1 policy overlays without `questions`/`fallback` continue to inherit baseline values. New fields remain optional and strict; unsupported extensions cause older versions to reject the overlay and display a warning while falling back to baseline. `rules: []` means no conditional rules; omitted `rules` preserves baseline rules when another supported override is supplied. Layout file version is independent from policy overlay version and can be reset/defaulted without touching strategy state.

## Verification and risks

Test `canvas_layout.py` shape/bounds/atomic write/corrupt fallback; API auth and layout-policy isolation; graph-to-draft transformations; actual browser pointer drag for nodes and source/target ports; review-before-apply; and fixed screenshot viewport in both locales. Pointer coordinates must be translated relative to the board, not an individual SVG handle. `pointercancel`, stale edge after draft changes, rapid layout save ordering, and malformed server layout must leave a usable editor.

A pure edge mapping test does not validate browser hit testing or pointer capture. Browser interaction tests are required before marking drag UI accepted.

## Routing semantics

Render request/question context followed by ordered rules. Each rule has a match edge to its selected label and an unmatched edge to the next rule; the final unmatched edge reaches fallback. Shared label destinations may accept multiple match edges. Model-pool nodes show resolved models and selection semantics. This reflects first-match-wins behavior in `DecisionMatrixStrategy.decide`.

## Editing and overlay contract

Stable node IDs map to live draft slots: `rule-N` is the Nth first-match rule, label nodes use resolved tag IDs, and model nodes use canonical catalog IDs. Dragging a rule match edge changes `rules[N].select.label`. Dragging an unmatched edge to a later rule reorders the intervening rule segment so the selected rule immediately follows the source; dropping the final unmatched edge anywhere except fallback is rejected. Dragging a pool edge changes only the `{strategy}/{label}` membership tag for tag-resolved labels. Edges to explicit-model labels or arbitrary targets are rejected. Each successful gesture changes only `RoutingDraft`, so strategy edits still pass through validate/review/confirm/apply.

Extend the current overlay from `{version, strategy, rules, models}` to support complete `questions` and `fallback` overrides. Rules already carry complete `when` and `select`, so condition editing is represented in the existing rules array. Merge supplied fields onto the baseline strategy's options; absent fields preserve baseline behavior for old overlays. Validate the merged full catalog before disk writes and before engine swap. Keep rollback behavior on failed persistence/reload. Reject unknown fields and invalid question-condition references. Preserve the existing complete rule-list replacement semantics. `rules: []` is a valid explicit empty rule set; omitted `rules` leaves baseline rules unchanged when another override field is supplied.

Expose effective questions and fallback through the configuration read API. Build editor controls from available question definitions, criteria, labels, and selection modes; avoid free-text values where constrained options are known. Question changes that invalidate conditions elsewhere must be surfaced and rejected by whole-catalog validation.

All mutations update `RoutingDraft`, then pass through explicit review, server validation, user confirmation, and apply. Save continues to write only `routing-overrides.json`; reset removes the overlay. Keep write authorization and credential-in-memory rules unchanged.

## UI and accessibility

Implement a pannable/zoomable or scrollable whiteboard with positioned HTML nodes and SVG connectors using the existing frontend stack, without adding a graph library unless research shows a necessary accessibility/maintenance benefit. Nodes are draggable; supported edges can be dragged to a new compatible target or removed. Use keyboard alternatives for moving nodes and editing/reassigning connections, with focus indicators and an accessible node/edge list fallback. On narrow screens, keep the board usable through scroll/pan and offer node details in a responsive inspector.

Persist layout to a dedicated server-side layout file beside the active catalog, independently from policy, including schema version, stable node IDs, x/y positions, and viewport state. Add authenticated layout read/write endpoints that use the existing configuration-write guard. Validate layout shape and bound coordinates/size; ignore or reset unsupported/corrupt layout without blocking routing configuration. Layout writes must not reload the routing engine, increment policy config versions, or modify `models.json`/`routing-overrides.json`. All UI labels use the shared i18n provider.

## Compatibility and rollout

Version 1 overlays that omit `questions` or `fallback` remain valid and inherit those values from `models.json`. New fields are optional but strictly validated; unknown fields remain rejected. The supported rollout is forward-only: an older binary that encounters a newer overlay with `questions` or `fallback` fields rejects that overlay under its unknown-key policy and falls back to the baseline catalog with an overlay warning. Document this downgrade limitation and test it explicitly. A supplied `rules` field replaces the full rule list; an empty list means no conditional rules and therefore the fallback is used. Omitted `rules` preserve baseline rules when another supported override is supplied. No baseline migration is required. Invalid writes leave the active catalog and overlay unchanged.

## Risks

- Replacing question definitions while rules reference their criteria can make the whole strategy invalid; validate atomically and present attributable errors.
- A stored layout contains operator-chosen coordinates and node arrangement. Apply strict size, position, identifier, and JSON-shape bounds; no user content or credentials belong in the file.
- Connection edits must not imply unrestricted graph execution. They must map deterministically onto the current rule matrix and reject connections that cannot be represented.
- The layout file is installation-wide and shared across browsers. Atomic replacement prevents partial files, but the current API is last-writer-wins across clients; it does not provide compare-and-swap revisions or multi-user collaboration.
- A question `instructions` field may contain prompt text. Show it in the editor, but do not expose credentials or write user-request data into configuration.
- Treat the whiteboard as the primary editor. Keep any legacy list editor only as a collapsed accessibility/advanced fallback so the new interface does not duplicate all controls on initial render.
