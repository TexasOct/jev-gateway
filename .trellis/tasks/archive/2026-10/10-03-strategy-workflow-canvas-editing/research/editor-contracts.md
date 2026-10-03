# Strategy canvas evidence

The task was authorized for autonomous design, implementation and verification by the active Goal contract. Task-creation consent is explicit in the objective. Planning is persisted and reviewed before activation.

## Owners and current gaps

- `frontend/src/features/routing/RoutingCanvas.tsx:198` derives visual ports from existing edges. Inputs have no separate visible affordance; SVG output handles are squeezed into fixed-height cards. Pointer reconnect is present; edge paths cannot be selected. The drawer contains connection controls.
- `frontend/src/features/routing/model/node-card.ts:1` owns the current 190 × 56 geometry. `nodeCardPortsWithCenter` shrinks dense handles around the center add handle. Shared bounds in `model/canvas.ts` also hard-code 190 × 56 for Fit and marquee, so all geometry consumers must change together.
- `frontend/src/features/routing/model/draft.ts:344` owns the current visual first-match graph. Its existing final unmatched path to configured fallback is misleading: `jev_gateway/strategy/matrix.py:63-77` uses the first ordered policy label and `policy.selection` on valid answers with no matching rule, and uses configured fallback only on decision failure. Correct the frontend graph and preview without changing runtime behavior.
- `frontend/src/features/routing/model/canvas.ts:134` classifies connection intents; mutation helpers revalidate stale edges. Removal currently supports pool membership only. Add a representable pending disconnection for rule/fallback labels without changing the backend policy schema.
- `frontend/src/features/routing/components/CanvasNodeContent.tsx:11` already classifies the five roles and chooses distinct icons. Keep the three-row summary but align it within the expanded node header.
- `frontend/src/shared/i18n/zh-CN.ts:214` has inconsistent routing/workflow/whiteboard wording. Both locale catalogs must keep equal message keys.
- `frontend/src/features/routing/RoutingEditor.tsx:484` validates before review, then explicitly applies. An incomplete label must prevent review/apply while leaving the draft repairable.

## Verification boundary

`frontend/tests/setup/mock-api.ts` denies unknown writes and cross-origin requests. `frontend/playwright.config.ts` starts an isolated preview on `127.0.0.1:4178` and refuses server reuse. Extend this harness to persist synthetic canvas layouts and capture policy model edits; never use a live gateway or upstream.

Existing tests assume fixed-height cards. Replace those assertions with the shared output-driven geometry contract and actual pointer tests; keep drag threshold, layout write rollback, inspector visibility, selected-node Fit and DndContext checks.

## Compatibility

Question criterion ports are result channels feeding the same ordered rule entry. They do not create independent rules or bypass AND conditions. The backend supports only `choice` questions with at least two nonempty criteria (`matrix.py:161`). Invalid question drafts need a precise review-blocking explanation instead of usable-looking ports. Rule outputs remain match/unmatched. The last unmatched rule targets the policy's first label. Question failure leads to the editable configured fallback; zero-rule result channels target the policy default directly. Label pools expose one output per resolved model plus a separate add affordance for tag-based pools. Model nodes are sinks.

`GET /v1/routing/configuration` preserves ordered labels but omits policy selection. Existing `/v1/routing/strategies` metadata exposes `policy.selection`. `model/configured-route-flow.ts` and `ConfiguredRouteFlow.tsx` own the separate path explanation and must distinguish default from failure rather than borrowing the fallback selection. Unknown metadata must remain labeled as inherited/unknown.

Layout schema stays version 1 with integer, unscaled positions, 256 saved nodes and bounds of 10000. Node sizes and ports are derived from current draft content and never stored in the layout API. Layout operations never submit routing policy.

For cumulative height beyond the coordinate limit, arrange into extra columns or report that the layout cannot be represented. Do not clamp many positions to the same maximum y. Reject over-capacity/byte-bound writes visibly and preserve the last confirmed layout. The independent design review is recorded in `research/design-review.md`.
