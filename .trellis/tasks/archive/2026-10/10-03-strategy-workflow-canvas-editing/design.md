# Strategy canvas design

## Change boundary

The behavior gap belongs in the existing routing frontend. The current graph semantics, configuration API and canvas-layout schema remain the source of truth. The change covers node geometry, semantic output descriptors, direct connection controls, incomplete draft repair, layout arrangement and locale text. It does not add a graph execution engine or another canvas dependency.

## Output and geometry contract

Introduce a pure output projection beside the routing model. Stable output IDs identify question/criterion pairs, match/unmatched branches and pool member IDs independently of whether an edge is currently connected. Each output has a readable name and an optional canonical edge or connection intent.

Valid choice options each expose a right-hand result port leading to the ordered entry, with help stating that all question results are evaluated together. Questions also expose the fixed decision-failure path to the configured fallback. Unsupported types and fewer than two nonempty criteria are invalid pending drafts and block review. Rules expose match and unmatched outputs. A rule or fallback with no selected label retains its match output as an empty connectable port. Tag pools expose resolved members and a separate add port; explicit model pools expose read-only members. Model nodes have input only. Questions have output only. Other nodes have visible left inputs.

The last unmatched rule targets the first ordered policy label, and zero-rule result channels go there directly. This default uses the strategy's `policy.selection`, available through existing strategies metadata. The fallback node represents decision failure and uses `draft.fallback`. Correct the separate configured-route preview and captions at the same boundary; do not change the backend algorithm or introduce another persisted node namespace. If metadata is unavailable, report that the policy default is inherited rather than inventing a selection mode.

Keep the 190px node width and existing three-row identity header. Derive height from the output rows, using a consistent minimum spacing and full-size handles. Output captions align with port centers. Input and line endpoints use the same metrics. Geometry must be passed into bounds, marquee, translation, node reveal, board size and Fit; no remaining 56px assumptions may control expanded nodes. Long names truncate visually and remain available in accessible names and titles.

SVG wire hit paths use generous transparent strokes behind node cards. Visible input and output handles sit above the cards so they cannot be hidden by node clipping. Every interactive wire/port has a localized accessible name and keyboard activation. Wire arrowheads and visible captions communicate the left-to-right flow.

## Connection interaction

Selecting a wire opens a compact canvas action panel with its source, output and destination. The panel offers a destination selector, connect/change action, disconnect when supported and cancel. Starting on an unconnected output or a pool add port opens the same target selection. Clicking a compatible input/node or dragging an output to an input completes the draft operation. Escape cancels and returns focus to a visible control. Selection must not also begin a marquee or open an unrelated node inspector.

Extend `ConnectionIntent` and the centralized classifier for a new rule/fallback match and for clearing an existing match label. Clearing sets an empty label in the draft; the output slot remains. An incomplete draft displays a Chinese explanation and cannot enter review/apply. Pool membership edits preserve foreign tags and last-member/explicit-list guards. Fixed context and order edges can be selected and explain their constraints. A selected action derived from an old draft must not overwrite newer edits.

## Layout interaction

Provide explicit arrange-all and multi-selection alignment actions. The default and arrange-all stage columns follow question results, ordered rules/decision-failure fallback, label pools and model sinks. Place nodes with cumulative measured heights and consistent gaps, avoiding dense-node overlap. When the next row would exceed the available coordinate range, start another column; if the resulting layout exceeds representable capacity or byte bounds, report a localized error and leave the confirmed layout intact. Never collapse several positions onto the maximum y. Align-left and align-top act on the selected group only. Store the resulting integer positions through the existing serialized layout queue, enforce capacity and bounds, and preserve rollback behavior. No layout operation changes the draft.

## Text and appearance

Use “策略工作流”, “画布”, “输入”, “输出”, “命中”, “未命中”, “兜底” and “断开连线” consistently on the Chinese surface. Model/provider/label/question/criterion identifiers remain exact catalog values. Keep English messages in step. Nodes retain role icons and distinguishable borders; refine spacing, shared content baselines, hover, selection, focus and disconnected states using emitted Tailwind utilities and runtime theme variables.

## Verification and rollback

Unit tests cover output projection, stable IDs, growing/shrinking geometry, nonoverlapping handles, expanded bounds, alignment, stale intents and disconnect/reconnect payloads. Browser tests use synthetic fixtures and native mouse input for wire selection, input hit-testing, drag connections, direct and keyboard disconnect/reconnect, dense ports, option edits, alignment persistence, read-only reasons and review protection. Test both locales and themes at 320px, 390px, desktop and tall viewport sizes. Inspect screenshots and computed styles after rebuilding.

The implementation can be reverted as one frontend change with its tests/docs. Existing persisted layout positions remain valid because the wire schema and coordinate units are unchanged.
