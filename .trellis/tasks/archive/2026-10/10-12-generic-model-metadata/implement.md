# Execution plan

## Approved scope

The user approved the parent planning summary and explicitly requested task creation and start. Implementation and independent review are authorized; repeat planning approval is unnecessary. The main checkout contains unrelated UI changes, so the writer operates only in the isolated worktree.

## Ordered work

1. Read all curated context and adjacent actual source/tests. Verify the worktree baseline and retain admission hashes.
2. Add a regression using the exact `gpt-6.1-sol` evidence values and a custom OpenAI-compatible address. Run it against the old matcher and retain the failing native receipt.
3. Implement the smallest change in the metadata owner. Separate generic identity/transport matching from native endpoint selection. Keep source projection, canonical overrides, exact IDs, credentials and conflict behavior intact.
4. Update old proxy-only tests and add HTTP/envelope and frontend prefill/manual-owner coverage. Inspect matching browser coverage; add or run a focused browser regression if required to prove the existing UI path.
5. Update the executable contract in the backend spec and the product documentation. Keep docs limited to this policy change.
6. Run focused gates, then required full backend tests and Pyright. Run frontend unit/lint/build and the focused browser gate for touched frontend coverage. Save native exits, command lines, counts and scoped source hashes with the managed handoff.
7. A fresh read-only Trellis reviewer checks the complete candidate against the approved artifacts and inspects evidence. Findings return to the sole writer for repair if needed.
8. Parent verifies the candidate, main checkout base bytes and unrelated changes before transferring task-owned files. Keep task state in progress until implementation, review and any requested commit/archive actions are complete.

## Verification commands

Use the existing project environment through an isolated worktree-aware Python path; do not import the operator runtime. Bootstrap missing ignored scripts/specs/agent profiles deliberately. Link existing dependencies where safe; do not modify tracked lockfiles or shared dependencies.

- Focused backend: `python -m pytest -q tests/test_model_metadata.py tests/test_model_metadata_business_oracles.py tests/test_metadata_tail_contracts.py tests/test_provider_onboarding_integration.py` plus the new focused regression.
- Backend completion: `python -m pytest -q` with an isolated test runtime and `uvx pyright` or the existing equivalent executable.
- Frontend: `npm --prefix frontend run test`, `npm --prefix frontend run lint`, `npm --prefix frontend run build` when frontend coverage changes.
- Browser: use a fresh `JEV_BROWSER_PORT`, `reuseExistingServer: false`, and an existing model/provider test seam with synthetic source responses. Never stop or reuse an unrelated preview server.

## Stop and recovery rules

No git staging, commit, push, merge, archive, release or operator installation inside children. No upstream credential calls or operator runtime mutation. A tooling failure requires a preserved checkpoint and same-protocol recovery; it does not authorize switching execution mode. Escalate only new product decisions or changes outside the owned metadata contract.

## Source delivery receipt

Steps 1–8 are complete. The original failing regression, implementation gates,
report recovery, initial documentation REWORK and final independent PASS are
retained in `verification/` and summarized in `acceptance.md`.

The parent transferred 13 reviewed files to the main working tree and verified
their accepted hashes. It preserved all 20 current unrelated modified files,
the raw Git index, staged patch and HEAD. No tests were repeated merely because
of the report interruption or the final documentation repair.

At that source handoff, Phase 3.4 awaited confirmation of `commit-plan.md`.
The later instruction to publish all current changes as `0.1.7` authorized
the release owner to complete the commits, publication, and task closure.
The source and public release now have independent PASS; see `acceptance.md`.
Operator installation and restart remain separate.
