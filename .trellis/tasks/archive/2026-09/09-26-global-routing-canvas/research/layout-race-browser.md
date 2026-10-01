# Post-fix Chromium replay: delayed layout failure and wheel lock

Ran `layout-race-browser.py` once against the newest `jev_gateway/static` bundle, using a uniquely named agent-browser session and the local in-memory `browser-harness.py`. The fixture served no real catalog and made no upstream calls. Native `agent-browser mouse move/down/up/wheel` drove pointer input; no synthetic pointer events were used. The only JavaScript event used was a cancelable wheel signal during the captured drag, followed by an explicit scroll-offset probe to detect any scroll movement. No product code or task status was changed.

## Results

- **Delayed failure during a second active drag: pass.** Preloaded Questions `(110,120)` and Rule `(440,110)`. Dragged Questions to `(140,140)` and held its layout PUT response. Began a native Rule drag; the browser reported pointer capture and preview `(460,130)`. Releasing the held first PUT with HTTP 500 rolled both displayed nodes back to the last saved positions, cleared Rule's active drag/capture, and surfaced the fixture failure. Further native pointer movement/up created no second PUT. A fresh Rule drag then persisted `(464,130)`; the request retained Questions `(110,120)` and included only the layout schema. No policy endpoint was called.
- **Wheel during captured drag: pass.** Started Questions at `(110,120)` with a nonzero viewport `(60,55)`, captured a native drag, then emitted a cancelable wheel signal and applied a +100/+100 scroll-offset probe. Scroll remained `(60,55)` while captured. A further pointer displacement of 30×18 CSS pixels moved the node to `(140,138)`, matching the expected 1× board delta. Pointer-up caused one PUT to `/v1/dashboard/canvas-layout`; afterward scroll offsets could move to `(160,155)`, confirming the lock was released. No policy endpoint was called.

## Evidence

- `layout-race-artifacts/results.json`: bounded DOM, pointer-capture and request evidence.
- `layout-race-artifacts/race-second-active.png`
- `layout-race-artifacts/race-after-failure.png`
- `layout-race-artifacts/race-new-drag.png`
- `layout-race-artifacts/wheel-captured-drag.png`
- `layout-race-artifacts/wheel-after-release.png`

The wheel scenario confirms application scroll-lock behavior and pointer displacement. The harness's simulated scroll-offset probe is intentionally a deterministic guard for a changed scroll position, since this agent-browser environment did not deliver post-release native wheel movement to the scrollport reliably; the post-release check therefore uses a DOM scroll operation after the captured sequence.
