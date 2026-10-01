# Monitoring interaction design extension

## User request

Reference `https://usemagpie.ai/` routing animation to redesign monitoring interactions and animation. This explicitly extends the original visual-only constraint for the monitoring design. The strategy editor's interactions stay unchanged.

## Current authorization

Produce a separate interactive design prototype and design specification under this task's research directory. No product source changes, gateway reads/writes, upstream calls or deployment. The task has returned to planning because the monitoring design scope materially changed. Product integration requires a later approval.

## Known data boundaries

`frontend/src/api.ts` exposes paginated sessions, retained request/decision/upstream/outcome sections and retained provider summaries. `App.tsx` currently displays four evidence disclosures per request. This does not establish a live event feed, per-stage durations or a complete ordered history of retry attempts. Missing outcome/evidence must not be labeled as an in-flight request or provider health failure.

## Prototype requirements

- Show the selected request's route from inbound request through routing decision to a provider-qualified model and recorded result.
- Link session/request selection to the highlighted path and an inspectable evidence area.
- Animate a finite, user-controlled replay of a recorded route, explicitly marked as schematic replay with illustrative timing, not live telemetry.
- Provide pause/replay controls and `prefers-reduced-motion` support; text and static path remain complete without animation.
- Use synthetic sample data and label it persistently. Failure and missing-evidence cases must be inspectable.
- If illustrating retries, clearly distinguish a hypothetical future rich-trace scenario from what existing endpoints can support.
- Inspect the reference's actual source and rendered animation before documenting borrowed timing/layout details. Proposed JEV values must be labeled as new design decisions.
