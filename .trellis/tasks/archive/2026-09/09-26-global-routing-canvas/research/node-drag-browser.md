# Isolated native node-drag browser check

Status: rerun successfully against the latest built bundle after card-port and write-queue changes. The script passed eight real native mouse drags: questions and rule-0 nodes at 1280×800 and 320×700, zoom 1 and 0.75. Each case verified a visible target via `elementFromPoint`, CSS displacement, unscaled coordinate movement, strict layout-only PUTs, unchanged configuration/pending status and restored node coordinates after dashboard reload. The additional nonzero zoomed viewport reload case and read-only fixture case passed. Result JSON and eight screenshots are in `research/viewport-artifacts/`. The fixture is in memory, so backend on-disk/auth behaviors are not claimed by this script.

Run from the repository root:

```bash
python3 .trellis/tasks/archive/2026-09/09-26-global-routing-canvas/research/node-drag-browser.py
```

The script starts `browser-harness.py` inside its own Python process, opens a unique `agent-browser` session, and terminates both in `finally`. It does not start the gateway or contact an upstream provider. Browser CLI calls have an 18-second timeout. The prebuilt `jev_gateway/static/index.html` is required; the script does not build it.

It checks `questions` and `rule-0` at 1280×800 and 320×700, each at zoom 1 and 0.75. Every gesture verifies `elementFromPoint` before native mouse down/move/up, compares the CSS displacement with the pointer delta, compares unscaled board displacement multiplied by zoom, checks the strict layout-only PUT payload, and reloads to check restored inline node coordinates. It checks the fixture configuration and draft status remain unchanged with no review panel. One read-only fixture case checks that dragging sends no mutation. Results and bounded screenshots go to `research/viewport-artifacts/node-drag-results.json` and `drag-*.png`. A failure is recorded in JSON and exits nonzero; inspect the case and fixture requests rather than treating a pointer miss as a tool failure.

Coverage limits of this script: it does not issue `pointercancel` or concurrent delayed requests. An independent browser review (`research/final-review.md`) exercised group movement, Escape and pointer cancellation, lost capture, a single failed save, inspector focus, hit targets and review validation. That review uncovered a concurrent PUT failure/active-drag race and wheel-scroll during capture; the latest code includes targeted fixes plus 10 new deferred-promise/pointer-lock tests. A fresh native browser reproduction of these two races is still needed. Alt+arrow movement, full configuration confirm/apply and all detail-field focus cases also need separate browser checks. The test uses the in-memory fixture, so it does not prove disk persistence or backend authorization. The focused backend suite covers those contracts.
