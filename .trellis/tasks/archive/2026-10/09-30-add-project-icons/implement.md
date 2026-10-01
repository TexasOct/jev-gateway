# Icon integration implementation plan

## Planning and activation

- [x] Restore the existing task and PRD, preserve research, and clear the mistaken completion state.
- [x] Inspect local icon usage, accessibility contracts, npm setup, and validation scripts.
- [x] Research the package and document the selection, scope, and alternatives.
- [x] Complete `prd.md`, `design.md`, and this plan within the original icon-integration scope.
- [x] Curate and validate `implement.jsonl` and `check.jsonl` (four entries each; validation passed).
- [x] User approved the final plan with `是的，按照plan继续`. Ran `task.py start` in the parent session; verified `in_progress` and the parent current-task pointer.

The restoration agent's early activation was corrected before final review. The user approved the plan before implementation. Historical recovery details are in `research/task-restoration.md`.

Validation warns that `.trellis/spec/backend/dashboard-routing-config.md` is 35,096 bytes, above the 32,768-byte per-file injection limit. Both implementation and check agents must read the full file from disk rather than rely on the injected excerpt. Do not raise global context limits for this task.

## Implementation checklist

1. [x] Read task artifacts and manifests; captured the pre-edit frontend/spec baseline and Git index snapshot without resetting or staging unrelated work.
2. [x] Installed exact `lucide-react@1.48.0`; confirmed manifest and lockfile changes contain no unrelated dependency updates.
3. [x] Replaced scoped action glyphs in `AppShell.tsx`, `RoutingCanvas.tsx`, and `RoutingEditor.tsx` using static imports while preserving names, handlers, state, and control geometry.
4. [x] Replaced six semantic node icons in `CanvasNodeContent.tsx`; preserved node text, dimensions, accessibility, and custom diagram graphics.
5. [x] Added focused component and browser tests. A reviewer corrected platform-font-sensitive width assertions; icon browser cases now cover alternate fonts.
6. [x] Added `frontend/README.md` usage guidance. Reviewed the dashboard spec and did not change it; it already specifies accessible controls and SVG behavior.
7. [x] Ran lint, unit tests, production build, bundle freshness, and isolated browser checks. Results and known baseline failures are recorded in `research/implementation-evidence.md` and `research/check-evidence.md`.
8. [x] Independent Trellis check returned PASS; no task-specific issues remain. Scoped commit review follows; exclude unrelated changes.

## Validation commands

From the repository root, after implementation:

```bash
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
scripts/build-frontend.sh --check
npm --prefix frontend run test:browser
```

The build script runs `tsc --noEmit` before Vite. Generated files under `jev_gateway/static/` are ignored build output and must not be committed. If the task reaches full repository completion, also run the project-wide documented checks:

```bash
uv run pytest -q
uvx pyright
uv build
```

The full browser suite has one confirmed baseline failure: `monitoring.spec.ts` clicks `Refresh activity` without opening Settings. At 390px/320px, the existing English information-disclosure label overflows its button; the baseline build has the same issue. Neither is caused by the icon migration; both are documented in the evidence files.

Browser review must verify refresh, tool selection, pan/zoom, drag/reorder, inspector closing, disclosure, and node-category icons. Check that SVG children neither capture pointer gestures nor add duplicate accessible names. Keep diagram geometry, route description arrows, trace status content, placeholders, and branding unchanged.

## Rollback points

If package compatibility fails, stop before rendering changes and revise the technical decision using new evidence. If a UI regression appears, compare to the scoped baseline and undo only task hunks. The dependency manifest and lockfile must stay consistent. Do not run archive as part of planning or activation.
