# Google Mixboard interaction evidence

## Sources and access boundary

- [Mixboard official welcome](https://labs.google.com/mixboard/welcome) identifies the product as an AI-powered concepting board. The public landing page contains an official introduction video.
- [Official Google Labs announcement](https://blog.google/innovation-and-ai/models-and-research/google-labs/mixboard/) describes an open canvas with images and text, text-prompt starts, pre-populated boards, uploaded or generated images, natural-language board edits, one-click variants, and text generated from board images.
- [Introducing Mixboard, official video](https://www.youtube.com/watch?v=6mTWfthVXJs), inspected at 0:10–0:45, is the direct visual reference below. Its examples are illustrative, so do not infer unshown settings or shortcuts.
- The live editor at `https://labs.google.com/mixboard/projects` returned HTTP 401 and the managed browser reached Google sign-in. No authenticated hands-on inspection was possible. Details not visible in the video remain unverified.

## Directly visible in the official video

| Time | Observation | Adaptation candidate |
| --- | --- | --- |
| 0:10 | Pale dotted open board; minimal project header with back/title/menu; top-right zoom percentage and Share; slim left tool rail; bottom rounded prompt composer. | Dominant canvas, compact navigation/tool surfaces, visible viewport controls. Do not copy Share without a product sharing feature. |
| 0:15–0:25 | A single image is selected with a thin rectangular outline and corner handles; a dark floating action bar appears above/near it. The bottom composer shows a thumbnail of the selected image and changes from creation to editing prompt language. | Selected module outline, context actions near the object, inspector tied to selection; avoid claiming unsupported AI edits. |
| 0:30–0:40 | A selection rectangle spans multiple images; multiple thumbnails appear in the composer. Objects occupy free positions on the canvas. | Consider multi-selection for layout-only operations if it is worthwhile; do not imply multi-object routing edits. |
| 0:45 | A generated result appears on the board. | No routing counterpart unless a specific strategy-generation product contract is approved. |

The video does not establish exact keyboard shortcuts, grid snapping, undo behavior, resize persistence, collaboration semantics, or color/spacing tokens. Object action glyph labels are not legible enough to identify each action reliably. Those cannot be described as established Mixboard behavior.

## Existing editor mapping

- `RoutingCanvas.tsx` already supports single selection, node dragging, edge reconnect by pointer and keyboard, and scroll-based pan; it has no zoom or multi-select.
- `RoutingEditor.tsx` owns the selected-node inspector and policy review/apply/reset. A contextual action bar could expose the same draft mutations without bypassing review.
- `canvas.ts` expresses permissible operations through `reconnectEdge`, `connectPoolEdge`, `disconnectPoolEdge`, and `compatibleTargets`; `draft.ts` derives the displayed graph from the ordered policy matrix. The compatibility matrix should classify edit intent and expose rejection reasons, not introduce arbitrary executable edges.
- The bottom prompt is a real Mixboard editing affordance, but this project has no natural-language-to-policy API. The user decided to omit the prompt in this task while reserving a future integration boundary for AI-generated strategy proposals.
