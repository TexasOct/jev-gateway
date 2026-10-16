# Task-type router design

## Boundary

The existing decision-matrix engine already supports multiple typed questions,
ordered rules, explicit strategy-owned model pools, fresh routing and a distinct
classification fallback. The behavior gap is a missing configured workflow.
Implement it as a v2 configuration payload; no runtime engine or frontend change
is required. Persistent authored work stays in this task directory; private
operational receipts live under `.trellis/.runtime/task-type-router/`.

## Decisions

- Strategy name: `task_type_router`. The current runtime default stays selected.
- Questions: task type and complexity, both closed choices, in one evaluation.
- Nine explicit pools: general, doc, research, review, review_complex, code,
  code_complex, operator and fallback. Only three confirmed concrete IDs are
  selected. Specific high/unknown code/review rules precede ordinary branches.
- First-label/default is general; classifier failure explicitly selects fallback.
  Unknown complexity is a valid answer routed by a normal rule, not reported as
  a provider failure.
- Decision-provider configuration is referenced, not duplicated. Request/model
  reasoning parameters use existing policy defaults, with no new forced effort.
- Reads and writes use the installed version and authenticated management APIs.
  Validate before apply, then read back and use bounded synthetic live previews.
- Existing strategies/layouts are compared semantically across any v1-to-v2
  migration. Baseline, credentials and theme are compared by digest and mode.
  Preserve history with read-only row digests rather than copying private data.

## Local write

Use POST creation if the management owner requires a registered empty workflow,
then scoped validation and PUT. Keep the target independent and verify ownership
after each write. The configuration owner provides transactional activation and
reload. No direct runtime JSON editing, global tag mutation or service restart
is part of this task. A partial failure is reported with its actual installed
state; never rewrite unrelated workflows to undo a scoped operation.
