# Routing canvas browser evidence

Scope: isolated local browser runs against `research/browser-harness.py`. The harness serves a dashboard bundle and in-memory fixtures on loopback. No user service, provider, upstream or credential was accessed. The pre-fix probe is `research/viewport-review-probe.py`; screenshots and JSON measurements are under `research/viewport-artifacts/`. The fix pass used browser session `viewportpost`; its exact command/check scripts have not yet been persisted separately.

## Pre-fix findings reproduced

1. At 320×700 the wrapped header was about 293px high, leaving a roughly 407px workspace. `Questions` could open its inspector, but selecting the distant `rule-6` removed `.workflow-inspector`. Evidence: `review-results.json`, `review-320-inspector.png`, `review-320-rule6.png`.
2. At 0.75 zoom, the rendered board width was 2400px while the normal-flow transformed content still reported 3200px scroll width. Evidence: `review-results.json`, `review-zoom-half.png` (toolbar indicated 75%).
3. Native mouse drag of a hit-tested Questions node at 0.75 zoom recorded `{x:157,y:120}`; reload showed it at the expected unscaled board coordinate. This confirms node drag persistence. Saved viewport remained zero, so nonzero viewport persistence was not established.
4. Focus retention during resize/drawer state changes was not established.

## Post-fix checks

- At 320×700, when rule-6 is manually scrolled into view (`scrollLeft=250`, `scrollTop=950`), its button has a hit-testable point. Selecting it opens the bounded fallback inspector, which overlays part of the node while leaving some node pixels exposed. A native mouse gesture on an exposed node point moved it and wrote only its unscaled coordinates to the layout endpoint. The full geometry/reveal sequence does not guarantee that a distant node is automatically brought into an unobstructed panel arrangement; the narrow-screen detail experience still needs review.
- At 320px width, measured canvas scroll extents match the scaled outer board at 0.5, 0.75, 1.0, 1.25 and 1.75 zoom. Samples: 1600×1382 at 0.5, 2400×1932 at 0.75, 3200×2482 at 1.0, and 5600×4132 at 1.75. No extra unscaled-child scroll area was observed.
- The isolated native-drag regression script passed 8 cases: questions and rule-0 nodes, at 1280×800 and 320×700, zoom 1 and 0.75. Each case hit-tests the pointer target, compares CSS and unscaled movement, checks that the API writes only `{version,nodes,viewport}`, and reloads to verify the position. It also passed the nonzero 0.75-zoom viewport reload case and read-only no-mutation case. Bounded JSON and screenshots are in `viewport-artifacts/node-drag-results.json` and `drag-*.png`.
- A separate viewport transition from 0.5 zoom at 1280×800 to 390px restored canonical viewport data and clamped the visible offsets to available bounds. Fit then returns Questions into view. Exact pixel stability across a narrower, taller-header viewport is not expected when the stored location must be clamped.
- A drawer control retained focus through resize, but a focused text input inside the inspector could not be exercised successfully. Geometry-driven focus handoff remains unverified.

The 390px screen remains constrained because the shared header wraps; the fixed toolbar and inspector compete for the available board area. Both were reachable in the tested states, but only human screenshot review can assess whether the composition is acceptable. The test run did not finish validation/apply ordering, failure rollback, all locales, or monitoring/theme regression.

## Partial workspace geometry

The separate viewport sweep reached the intended dimensions and both locales after correcting the probe's viewport/session handling. At 1430×2511, 1280×800, 390×844 and 320×700, the strategy main region extended from the actual header bottom to the viewport bottom, and the document dimensions matched the viewport. At narrow sizes the shared header wrapped to 183.5px at 390px and 292px at 320px (English). Expanding the drawer kept the footer actions inside the viewport; the drawer body scrollTop changed when set to its maximum. Screenshots and raw measurements are saved under `viewport-artifacts/` and in `results.json`.

The first large-screen pass was invalid for viewport geometry because agent-browser retained 1280×577 after opening the fixture; it has been superseded by the corrected run that explicitly sets the viewport after navigation. Images were visually inspected. The 320px screenshot shows toolbar and workspace content competing for limited height, but no document-level overflow.

## Unverified acceptance paths

Full policy validation/review/apply request ordering, layout read/write failure rollback, Chinese screenshot inspection and monitoring/theme regression were not completed in the browser run. Focused inspector field behavior through resize, and fully unobstructed anchored details at 320px, remain unverified. The unit and backend suites cover underlying validation/auth and policy separation contracts.

Reproduce geometry: `python3 .trellis/tasks/09-26-global-routing-canvas/research/viewport-browser-check.py`
Reproduce review cases: `python3 .trellis/tasks/09-26-global-routing-canvas/research/viewport-review-probe.py`
