# Strategy canvas visual plan

- [ ] Review uncommitted editor/canvas and config CSS hunks; mark protected geometry and event paths before editing.
- [ ] Apply the shared neutral/seed-accent token system to canvas workspace, nodes, connectors, toolbar, inspector, drawer and advanced editor. Replace all visual presentation without changing gesture and policy handlers.
- [x] Improve discovery and status hierarchy of existing questions, ordered rules, fallback, pools and supported connection editing. Added Edit shortcuts and separated policy connection status from layout-only guidance without adding capabilities.
- [ ] Keep graph derived from the policy draft; style first-match/fallback paths without implying concurrent dispatch or measured traffic.
- [ ] Preserve existing DnD, pointer capture, selection, marquee, pan, zoom/Fit, keyboard and layout save/rollback behavior. If dimensions change, revise coordinate helpers and interaction tests as an explicit reviewed substep.
- [ ] Verify review/acknowledge/apply/reset and no policy PUT on layout or visual selection.
- [ ] Run frontend lint/tests/build and synthetic browser pointer, keyboard, focus, reduced motion and responsive checks at multiple zoom levels. Measure `elementFromPoint` and overlay occlusion, not screenshots alone.

## 合并后的待办

先读 `.trellis/tasks/archive/2026-10/09-28-dashboard-visual-overhaul/research/legacy-task-consolidation.md`，再核对两个归档源任务的 PRD、`09-26` 的 `research/layout-race-followup.md` 和 `09-27` 的 `research/acceptance-test-gaps.md`。

- [ ] 逐项执行本 PRD 新增的浮窗/关闭恢复、真实拖动/取消/失败重试、原生滚轮/触控、跨刷新/跨浏览器布局恢复矩阵，区分历史受控脚本与当前真实输入证据。
- [ ] 在正式合成浏览器设施验证 unmatched/fallback/pool/非法连线/规则增删、marquee/多选、完整高级编辑键盘路径和策略校验/审核/确认/应用/重置，记录请求证明布局与策略写入独立。
- [ ] 复测 first-match 和草稿/已应用图示、动效取消和 reduced motion；测量命中区域、坐标、浮窗遮挡和虚拟列表相关几何，与 shell 负责人协调样式，不通过修改政策语义消除交互问题。
- [ ] 将每项当前结果或无法执行的原因交父任务终验；旧记录未勾选项不可因任务归档而自动通过。

Rollback only strategy-owned hunks; never reset unrelated dirty work.
