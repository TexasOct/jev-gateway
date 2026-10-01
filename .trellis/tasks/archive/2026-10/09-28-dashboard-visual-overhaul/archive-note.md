# 用户决定归档

## 决定与范围

用户在了解剩余任务情况后，明确同意归档 Dashboard 视觉改造及缺少 `finish_reason` 任务。本父任务与三个活动视觉子任务按 `user_archived` 关闭，`acceptance_complete=false`。监控首页子任务已于此前归档，本次不重复移动或改写它的验收结论。

CLI 的 `completed` 状态仅表示已归档。保留原 PRD、未勾选验收、实现记录及历史父子关系；本次不宣称视觉改造整体验收通过，也不将剩余工作自动分配给其他活动任务。

## 已有成果与限制

[实施记录](research/implementation-review.md) 记载 shell、监控、画布和 appearance 的集成，以及当时 lint、170 个前端单元测试、build、bundle 与部分模拟浏览器检查。已有证据不覆盖全部实际交互；本次没有重跑这些检查。

仍保留真实拖拽与连线、zoom/Fit、浮窗遮挡、虚拟列表焦点/滚动、完整策略 review/acknowledge/apply/reset、主题与样式结构矩阵等未收口项。此前两个旧任务合并进入本树的未验收内容继续保存在 [旧任务映射](research/legacy-task-consolidation.md) 及各子任务 PRD；旧任务的 `acceptance_complete=false` 保持不变。

## 归档方式

使用 `--no-commit`，先移动三个活动子任务，再移动父任务；保留四个历史 children 和子任务 parent。任务直接在共享 `main` 工作区实施，branch/base 同为 `main`，没有 PR 或任务提交记录，本次显式使用 `--skip-branch-validation`。已有产品代码、其他任务和工作区改动保留，不提交、不发布。

归档后仅修正因路径移动而失效的上下文与资料引用，不改写历史日志或验收状态。匹配任务的旧会话任务指针由 CLI 清理，不终止会话进程。

安全备份：`/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-task-archive-user-qp2lfag1`。
