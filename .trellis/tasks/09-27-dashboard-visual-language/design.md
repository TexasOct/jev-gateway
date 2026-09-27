# Dashboard 设计语言迭代

## Design read

面向技术操作者的 Dashboard 视觉更新，采用冷色中性 light/dark 表面、seed 派生强调色和清楚的数据层级。策略画布继续使用点阵与图结构。

监控页在用户确认的范围内增加基于 retained evidence 的路由说明和手动回放。Magpie 页面实测 demo 有策略 tabs、SVG 连接、移动的 packet、目的项状态和计数。JEV 只借鉴“让一条已选路径可见”的方式，不引入 Magpie 的额度/账号选路模型。由于 JEV 没有完整重试顺序或逐阶段计时，回放只帮助读懂记录字段，不表示实时过程或实际耗时。

## Boundaries

- Design artifacts are complete in `.trellis/tasks/09-27-dashboard-visual-language/research/`.
- Product changes are limited to `frontend/src/monitoring/RouteTrace.tsx`, pure route playback helpers and tests, `frontend/src/App.tsx`, `frontend/src/i18n.tsx`, and `frontend/src/styles.css`.
- No backend files, API schemas, dependencies, web fonts, external services, strategy editor behavior, or canvas gesture/persistence behavior may change.
- Staged frontend edits at task start are the user's baseline. Keep the index untouched. Existing unstaged `styles.css` responsive edits must remain intact. Hash snapshots are in `research/implementation-baseline.json` and `research/final-worktree-audit.json`.

## Visual direction

- Introduce a small coherent token layer for typography roles, spacing, control heights, radii and surface boundaries; retain the existing semantic palette values generated from the theme seed.
- Use clear type scale and table-number alignment without enlarging fixed-geometry canvas nodes.
- Reduce unrelated hardcoded shadows and inconsistent borders; use a restrained surface hierarchy across monitoring, editor overlays, drawer, inspector and theme controls.
- Give hover, pressed, focus-visible and disabled states one consistent treatment with visible keyboard focus and existing semantics.
- Improve textarea/select/button parity and mobile header/action density without moving actions or changing their order.
- Keep the dotted canvas and graph vocabulary, but refine its quietness and line/node readability within the existing canvas coordinates and hit targets.
- Light and dark modes continue to derive from the saved/system seed. Status colors retain their existing meaning. Both Chinese and English labels must fit or scroll as they do today.
- Motion changes limited to presentational transitions on existing controls, respecting `prefers-reduced-motion`. Do not animate layout, node positions or canvas gestures.

## Data and behavior flow

The style board is a static reference. The monitoring prototype is separate, local-only and uses in-memory synthetic records. Its product concept reuses the existing session-detail query and `RetainedRequest` fields only. Selecting a request updates the existing monitoring detail area. The four-slot trace shows Request → Decision → Upstream request → Outcome; missing/null fields stay visible and disconnected. The selected outcome defines success, failure or unknown.

Replay begins only on an explicit user action. Pause freezes its progress and highlights, Resume continues at that position, Reset clears them, and Replay again starts over. Changing session/request or refreshing cancels old animation work. `prefers-reduced-motion` keeps the complete static trace and can emphasize available fields without movement.

Playback time is presentation-only. The route is not an event stream or elapsed-time graph, and candidates do not establish retry order. Missing outcome means unknown, not in progress. Existing `App` pagination and virtual-list contract, policy review/apply flow, and `RoutingCanvas` pointer/DnD behavior remain unchanged.

## Monitoring interaction contract

The user approved this behavior with “按照你的建议继续”. Product implementation must:

- Retain the existing monitoring shell, session selector/list, request pagination and details area. The currently selected retained request updates an inline route trace; do not create a separate modal/overlay.
- Render a four-slot field trace: Request → Decision → Upstream request → Outcome. Keep the current selected item identity associated with the trace.
- Draw a connector only between adjacent fields present in the selected record. Display null/unavailable fields as visually broken segments, and never move an animated packet across them.
- Derive result only from selected `outcome.ok`: true is success, false failure, absent/null unknown or not retained. Do not label unknown “pending/in progress”.
- Keep user-started Replay, Pause, Resume, Reset, and Replay again. Pause freezes progress and active/visited highlights. Resume continues from the exact current position; Reset clears them; replay-again starts over.
- Abort/cancel replay on session/request changes, refresh, detail replacement or unmount so an old frame cannot affect a new selection.
- Under `prefers-reduced-motion`, keep the full route and evidence static. User-triggered emphasis may mark available fields without movement.
- Preserve keyboard operation, focus-visible styling and a concise live status announcement. Do not rely on color alone.
- Treat motion timing as an interface explanation only. It conveys no request latency, real-time event activity, retries, or provider health.

## Compatibility and risk

The main risks are CSS changing intrinsic layout/scroll dimensions of virtual rows, moving pointer hit targets, occluding canvas nodes, reducing touch targets, or changing `[data-canvas-occlusion]` calculations. Node sizes are 190×56 and intentionally fixed. Preserve canvas scroller, workspace grid, overlays, DnD provider boundary, drawer scroll ownership and mobile table labels. Existing CSP disallows external font sources; do not add web fonts. Theme seed editing/storage and palette construction are explicitly outside scope.

## Rollback

Keep the worktree index and all unrelated staged/unstaged files unchanged. Revert only task-attributed unstaged source hunks if their tests or interaction checks fail. Do not restore whole frontend files because they include the user's staged implementation. The ignored generated `jev_gateway/static/` bundle may be regenerated by the build and must not be committed.
