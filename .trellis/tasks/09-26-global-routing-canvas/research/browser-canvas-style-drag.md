# Integrated node styling and drag checks

Run after integrating `CanvasNodeContent` and threshold-based drag behavior.

## Automated checks

- `npm --prefix frontend run test -- CanvasNodeContent.test.tsx`: 19 tests passed for all five node kinds, summaries, localized labels, SVG icon differences, escaping and malformed/missing entities.
- `npm --prefix frontend run test`: 8 files / 92 tests passed. Covers viewport geometry, canonical layout conversion, drag threshold, CSS-to-board delta, multi-node relative offsets and unchanged gesture handling.
- `npm --prefix frontend run lint`: zero errors, four existing Fast Refresh warnings in `i18n.tsx`.
- `npm --prefix frontend run build` and `scripts/build-frontend.sh --check`: passed.
- Full backend `uv run pytest -q`: 589 passed. `uvx pyright`: zero errors, warnings or information.

## Isolated native-browser drag evidence

`research/node-drag-browser.py` ran to completion. It starts the local memory-only catalog/layout fixture and uses one fresh `agent-browser` session. For each case it hit-tests the start point and verifies the actual element is the intended node before native mouse input. All eight cases passed:

| Viewport | Zoom | Node | CSS displacement | Saved layout position | Reload |
| --- | ---: | --- | --- | --- | --- |
| 1280×800 | 1.0 | questions | +28,+24 px | 78,104 | restored |
| 1280×800 | 1.0 | rule-0 | +28,+24 px | 428,104 | restored |
| 1280×800 | 0.75 | questions | +27.75,+24 px | 87,112 | restored |
| 1280×800 | 0.75 | rule-0 | +27.75,+24 px | 437,112 | restored |
| 320×700 | 1.0 | questions | +28,+24 px | 78,104 | restored |
| 320×700 | 1.0 | rule-0 | +28,+24 px | 428,104 | restored |
| 320×700 | 0.75 | questions | +27.75,+24 px | 87,112 | restored |
| 320×700 | 0.75 | rule-0 | +27.75,+24 px | 437,112 | restored |

Requests were only strict `PUT /v1/dashboard/canvas-layout` payloads; the mock configuration remained unchanged and no review panel appeared. A nonzero viewport test at 0.75 zoom preserved canonical board coordinates across reload at default zoom (before focal coordinate x=533.33/y=584, after x=533/y=584; persisted viewport x=533/y=596). A read-only mock case produced no layout mutation. The agent-browser session and isolated fixture server were closed at script exit.

JSON and screenshots: `research/viewport-artifacts/node-drag-results.json` and `drag-*.png`.

## Visual inspection

A four-image contact sheet at `/tmp/node-visual-review.jpg` shows the type label, inline icon, title, summary and differentiated edge treatment on Questions and Rule nodes at desktop and 320px widths. The existing 190×56 geometry and connection port placement remain unchanged. The type cue is legible in the screenshots and independent of color. Long titles and summaries truncate to one line and keep the full value in `title` tooltips.

## Remaining gaps

- The narrow-screen details fallback still overlays some area around a selected rule. The node had hit-testable exposed pixels in the tested state, but the floating panel is not literally beside that node. Human product review of this compromise remains appropriate.
- Native drag passed for single questions and rules only. Group drag, connection-port drag/cancel, the policy validate/review/confirm flow, and focused inspector text input across resize were not exhaustively exercised.
- The visual contact sheet did not cover fallback/label/model nodes, Chinese text, or both themes. Component SSR tests cover the role/type DOM and paired text in English/Chinese, but not full browser visual appearance across those variants.