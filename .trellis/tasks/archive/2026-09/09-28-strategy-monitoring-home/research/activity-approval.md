# User approval: route activity animation

The user explicitly approved a read-only activity endpoint and frontend polling, then changed the activity rule: activate a route only while one or more requests to that exact destination are in progress. Remove the former 60-second recent-arrival rule. Keep process-local, content-free state; clean up on all terminal paths; do not persist history, change routing outcomes or infer provider health. The current PRD/design are authoritative.

Approval does not include request contents, per-session historical aggregates, cluster-wide activity, or changes to routing outcomes and session semantics.
