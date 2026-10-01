# Dashboard visual overhaul

## Goal

Redesign the JEV dashboard from scratch, using Magpie's routing presentation and shadcn/ui's neutral component language. Lead monitoring with strategy-level routing results. Preserve the strategy canvas's existing interaction logic and policy safety flow while fully replacing its visual style.

## Background

The Vite/React/TypeScript dashboard has monitoring, strategy and appearance views. Tailwind v4 and project-owned shadcn-style Button, Card and Separator components are already present. It supports English and Simplified Chinese and a configurable theme seed for light/dark palettes.

The strategy canvas supports selection, pan, marquee/multi-move, zoom/Fit, supported connections, inspection and advanced editing. Policy changes require a draft, validation, review, warning acknowledgement, explicit apply or confirmed reset; canvas layout saves separately. Several related dashboard tasks have left uncommitted files in the working tree. Preserve them and establish ownership before implementation.

The existing strategies endpoint lists every registered strategy. The paged sessions endpoint reports currently live sessions and their latest known strategy and selected route/model. The configuration endpoint exposes only the editable `task_aware` policy, and no API aggregates all retained historical routing decisions by strategy/model. Evidence and limits are documented in `research/routing-result-availability.md`.

## Requirements

- R1. Give monitoring, strategy and appearance views a coherent Magpie/shadcn-inspired visual language: neutral surfaces, restrained borders, compact typography, consistent controls and states. The supplied Magpie screenshot informs composition and route paths, not JEV data or product semantics.
- R2. Allow monitoring and appearance interfaces and interactions to change while preserving existing API/auth, evidence privacy and meaning, pagination, persistence and storage behavior.
- R3. Put a strategy-level distribution browser first on the monitoring home. Include every registered strategy, including strategies with no current sessions. For each strategy, show counts of currently live sessions by latest known selected model. The count represents sessions, not requests, probability, health or historical traffic. On monitoring model paths, animate only while a request to that destination is in progress. Keep inactive paths still and provide a static reduced-motion equivalent. This child is approved to add process-local, read-only activity telemetry; its contract is in `.trellis/tasks/archive/2026-09/09-28-strategy-monitoring-home/prd.md`. Put session/request lists and retained evidence in secondary detail; keep their existing access and states.
- R4. Obtain complete current-session counts by following every cursor page and deduplicating stable session IDs. Keep missing strategy/model attribution visible. Distinguish loading, incomplete traversal, storage unavailable, zero live sessions and unknown evidence; never present an incomplete result as an exact zero or silently assign an unknown model. If configured model destinations are shown, label them separately from observed sessions and support only strategies with a valid projection.
- R5. Replace strategy canvas, node, connector, toolbar, inspector, drawer and review-control styling throughout. Preserve and improve discoverability of existing editing for questions, rules/order, fallback, model pools and supported connections. Preserve selection/pan/marquee/multi-move/zoom/Fit/connection/inspection/advanced-edit behavior, draft/validate/review/acknowledge/apply/reset lifecycle and independent layout save. Add no new strategy semantics or canvas tools.
- R6. Retain the configurable theme seed as the action and selection accent on neutral surfaces. Keep the existing theme API/seed persistence, both color schemes and English/Simplified Chinese interface.
- R7. Preserve all unrelated uncommitted work through explicit file ownership and reviewed integration. The monitoring child may add the user-approved, additive, process-local read-only activity endpoint and polling described in R3. This endpoint does not change routing decisions, retained session/evidence schemas, or storage. Other backend/API/schema changes, routing-policy semantic changes, credential persistence, undo/redo, general drawing tools and arbitrary DAG editing remain excluded.

## Acceptance criteria

- [ ] All three views use one coherent visual system based on Magpie and shadcn/ui, including responsive layouts, visible keyboard focus, both schemes and both locales.
- [ ] Monitoring opens on a strategy browser populated from the registered-strategies endpoint. A strategy with no live sessions remains visible. Its model rows show correctly scoped, current live-session counts after full cursor traversal; unknown attribution, partial reads and errors are not disguised as zero.
- [ ] Session/request lists, retained detail and provider observations remain accessible as secondary information. Existing loading, empty, error, evidence-unavailable, privacy and cursor behavior stays intact.
- [ ] Monitoring model-path motion follows verified in-flight requests and stops when the path has no requests in progress or activity is unknown/stale. Configured-policy graphics remain explanatory. Neither diagram implies historical share, provider health, measured request/chunk timing or fabricated counters. Reduced-motion users receive the same textual state and complete static paths.
- [ ] The strategy canvas has new visual styling while real pointer/keyboard gestures, inspector, advanced controls, validated review/apply/reset and independent layout persistence continue to work. Layout and animation never submit policy changes.
- [ ] Changing the saved seed visibly updates action/selection accents on neutral surfaces through the existing theme API; light/dark contrast remains legible.
- [ ] No unrelated dirty changes are lost or bundled into the redesign. Frontend lint/tests/typecheck/build, bundle freshness and relevant gateway/security tests pass, and synthetic browser checks cover desktop/390px/320px, both locales/schemes, reduced motion, monitoring paging and actual canvas hit testing.

## 合并后的验收责任（2026-09-30）

用户同意将 `09-26-global-routing-canvas` 和 `09-27-dashboard-ui-layout-redesign` 合并至本任务及现有子任务。原始资料保存在 `.trellis/tasks/archive/2026-09/`。逐项对应关系见 `research/legacy-task-consolidation.md`；归档不等于验收通过，也不改变本任务已批准的 Magpie/shadcn 视觉方向与策略优先监控契约。

- [ ] 两个旧 PRD 的未完成项均按合并映射取得当前证据；画布交互由策略画布子任务、源码/CSS 契约由 shell 子任务、主题状态由 appearance 子任务验证，父任务负责整体验收。任何尚未执行的项目继续明确记录。
- [ ] 监控的原始证据通过键盘可达，preview/selected 与加载/空/错误/不可用/未知状态仍区分；活动 telemetry 的 401、超时、页面可见性和迟到响应不会产生错误的活动状态，route trace 在选中切换、草稿变化、关闭和卸载时按契约取消。
- [ ] 最终三视图在桌面/高屏、390px/320px、EN/ZH、light/dark 及 reduced motion 下完成真实交互与截图视觉审阅；保留旧任务的源码目录、别名、九 CSS 文件和唯一入口、静态组件 Tailwind 归属、API/隐私与布局/策略隔离契约。

## Out of scope

All-history routing aggregates, backend/API/schema changes outside the monitoring child's approved read-only activity telemetry, request-count distribution, general drawing tools, arbitrary DAG policy editing, undo/redo, routing-policy semantic changes, credential persistence, deployment and publication.
