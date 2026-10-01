# Appearance redesign plan

## 合并后的待办（2026-09-30）

先读 `.trellis/tasks/archive/2026-10/09-28-dashboard-visual-overhaul/research/legacy-task-consolidation.md`，保留旧任务的主题行为限制。

- [ ] 使用合成 API 延迟和失败情景验证 theme 读写并发、save/reset 串行化、pending guard、迟到响应、notice 清理及错误展示；`src/app/` 状态修改通过 shell 负责人集成。
- [ ] 在双语、light/dark、代表性 seed、桌面/390px/320px 完成键盘、页面刷新、系统 scheme 与 4.5:1 小字状态对比度验证。不得通过新增浏览器偏好存储满足验收。
- [ ] 将可复核结果及仍无法执行的项交父任务，不因源任务归档而勾选通过。

## 原执行计划

- [ ] Review existing appearance view and dirty shared theme changes before editing.
- [ ] Redesign seed preview, contrast display and save/reset affordances using shared neutral controls; preserve current callbacks and API shape.
- [ ] Verify loading/error/disabled states and seed preview in both schemes with keyboard and narrow-screen use.
- [ ] Add/update focused appearance tests, then run frontend lint/tests/build after shared integration.
- [ ] Review appearance-owned diff and roll back only those hunks if needed. Do not touch `App.tsx`, global CSS, `palette.ts` or i18n directly.
