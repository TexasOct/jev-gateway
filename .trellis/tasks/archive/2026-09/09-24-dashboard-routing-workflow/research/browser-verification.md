# Browser verification status

## Setup

Short-lived local Vite at `http://127.0.0.1:5174/dashboard/`, Playwright Chromium, fabricated catalog, fake credential, and `/v1/` API interception. No production service, user `models.json`, or upstream provider was contacted. Shell cleanup stopped the Vite process.

## Verified

- Monitoring opened; `Strategy workflow` switched to `Routing whiteboard`. The strategy view did not show the Theme seed panel. The separate Appearance view did.
- Keyboard moving `rule-0` with Alt+Right changed its x coordinate from 400 to 420. The layout endpoint received the new coordinate, and it was restored after reload. The layout gesture made no policy PUT.
- Pointer-dragging `rule-0` moved its position from `(400,80)` to `(480,125)` and sent one layout PUT.
- Pointer-dragging the `rule-0 match` edge to the `ultra` label enabled Review. Before Review, there were no validate or policy PUT calls. Review issued one validate request; Confirm then issued one policy PUT.
- Temporary scripts: `/tmp/jev-browser-verify/smoke-current.mjs` and `/tmp/jev-browser-verify/pointer-current.mjs`. This evidence is not a committed automated test.

## Not yet verified in a browser

- Unmatched-rule reordering, final fallback behavior, model-pool edge edits, and invalid-target/last-member rejection.
- Rule add/delete gestures, including layout slot reassignment after topology changes.
- More than one session/request page, fixed-height DOM virtualization, evidence expansion, and delayed-response switching between sessions.
- Touch on narrow screens, shared layout from a second browser, and concurrent layout writes.

Pure tests cover draft/edge/layout logic, but they do not prove these browser interactions. Use bounded local scenarios with stubbed APIs and record network/assertion evidence before calling them verified.
