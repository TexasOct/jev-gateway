# Magpie routing animation reference notes

## Scope and evidence

Reference: `https://usemagpie.ai/`, section id `#routing` (“Smart routing”). This is an evidence summary for the JEV monitoring concept, not a full teardown of Magpie's site.

Archived in `research/magpie-reference/`:

- `index.html`: fetched homepage HTML.
- `styles.css`: extracted inline stylesheet, including `#rt` rules.
- `inline-2.js`: extracted routing demo script.
- `before.png`: homepage routing section screenshot.
- `intent-route.png`, `smart-route.png`: browser screenshots of actual section states while the demo ran.

Actual page and running demo were inspected in a browser. The full marketing site's other sections are outside scope.

## Observed interaction and visual structure

The interactive section has five strategy tabs: “By intent”, “Smart”, “In order”, “In turn”, “Least used first”. Selecting a tab changes the explanatory sentence, diagram entities and request simulation.

The demo renders a source node, a magpie routing hub and a list of destination accounts/models. SVG paths connect the entities. Its script computes path geometry from DOM rectangles. A packet is moved along an SVG path through `getTotalLength()` and `getPointAtLength()` and returns along the path on success. Active routes use a dashed moving line and highlighted nodes. Destination rows expose status, account labels, quota bars and state badges. Text callouts explain strategy/failover events. Summary counters track requests, reroutes and errors seen by the caller. The motion pauses while the section is outside the viewport or the tab is hidden. It observes `prefers-reduced-motion` and removes animation when reduction is requested (`inline-2.js`, functions `layout`, `request`, `fail`, `render`, `step`; `styles.css`, `.rt-stage`, `.rt-wires`, `.rt-accts`, `.rt-cap`, reduced-motion rules).

The “Smart” screenshot confirms a source-to-hub request packet, then fan-out to account destinations; the run presents account-state/status-bar changes and aggregate counters. The “By intent” screenshot shows a request classified by a hub before the selected model is highlighted. The page copy claims the next account can answer when one cannot. These are Magpie product semantics; JEV's records do not contain equivalent ordered retry telemetry.

## Transferable design lesson

For JEV, carry over the spatial explanation: a selected request can be presented as connected stages, and the highlighted path can make nested evidence easier to scan. Keep the path static by default and let users initiate a finite replay. Preserve evidence/selection controls and visible text alongside motion.

Do not copy Magpie's account/quota model, live stream cadence, failure failover loop or stage timing into JEV. Current retained data has a selected decision, upstream request and one recorded outcome, with nullable/missing sections. It does not encode an ordered sequence of attempted routes. See `monitoring-data-contract.md`.

## Proposed JEV behavior is a design decision, not a source fact

The monitoring prototype shows the stages `Request → Decision → Upstream request → Outcome`; it uses no Magpie assets/code and no live API. Its dot travel and 3.6-second presentation are illustrative only. Session/request selection changes sample content in memory. The prototype demonstrates local theme toggle, success/failure/missing evidence, replay, pause/resume and reset. That is a concept for review, not accepted production behavior or telemetry.

## Screenshot times and rendered states

- `intent-route.png`: observed “By intent” state with a classifier destination explanation.
- `smart-route.png`: observed “Smart” state after three demo requests; one packet is on a destination route. The page reports simulated requests/reroutes/errors.

Capture viewport: 1440×1000. Screenshots are observations of the live public page; numbers and accounts in them are Magpie demo state, not JEV data.
