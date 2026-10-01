# Magpie routing reference analysis

## Requested product surface

The new scope is the strategy configuration view, not the monitoring page. The user asks for a routing-flow diagram so operators can see how configured traffic is split, using `https://usemagpie.ai/#routing` as the visual reference, with motion for finish and clarity.

## Existing project evidence

JEV already has a global policy canvas in `frontend/src/config/RoutingCanvas.tsx` and `RoutingEditor.tsx`. It renders question/rule/fallback/label/model nodes and their configured workflow edges from the current draft. Edits flow through `draft.ts` into validation, review, acknowledgement, explicit apply, and separate canvas-layout persistence. This semantic model must remain the source of truth. Existing retained request records do not provide trustworthy routing distribution counts or a complete ordered retry path, so the diagram must not invent runtime percentages, Sankey volumes, live traffic, or provider health.

## Reference review status

A later managed-browser inspection reached the live `https://usemagpie.ai/#routing` section. Verified DOM, geometry, CSS and tab/motion behavior are recorded in `research/magpie-reference-capture.md`; that capture supersedes the earlier access limitation. The safe transferable direction for JEV is a readable source-to-hub-to-branch diagram and purposeful path motion, without copying demo request counters or account status as real gateway data.

## Candidate design direction

- Treat the routing strategy as the diagram's visual focal point, with distinct source/question, conditional rules, fallback, label pools and provider model destinations.
- Make branch semantics readable from existing policy data: ordered first-match rule paths, fallback path, and model-pool membership. No invented traffic weight.
- Use subtle, user-triggered or short state-transition motion to trace a selected configured branch. Motion explains configured policy structure; it does not claim a request was sent or a frequency of traffic.
- Keep the inspector and advanced policy form reachable, but let the diagram communicate the common path first.
- Retain keyboard alternatives for selecting a node/edge and keep validate/review/apply separate from layout gestures.

## Product decision resolved

The user chose **configured policy flow only**. Do not add observed traffic distribution, counts, percentages, Sankey widths, or any implied request frequency. The graph represents possible/configured branches, not a measurement of production traffic.
