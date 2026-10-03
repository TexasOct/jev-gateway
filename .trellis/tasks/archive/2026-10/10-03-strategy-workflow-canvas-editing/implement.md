# Implementation plan

## Ordered work

- [x] Review the PRD, design, source evidence and context manifests, then activate the task under the user's autonomous Goal authorization.
- [x] Add semantic output descriptors and height/port metrics, preserving canonical runtime graph semantics.
- [x] Add match disconnection/reconnection, shared connection constraints and an incomplete-draft review guard.
- [x] Correct final unmatched/default versus decision-failure graph and configured preview using available metadata or an explicit inherited-default caption; reject unsupported or incomplete question drafts with clear copy.
- [x] Update canvas wire/port rendering and direct mouse/keyboard action panel; preserve native node drag and inspector behavior.
- [x] Add output-aware default arrangement, arrange-all and selection alignment using layout-only persistence.
- [x] Polish node roles, text alignment and Chinese/English messages; update existing geometry expectations.
- [x] Add unit and isolated browser regressions for the full feature, including dense output add/remove, invalid/stale edits and review/apply.
- [x] Run frontend lint, unit tests, TypeScript/build, browser tests and bundle staleness check.
- [x] Run backend regression and Pyright because the dashboard bundle and write boundary are part of the integrated artifact.
- [x] Independently review all changes, inspect actual screenshots and computed geometry, and record criterion-by-criterion evidence in `verification.md`.
- [x] Capture the shared geometry and connection contracts in `.trellis/spec/backend/dashboard-routing-config.md`.
- [x] Commit and archive only task-owned changes, preserving the concurrent Key-page task and journal updates.

## Validation commands

```bash
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
npm --prefix frontend run test:browser
scripts/build-frontend.sh --check
uv run pytest -q
uvx pyright
```

Use focused unit/browser runs while iterating. Final browser verification must use the rebuilt app. Screenshot evidence belongs under this task, and generated `jev_gateway/static/` assets stay ignored.

## Risk checks

Audit every consumer of fixed 190 × 56 geometry before changing dimensions. Audit `classifyConnection`, all mutation helpers, selected-edge state and policy review as one contract. Do not submit broken label references, drop other strategy tags, bypass readonly or preserve stale target gestures. Check native pointer capture and `elementFromPoint` before blaming tests for an occluded node/port.

Independent design review confirmed that the prior fallback caption is misleading. Backend semantics tests and preview cases must distinguish successful answers with no rule match from decision failure. Geometry boundary tests must exceed 20000 cumulative height and 256 saved nodes; failures must report capacity without overlapping nodes or writing policy.
