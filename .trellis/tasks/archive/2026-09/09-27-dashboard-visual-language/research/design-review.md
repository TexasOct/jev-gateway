# Design review: open decisions before product integration

## Confirmed

- The visual board and separate monitoring prototype are for planning and review. Neither connects to product APIs or persists anything.
- Magpie's demo uses strategy tabs, SVG path connections, animated request packets, destination states and counters. Its account/failover semantics are not part of this proposal.
- JEV can display request, decision, upstream request and outcome fields when retained. It does not record complete ordered retries or per-stage durations.
- The strategy editor and its current canvas gestures, draft/review/apply/persist flow remain outside the monitoring redesign.

## Confirmed decisions

The user replied “按照你的建议继续,” approving these interaction choices for the product plan:

1. Update the route view inline in the existing monitoring detail area, retaining session selection and cursor pagination. Do not add a dedicated modal/overlay.
2. Trace Request → Decision → Upstream request → Outcome from the selected retained request. Missing/null fields remain visible as unavailable with a broken connector. Do not infer retry attempts from candidates or `switched_from`.
3. Keep explicit Replay, Pause/Resume, Reset and Replay again controls. Pause freezes exact current progress and highlighting; Resume continues in place.
4. With reduced motion, preserve the complete static route; a replay action may emphasize present fields without movement.
5. Switching request/session, refreshing or replacing detail cancels the old animation. Unknown outcome is never “in progress”.

These are requirements for planning. The user has not approved editing product files; implementation remains behind the fresh review gate.

## Design constraints, not open questions

- No autoplay or infinite motion; synthetic sample data stays visibly labeled.
- Missing outcome/evidence stays unknown, never “pending” or provider health.
- Replay speed and its duration are presentational only, not measured latency.
- Do not show a retry animation based on candidate lists or `switched_from` alone.
- Keep keyboard access, focus announcement, reduced-motion support and narrow-screen usability.

## Artifacts

Current prototype is deliberately a single linear field trace. It is a concrete design sample, not yet a final interaction specification. User choices above should be recorded in `prd.md` and the prototype updated before proposing production integration.
