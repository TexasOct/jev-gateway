# Card geometry and connection anchors

## Scope

This pass changes `node-card.ts`, the card/connection geometry in `RoutingCanvas.tsx`, and a new `node-card.test.ts`. It leaves CSS, `CanvasNodeContent.tsx`, translations, existing tests, acceptance checkboxes and the Git index untouched.

## Geometry decision

Cards keep the existing 190×56 board-coordinate bounds. The content component renders three rows: a 12px type label, a 16px title and a 12px summary. The 40px content block fits with 8px on each side vertically. The five types retain their existing text labels, icons and border treatments.

The removed height calculation measured different content from the rendered summaries. For example, it counted every pool member ID although the pool card renders a model count. It also counted UTF-16 code units, overestimating some emoji sequences and underestimating wide characters. Increasing the outer height could not expose more text because the content grid remained 40px high.

`nodeCardMetrics()` now describes the fixed viewport and does not measure or truncate text. Unicode graphemes and long IDs remain intact in the content and title attributes. The browser handles the existing single-line overflow. There is no independent text-width approximation to drift between node roles.

Keeping 190×56 avoids changing `translateNodes`, marquee intersection, Fit bounds, saved positions or board expansion. Focused tests check the last pixel of the marquee bounds and coordinate limits after movement.

## Connection positions

- Single-source and all target anchors are at the vertical center, 28px from the top.
- Rule match/order edges use symmetric source positions at 18px and 38px.
- Explicit pools distribute sibling edges symmetrically inside the card.
- Tag pools reserve the center for the add handle and place existing edge handles in upper/lower bands.
- Dense pools keep deterministic distinct positions and shrink their handle radii to avoid overlap. The drawer's per-edge reconnect controls remain the usable alternative when a pool has too many handles for direct pointer selection.
- The add handle's initial drag-preview point is its actual rendered center. It no longer starts at a separate hard-coded 8px offset.

All source anchors use `x = 190`; target anchors use `x = 0`. Grouped edge lookup avoids recomputing content metrics and scanning earlier siblings inside every SVG element.

## Visual-owner handoff

Peer discovery returned `Not in a session`, and both project/global Trellis channel lists were empty. No direct coordination channel was available.

The scoped geometry work does not add internal text scrolling: that requires changes to the visual owner's content/CSS. The current CSS still ellipsizes long titles and summaries. Keep type and title visible if summary overflow is made scrollable. Do not enlarge the outer card independently of Fit, marquee and movement bounds. A switch to taller cards requires those geometry consumers to receive the same measured size.

## Verification

- `npm --prefix frontend run test -- src/config/node-card.test.ts src/config/CanvasNodeContent.test.tsx src/config/canvas.test.ts`: 55 tests passed across three files.
- `npm --prefix frontend run lint -- src/config/node-card.ts src/config/RoutingCanvas.tsx src/config/node-card.test.ts`: passed with four existing Fast Refresh warnings in `i18n.tsx`; no errors.
- `frontend/node_modules/.bin/tsc --noEmit` from `frontend/`: passed.
- `git diff --check -- frontend/src/config/RoutingCanvas.tsx`: passed.

The new tests cover row/cap geometry, existing movement/marquee bounds, source/target centers, dense sibling ports and center reservation. Server-rendered English and Chinese canvas cases include long CJK, combining-mark and joined-emoji content across all five roles.

No build or live-browser acceptance run was performed in this scoped pass. Browser verification of scrolling and pointer hit areas remains with integration review.
