# Design: full-canvas routing editor

## Scope

Keep the current single-strategy (`task_aware`) routing contract and draft/validate/review/apply flow. Reshape the frontend workspace around the canvas. Do not add strategy selection, new routing relationships, or new backend configuration APIs.

## Workspace structure

`RoutingEditor` remains the owner of the policy draft, selection and review lifecycle. The strategy view fills the viewport remaining below the shared application header. Give this view a scoped layout in `App.tsx` and `styles.css`; do not change monitoring or appearance sizing. Account for the actual shared header height, including wrapping on narrow screens, rather than subtracting a fixed pixel value.

The actual scrollable canvas fills this workspace, replacing the nested padded configuration card and fixed `72dvh`/minimum-height board. Strategy title, status, warnings, inspector and tool controls live in unscaled overlay regions within that same workspace. Important errors remain visible and reachable. Enlarging only the outer card does not satisfy the requirement.

Consolidate help, accessible node/edge lists, source information, advanced editors, pool order and pending changes into a bottom drawer inside the workspace. Start it collapsed to a compact summary/action strip. Cap the expanded drawer height and scroll long contents inside it. Keep review/apply/cancel/reset and acknowledgement controls accessible within this boundary. Opening the add-rule form opens its drawer section; creating a rule reveals the node on the canvas. All advanced sortable/model/drop-zone controls must remain under their existing `DndContext`.

Reserve occupied overlay/drawer regions when positioning the toolbar and inspector and when fitting/revealing a node. Expansion must not extend the document into a second page of editor controls. Preserve keyboard navigation and announcements; closing a drawer or inspector must not discard policy drafts.

`RoutingCanvas` owns transient canvas tool mode and viewport gestures. Add a compact floating toolbar overlay positioned with safe margins, with accessible controls for selection, pan/navigation and adding a rule node. The toolbar mode must be visibly selected and keyboard-operable. Add-rule invokes the existing add-rule workflow with existing question, criterion and label selection; the control should guide the user to that workflow rather than bypass draft validation or invent a new rule shape. Do not add unrelated node types.

## Node movement and visual hierarchy

Selection clicks open details; drag gestures move layout only. Preserve pointer capture and capture the initial pointer, node coordinates, zoom and starting layout once per gesture. Show a movement state during capture. Do not reposition the pointer's active node by revealing/auto-panning the inspector until pointer-up, or the gesture will jump. Clamp all selected nodes by their joint bounds, preserve relative offsets, and write only on successful release. Pointer cancel restores the gesture's starting layout without a PUT. Keep keyboard Alt+arrows as the single-node/multiselection alternative, with equivalent bounds. On successful release queue exactly the strict layout payload.

Render a visible type name and simple inline icon/shape per node role: question entry, ordered rule, fallback, tag label pool, model. Vary border treatment and restrained surface/accent tint so meaning survives grayscale and color-vision deficiencies; do not rely on color alone. Keep the existing selection ring, compatible/incompatible connection feedback, 190px card target and port semantics distinguishable. Provide compact one-line role-specific summaries where existing data allows, with full details remaining in the inspector. Long titles wrap safely without covering the connection port or changing hit bounds. Test light/dark theme, focus, selected, dragging and connection states without changing graph topology or execution meaning.

## Anchored inspector

Move the node editor into a floating inspector associated with the selected node. Keep it outside the transformed/scaled node layer so form controls retain normal readable size. `RoutingCanvas` reports selected node viewport bounds to `RoutingEditor` (or exposes a stable node element reference); `RoutingEditor` positions the inspector from those bounds. Recompute on node movement, scrolling, zoom, resize, selection change, and bottom-tray expansion. Clamp the panel inside the visible workspace and account for toolbar/tray occlusion. The panel has bounded width and height, an internally scrollable content region, and a persistent heading/close control. On narrow viewports, use an available-area anchored panel/sheet that remains dismissible and does not make canvas controls unreachable.

Inspector edits continue to mutate the existing draft only. Honor `editDisabled`. Closing the inspector changes selection/UI state only; it must not discard draft state or invoke policy mutation. Multi-selection remains layout-only.

## Persistence boundary

Continue using `GET/PUT /v1/dashboard/canvas-layout` and the independent `routing-canvas-layout.json`. Preserve the current strict `{version, nodes, viewport}` schema, authorization, bounds, default/corruption fallback and atomic persistence. Persist only unscaled node positions and current supported viewport fields. Do not add policy data, node rule bodies, edges, active tool mode or strategy identity. Canvas gestures save through the layout endpoint only; they must not call configuration validate/apply or alter policy hashes/versions. Keep strategy topology mutations reconciled through existing layout helpers.

## Compatibility and accessibility

Keep policy connections and ordering as currently represented. Toolbar and inspector controls need localized English and Simplified Chinese text, visible focus states, accessible names, and keyboard operation. Use status/live-region feedback for incomplete or blocked actions. When writes are disabled, show read-only canvas controls and suppress policy mutation actions while allowing layout behavior according to existing contract.

## Failure and rollback

A layout load failure continues to use default positions. A failed layout save retains the last persisted layout and does not roll back policy draft state. Policy validation/review/apply errors remain on their existing path. Since this is a frontend workspace change, rollback is the previous frontend implementation; no migration is planned for the backend layout contract.

## Verification risks

Measure the actual canvas height in tall screenshots as well as ordinary desktop and narrow viewports. The canvas must use the remaining screen space, with bounded internal scrolling for drawer content. Preserve the existing drag-verification gap until native pointer input moves a hit-tested node, produces only a layout PUT and survives reload; do not attribute a failed drag to tooling without evidence. The inspector positioning must track real DOM bounds when browser pointer capture, zoom and scroll are active. Bottom-tray expansion can change available canvas geometry. Verify actual browser behavior at desktop and narrow widths, not only CSS assertions or pure coordinate tests. Confirm that layout movement causes only layout PUTs and policy edits still require validation and explicit apply.