# User approval: route activity animation

The user explicitly approved adding a read-only activity endpoint and frontend polling to drive real routing-path animation, then clarified that any in-flight request activates its destination path with no 60-second window. The scope is process-local and content-free, with cleanup on every terminal path; matched frontend activity polling; no history persistence, API/schema mutation or provider-health claims. The monitoring child PRD/design are authoritative.

Approval excludes request contents, per-session historical aggregates, cluster-wide activity, and changes to routing outcomes or session semantics.
