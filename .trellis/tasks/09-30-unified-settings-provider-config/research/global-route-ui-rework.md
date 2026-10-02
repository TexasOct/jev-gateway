# Frontend R3/R4 rework

Frontend source and focused checks are ready for parent review. This report covers the R3/R4 changes requested after `global-init-integration-check.md`. It does not certify the rebuilt dashboard, backend integration, native browser behavior, installed wheels or publication. The earlier 110 browser / 246 unit / 896 backend results and 129.83-second macOS wheel PASS precede this rework.

The delegate changed only `frontend/**` and this report. No backend, environment, release, spec or other documentation files were edited. No commit, push, build, native browser run, real provider request or wheel check was performed. Generated `jev_gateway/static` assets remain for the parent's final build. Existing dirty work was retained.

## R3 behavior

`ConfigurationPayload` accepts optional `defaults: {default_model: string | null}`. `PolicyCatalog` already carried that optional shape; the current client and monitoring hook preserve the policy response directly. The frontend does not add defaults to the routing draft or overlay write type.

`workflowEdges` now emits a separate `default` edge from an empty tag pool to the configured canonical global model. It checks that the referenced model exists in the routing configuration. Explicit model pools and populated tag pools retain their ordinary `pool` edges. A global model remains unassigned unless an operator deliberately assigns its tag through existing controls.

The configured route projection includes the inherited destination and `defaulted`/`incomplete` display state. Its selected path includes the inherited edge. The matched label, such as `missing`, stays visible as rule evidence, while the final destination displays `Default · inherited global model` or `默认 · 继承全局模型`. The text explains that this model is not a pool member and directs global-default edits to Settings. Clearing defaults removes the edge and destination from the configured explanation and displays incomplete-path guidance. Omitted defaults continue to work with older fixtures.

The whiteboard draws a dashed inherited edge with the same localized destination explanation, supplies no drag handle for it, and shows the inherited source in the empty tag node summary. Its edge list cannot reconnect this edge: `classifyConnection` rejects remove/reconnect with `fixed`, `compatibleTargets` returns no targets, and mutation helpers return null. Advanced workflow connection copy also recognizes the new edge kind. Existing membership checkboxes, model chips, tags, overlay construction and last-member editing guards retain their established behavior. This rework does not expand membership-removal capabilities.

Monitoring's `configuredRouteModels` includes the global model when a selectable empty tag can use it, before any session or activity exists. It preserves the existing catalog/strategy mismatch guard and also compares options when the strategy listing supplies them. For decision-matrix strategies, selectable labels come from rules and fallback, including the legacy `tier` alias and selection-only choices that use the first label. An unreferenced empty label alone does not make the global destination configured. The default destination retains the configured state and separately displays inherited Default/默认; it is not classified only as Selected or Activity. Missing global configuration yields Settings guidance for a selectable empty tag. Configured model changes also trigger connector remeasurement.

## R4 behavior and field locations

`formatRouteLabel(label, t, source)` now uses explicit source evidence. `defaulted: false` preserves literal `default`; `defaulted: true` localizes the reserved outcome. When the flag is absent, an `empty_tag_default` reason localizes the fallback, including colon-prefixed rule/escalation reasons. Otherwise, a declared literal `default` in that strategy's policy remains literal. Old unknown/null/omitted markers without a declared literal keep the previous Default/默认 display. Other label strings pass through unchanged.

`routeLabelContext` owns the evidence/catalog projection. All original formatter consumers now receive context:

- Session overview and list read `SessionRow.defaulted`, `SessionRow.reason` and `SessionRow.strategy`.
- When the selected session is absent from the current page, its overview copies optional `detail.session.defaulted` and `detail.session.reason` from the existing session detail object.
- Retained RouteTrace summaries read `item.decision.defaulted`, `item.decision.reason` and `item.decision.strategy`. `defaulted` is included in the safe decision JSON projection without altering its raw value.
- `MonitoringView` passes the existing `policyCatalog` into SessionInspector; RequestCard forwards it to RouteTrace.
- New inherited configured views call the formatter with explicit `defaulted: true`. Editable label lists retain their raw names.

These are the agreed optional backend locations. The frontend requires no new collection or nested API envelope. It does not read internal `signals_json`; the backend delegate owns projecting that signal to the existing decision object. API preview has no separate dashboard response renderer in the current frontend; the configured route preview consumes routing configuration. Parent verification must confirm that backend preview serialization, retained decisions, session snapshots and restored pins expose the promised source flags consistently.

No editable tag names, filters, API label strings or JSON evidence values are translated or rewritten. Tests use an ordinary populated `default` label and a different empty tag/global model in the same catalog. Explicit flags also distinguish pinned sessions with 50 turns without relying on a short event history.

## Changed frontend files

| Boundary | Files changed by this delegate |
| --- | --- |
| API and localization | `src/shared/api/types.ts`, `src/shared/i18n/route-label.ts`, `src/shared/i18n/en.ts`, `src/shared/i18n/zh-CN.ts`, new `src/shared/i18n/__tests__/route-label.test.ts` |
| Routing projections and mutation guards | `src/features/routing/model/draft.ts`, `model/canvas.ts`, `model/configured-route-flow.ts` |
| Routing views | `src/features/routing/ConfiguredRouteFlow.tsx`, `RoutingCanvas.tsx`, `RoutingEditor.tsx`, `components/CanvasNodeContent.tsx` |
| Monitoring projections and views | `src/features/monitoring/model/strategy-distribution.ts`, `model/route-activity.ts`, `MonitoringView.tsx`, `components/StrategyDistribution.tsx`, `components/RouteTrace.tsx`, `components/SessionInspector.tsx` |
| Focused regressions | `src/features/routing/__tests__/ConfiguredRouteFlow.test.tsx`, `CanvasNodeContent.test.tsx`; `src/features/monitoring/__tests__/route-activity.test.ts`, `StrategyDistribution.test.tsx`, `RouteTrace.test.tsx`, `SessionInspector.test.tsx` |
| Pending browser regressions | New `tests/browser/global-route-path.spec.ts` |

There are 25 touched frontend paths. Git's full frontend diff also contains earlier task changes, so a diff against HEAD is not an exclusive patch-size measurement for this delegate.

## Checks performed

Commands ran from `frontend/`, using installed local binaries. Logs contain synthetic test output only.

| Check | Actual result | Log |
| --- | --- | --- |
| `./node_modules/.bin/tsc --noEmit` | Exit 0 | `/tmp/jev-global-route-types.log` |
| `./node_modules/.bin/tsc -p tests/tsconfig.json` | Exit 0, repeated after final browser test additions | `/tmp/jev-global-route-browser-types.log` |
| `./node_modules/.bin/eslint .` | Exit 0; 0 errors, 4 existing Fast Refresh warnings in `src/shared/i18n/index.tsx` | `/tmp/jev-global-route-lint.log` |
| Focused Vitest command below | 11 files / 133 tests passed, 494 ms | `/tmp/jev-global-route-focused.log` |
| `git diff --check -- frontend` from repository root | Exit 0 | No output |

```sh
./node_modules/.bin/vitest run \
  src/shared/i18n/__tests__/route-label.test.ts \
  src/features/routing/__tests__/ConfiguredRouteFlow.test.tsx \
  src/features/routing/__tests__/canvas.test.ts \
  src/features/routing/__tests__/CanvasNodeContent.test.tsx \
  src/features/routing/__tests__/RoutingEditor.test.tsx \
  src/features/routing/__tests__/draft.test.ts \
  src/features/routing/__tests__/node-card.test.ts \
  src/features/monitoring/__tests__/route-activity.test.ts \
  src/features/monitoring/__tests__/RouteTrace.test.tsx \
  src/features/monitoring/__tests__/SessionInspector.test.tsx \
  src/features/monitoring/__tests__/StrategyDistribution.test.tsx
```

The focused regressions cover tag/global distinction, branch path and copy, literal default in both locales, explicit flag precedence, legacy reason and null/unknown compatibility, session preview/list/detail-only overview, pinned source, raw evidence, selectable matrix pools, default clear, projection immutability and overlay exclusion. A saved rule payload is reloaded in the pure projection test and the global model's tags remain empty. The inherited edge is rejected by reconnect/remove classifiers and mutation helpers, and projection leaves `diffSummary.changed` false.

The new browser spec contains six cases awaiting execution. Four cover English/Chinese at 1280px/320px: configured monitoring destination before sessions, whiteboard inherited edge without an editable handle, matched rule evidence and selected default path, unchanged draft before edits, a real priority edit through validate/review/save, payload exclusion of inherited membership/defaults, reload and default clear. Two cover ordinary/default session pins in one catalog, including overview, virtual rows, retained trace and raw evidence. Browser TypeScript and lint passed; no browser result is claimed.

## Parent integration work

1. Review the frontend diff with the backend delegate's final optional `defaults` and `defaulted` projections. Test retained decision/session flag propagation and pins restored beyond 40 events with the backend implementation.
2. Complete the pre-rework native tester handoff before rebuilding generated static output. This delegate never rebuilt it.
3. Build the final frontend once safe, then run the new spec directly against that bundle with `npx playwright test -c playwright.config.ts tests/browser/global-route-path.spec.ts`, followed by the authorized full frontend/browser/backend gates. The direct Playwright invocation uses existing preview assets; the `test:browser` package script rebuilds first.
4. Execute final native browser, real stream and installed-wheel/release acceptance against the resulting artifacts. Earlier passes cannot establish acceptance of these source changes.

The remote agent mesh tool returned `Not in a session`, so there was no available parent/backend address for `agent_send`. This saved report carries the exact frontend field consumption and pending checks for parent relay. The full humanizer skill was applied in embedded mode to this report.
