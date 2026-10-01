# Visual reference and confirmed interaction choices

## User-provided evidence

The user supplied two screenshots:

- `/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/pi-clipboard-d233b73a-7d2e-484f-a8e9-a8454653e272.png`: the current dark routing configuration UI. The canvas occupies a left column; a long node-property form occupies a fixed right column. The header, help text, zoom and pan controls sit above the board. Node and connection lists appear beneath it, followed by pool order and pending-change controls.
- `/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/pi-clipboard-536f34f9-2f28-453a-a251-b91ded0906f7.png`: an Excalidraw canvas with a compact rounded toolbar floating near the top center, a menu button near the top left, and a separate action cluster near the top right. Most of the screen remains available for the canvas. The active selection tool has a tinted background, and tool icons have secondary shortcut hints.

These observations concern the screenshots only. No live Excalidraw version, hidden behavior, package API, or mobile interaction has been verified.

## Confirmed requirements

The user wants common operations, including adding a node and switching strategy editing, presented as floating buttons or a floating bar. They explicitly selected node-property panels anchored near the selected node. Those panels must have bounded dimensions and internal scrolling. Auxiliary information belongs in a collapsed bottom region. Layout persists separately from routing policy.

## Design implications to include in final review

- Keep the existing theme and semantic routing nodes. Borrow toolbar placement, grouping, spacing, elevation and selected-state feedback from the reference. Do not introduce Excalidraw as a dependency or copy its drawing tools, branding, sharing or collaboration features.
- Place the main operation group in a compact top overlay with a safe margin from viewport edges. Use labels or accessible names and tooltips; icon appearance alone must not identify a destructive action.
- Keep policy mutation controls distinguishable from layout-only actions. Moving nodes and changing the viewport must never create pending policy changes.
- Use a non-modal inspector anchored in viewport coordinates near the selected node. Keep its text at normal UI scale when the board is zoomed. Constrain it to available canvas bounds and account for the toolbar and bottom information tray.
- Keep the inspector close button and heading visible while its body scrolls. Preserve keyboard access to node selection, inspection, supported connection editing and the bottom lists.
- Verify the rendered desktop and narrow-screen interface. Passing type and pure-function checks alone cannot establish that the inspector follows a node, that toolbar controls remain reachable, or that the board remains navigable.

## Scope guard

The screenshot does not decide whether 'switch strategy editing' means selecting another configured routing strategy or switching editor tools. Code inspection must establish current strategy support, then a product clarification is needed if these interpretations imply different API or storage contracts.
