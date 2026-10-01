# Strategy canvas visual redesign

## Goal

Replace all strategy canvas/editor styling with the shared neutral shadcn-like, Magpie-inspired visual system while preserving all existing interaction logic.

## Requirements

- Restyle the workspace, node types, connectors, toolbar, inspector, drawer, advanced editor and policy review controls. Improve the clarity and discoverability of existing question, rule/order, fallback, model-pool and supported-connection editing.
- Preserve node/edge selection, pan, marquee and group move, zoom/Fit, supported connections, keyboard access, DnD, node inspection, advanced edits and configured-policy path explanation. Make the distinction between canvas-layout changes and pending policy edits visible. Do not add strategy semantics, general drawing or new canvas tools.
- Preserve the draft, validation, review, warning acknowledgement, explicit apply, confirmed reset and independent canvas-layout save lifecycles.
- Derive configured diagram edges from the existing draft projection. Do not present observed live-session counts in the editor as policy structure.
- Preserve measured DOM hooks, coordinate mapping, overlay occlusion, hit targets, layout queue and rollback unless a reviewed geometry update with equivalent tests is necessary.

## Acceptance criteria

- [ ] Nodes, edges, toolbar and contextual surfaces visibly follow the new design language, in both schemes and locales.
- [ ] Pointer and keyboard interactions still work at multiple zoom levels and narrow viewports.
- [ ] Layout-only actions never issue policy PUT; policy edits still require validate/review/explicit apply.
- [ ] Diagram motion is finite and explanatory, with static reduced-motion content and no implied production traffic.

## 承接的旧画布/UI 验收（2026-09-30）

用户同意把 `09-26-global-routing-canvas` 与 `09-27-dashboard-ui-layout-redesign` 归档并合并待办。完整映射见 `.trellis/tasks/archive/2026-10/09-28-dashboard-visual-overhaul/research/legacy-task-consolidation.md`。旧的视觉方向以本任务设计为准，其交互与安全契约继续有效。

- [ ] 节点浮窗在画布各边缘、长内容、不同缩放及抽屉开关时仍锚定合理、可内部滚动、不会遮住所有手势目标；关闭详情或取消选择后完整画布操作、焦点和键盘访问恢复，覆盖桌面、390px 和 320px。
- [ ] 单/多节点在 pan/zoom 后正确移动；Escape/pointer cancel 不保存；并发布局失败中止正在进行的手势、回退正确、可重试且不误报成功；验证原生滚轮/触控及跨刷新、跨浏览器布局恢复。旧 `layout-race-followup.md` 的受控滚轮模拟限制不得当成原生输入验收通过。
- [ ] 执行支持的连线/重连、unmatched 重排、fallback、模型池绑定、非法目标及最后成员拒绝、规则增删布局重分配、marquee/多选拖动和完整高级编辑键盘遍历；验证 validate/review/warning acknowledge/apply/reset，布局与选择不产生策略草稿或 policy PUT，不更改 overlay/hash/version。
- [ ] 配置图仍说明 first-match/fallback、标签/模型、草稿与已应用状态，没有假流量、百分比或健康状态；解释动效在关闭浮窗、草稿变化、选择变化和卸载时正确取消，reduced motion 保留完整静态路径与相同解释。

## Dependencies

The shared shell/token task establishes colors and controls. This child exclusively owns coupled `RoutingEditor.tsx` and `RoutingCanvas.tsx` presentation/geometry plus config styles. Shared styles and i18n changes are integrated through the shell owner.

## Out of scope

Undo/redo, general drawing tools, arbitrary DAG execution and changes to backend routing semantics.
