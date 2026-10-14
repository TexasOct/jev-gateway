# Implementation plan

1. [x] Load backend/frontend Trellis specs and trace actual strategy-registry → decision-provider construction and configuration response projection. Record the exact change boundary.
2. [x] Add optional per-strategy provider ID to workflow data/draft and strict validation against configured decision providers; preserve absent-field compatibility and strategy isolation.
3. [x] Thread provider choice through runtime strategy construction/request dispatch, resolving the selected configured provider and its configured model without shared mutable state.
4. [x] Add workflow UI selector populated from safe configured-provider metadata, localization, draft/review/apply behavior and API typing.
5. [x] Add backend persistence/validation tests, selected-provider runtime/model test, and frontend draft/UI round-trip tests.
6. [x] Run focused and full backend tests, Pyright, frontend tests/build/lint and packaging check. Review diff and run Trellis quality checks.
7. [x] Commit only task changes on the isolated branch; verify main-worktree pre-existing changes and exact merge base/diff, then merge into main without staging or altering those changes. Verify final main state and report.

Integrated as `ae2d4ccd52dbc53ddddb03ad1f873cef2b3601b6`. Both refs originally
pointed at the same commit, so the isolated worktree's uncommitted implementation
was scoped and committed before fast-forward integration. Three-way resolution
keeps explicit strategy selection exclusive while retaining global default
failover and the independent enablement control. Clearing a saved provider and
legacy `decision: null` compatibility have red-first regression coverage.
Final combined verification: backend 3359 passed / 2 skipped, frontend 432 passed,
native browser 12 passed, Pyright/build/lint/package checks passed. The recovery
bundle and both original dirty-source inventories are retained outside temporary
sandbox storage. See the readiness task's `research/final-verification.md`.

## Validation commands

- `uv run pytest -q tests/test_routing_overlay.py tests/test_strategy_state.py tests/test_decision_provider.py tests/test_decision_strategy.py tests/test_decision_matrix.py`
- `uvx pyright` and `uv run pytest -q`
- `cd frontend && npm run test -- src/features/routing`, then `npm run test`, `npm run build`, and lint
- `uv build`

## Risk checkpoints

- Confirm runtime provider selection is strategy/request scoped and concurrency safe.
- Confirm unselected legacy workflows preserve current default resolution.
- Preserve all main worktree changes; integration must be a scoped merge, not a reset/stash/checkout of the dirty main tree.
