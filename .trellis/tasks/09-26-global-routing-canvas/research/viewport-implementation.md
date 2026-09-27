# Viewport workspace implementation

## Scope

This pass changes the frontend workspace and this report. It preserves the existing staged and unstaged implementation. No reset, stash, stage, commit, backend edit, release edit or backend test command was run. The frontend build regenerated the ignored dashboard bundle under `jev_gateway/static/`.

The PRD acceptance boxes are unchanged. Browser acceptance remains with the parent agent. The earlier report's pointer-drag claims do not establish a broken drag handler: the reported mobile hit test reached the inspector fieldset rather than the node. Pointer capture has no synthetic-event exception workaround.

## Changes

- `frontend/src/App.tsx`: the strategy view uses `.app-shell.strategy-shell`, a `100dvh` grid with an auto-sized shared-header row and a `minmax(0, 1fr)` main row. Header wrapping therefore changes the space available to the workspace without a hard-coded header height. Monitoring and appearance keep their existing main layout. Strategy errors are passed into the workspace overlay.
- `frontend/src/config/RoutingEditor.tsx`: removes the enclosing padded panel. The editor owns one `.workflow-workspace`, its inspector and bottom drawer. A render slot from `RoutingCanvas` places the canvas-owned help and connection controls into that drawer. The entire composition remains below the existing `DndContext`, including sortable rules, model chips and drop zones. The drawer starts collapsed; its body scrolls internally while the action row remains available. Add rule opens and focuses the existing question/criterion/label form. Review opens and focuses the review content. Selecting a node from a list closes the drawer and reveals that node. Escape closes the inspector, then the drawer, with focus restored.
- `frontend/src/config/RoutingCanvas.tsx`: the scroll surface fills the workspace. Title, policy warnings, layout errors and interaction feedback share a bounded top overlay. The select/pan/add-rule/zoom toolbar sits above the measured drawer. Fit, reveal and anchor reporting use the same measured free rectangle. The canvas content has an unscaled top offset and bottom scroll clearance so nodes near coordinate zero or the board end can be reached without sitting behind chrome. Pointer-to-board conversion includes that offset. Fit feedback is visible while the drawer is collapsed.
- `frontend/src/config/canvas.ts`: adds shared DOM/pure helpers for subtracting measured top and bottom overlay bands. Inspector placement prefers a side of the node and otherwise uses space above or below it, reducing its height instead of covering the selected node. The inspector stays internally scrollable; if the remaining space cannot hold a heading, it is not shown.
- `frontend/src/styles.css`: removes both fixed board-height rules. The canvas frame and scroll surface fill the positioned workspace. Drawer expansion is capped at `min(48%, 36rem)` and its body owns scrolling. At narrow widths, the canvas toolbar and review-action strip scroll horizontally instead of consuming several rows. The inspector heading remains outside its scrolling body.
- `frontend/src/config/RoutingEditor.test.tsx`: retains the DnD provider-boundary tests and adds checks for a collapsed drawer, workspace ownership, action placement and visible error placement.
- `frontend/src/config/canvas.test.ts`: adds mobile node/inspector non-overlap and measured-chrome geometry cases, including 1430×2511, 1280×800, 390×844 and 320×700 viewports. Existing layout and policy-boundary tests remain.

No new UI strings were needed; the workspace reuses the existing English and Simplified Chinese messages. Layout serialization remains `{version: 1, nodes, viewport}`. No policy fields, connections or tool state were added to it.

## Verification

Final commands:

| Command | Result |
| --- | --- |
| `npm --prefix frontend run lint` | Passed with zero errors and four existing `react-refresh/only-export-components` warnings in `i18n.tsx` |
| `npm --prefix frontend run test` | Passed: 6 files, 62 tests |
| `npm --prefix frontend run build` | Passed: TypeScript and Vite |
| `scripts/build-frontend.sh --check` | Passed: dashboard bundle is current |
| `git diff --check -- frontend` | Passed |

An active LSP probe reported no diagnostics across the six touched TypeScript files, but confirmed only two clean and marked four inconclusive. The successful TypeScript build is the complete compiler check for this pass.

The component tests inspect server-rendered markup. No controllable browser page was available through `find_roots`, and this pass did not start a browser harness. These checks do not prove rendered dimensions, native pointer capture, persisted drag movement or browser hit testing.

## Browser selector structure

```text
.app-shell.strategy-shell
  > header.app-header
  > main.strategy-main
    > section.workflow-workspace
      section.canvas-section
        > .workspace-chrome[data-canvas-occlusion="top"]
          > header.workspace-heading
          > .notice / [role="alert"] / [role="status"]
        > .canvas-frame
          > .canvas-tools[data-canvas-occlusion="bottom"][role="toolbar"]
          > .routing-canvas-scroll.tool-select (or .tool-pan)
            > .routing-canvas-board
              > .routing-canvas-content
                > svg.routing-canvas-lines
                > button[data-canvas-node="questions"]
                > button[data-canvas-node="rule-0"]
                > button[data-canvas-node="fallback"]
                > button[data-canvas-node^="zone::"]
                > button[data-canvas-node^="model::"]
        > aside.workflow-inspector (only while an anchor is available)
          > header.inspector-heading
            > button (close)
          > .inspector-body
        > section.workflow-drawer[data-canvas-occlusion="bottom"]
          > .workflow-drawer-heading
            > button[aria-controls="routing-information"][aria-expanded]
          > #routing-information.workflow-info[hidden] (hidden when collapsed)
            > .canvas-context-actions
            > details.canvas-help
            > .canvas-lists
            > .workflow-advanced
            > fieldset.rule-add
            > .workflow-advanced (advanced editors, pool order, pending changes)
            > div[tabindex="-1"] (review and reset prompts)
          > .workflow-toolbar (review/apply/back/cancel/reset buttons)
```

`DndContext` is a React context boundary and does not add a wrapper element to this selector tree. Its accessibility nodes may also appear under the workspace.

## Remaining browser checks

1. At 1430×2511, ordinary desktop, 390px and 320px widths, compare `.app-header.bottom` with `.strategy-main.top`; compare the main/workspace/scroll-surface bottom with the viewport bottom. Confirm the document does not gain a second editor page when opening the drawer. Repeat in both locales.
2. Inspect the measured title, toolbar and drawer bounds, including long warnings. Check that the drawer body scrolls and the action row remains reachable. The narrow toolbar/action row may need horizontal scrolling to reach Fit, pan or reset.
3. Select nodes near each edge, Fit and reveal nodes from drawer lists. Confirm the inspector does not cover the selected node, stays outside title/tool/drawer bounds, scrolls internally and closes with its button or Escape. In very short remaining space it may be hidden; selecting after collapsing the drawer should make room again.
4. Before dragging, call `elementFromPoint` at the intended pointer location and verify its closest `[data-canvas-node]`. Use native browser mouse input. Confirm node movement produces only layout PUTs, then reload and compare node positions. Do not use synthetic `PointerEvent` dispatch as evidence of pointer capture.
5. Add a rule through the toolbar and the existing form. Confirm the drawer closes, the new node is revealed and the policy stays pending until validate/review/explicit apply. Test warning acknowledgement, back to editing, cancel and reset.
6. Revisit monitoring and appearance to confirm their layout is unchanged.
