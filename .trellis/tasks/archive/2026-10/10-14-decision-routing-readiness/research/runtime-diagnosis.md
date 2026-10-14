# Retained runtime diagnosis

Before the readiness change, a read-only query of the latest 50 `task_aware`
decisions found 50 local `review` fallbacks: 46 `per_turn_policy` and four
`first_turn_review` results. The operator configuration had `decision.enabled`
false, a five-second timeout and no decision providers. The strategy explicitly
configured `review` as its fallback. Disabled evaluation returned before network
access, so no classifier failure was established.

The installed service was separate from workspace source. The packaged template
disabled external decisions; provider upsert and routing overlays did not own an
enable operation. This task added an explicit baseline-owner enable/disable
transaction and console control. Live use still requires a real supplier and
credential, plus an independently authorized installation update.

Other catalog, routing, records, UI, tests and document changes predated the task
and were retained during integration. The original private diagnosis and native
verification receipts remain in operator-owned local state; this public context
is a redacted construction summary.
