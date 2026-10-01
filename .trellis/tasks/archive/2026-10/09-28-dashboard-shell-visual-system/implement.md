# Shared visual system plan

## 合并后的待办（2026-09-30）

先读 `.trellis/tasks/archive/2026-10/09-28-dashboard-visual-overhaul/research/legacy-task-consolidation.md` 与两个归档源任务。保留 `09-27` 已记录的实现基线，下面是最终树仍需满足的门槛，不要求重做已验证的迁移。

- [ ] 核对原 `09-27` R10/R11/R12 目标目录、`@/` 导入、测试发现与浏览器 fixture/spec 拆分；检查生产 helpers 和测试没有因整理被删除。文件迁移先确认 API/监控接口和单一 ownership。
- [ ] 检查精确九个 CSS 文件、唯一入口及 component Tailwind 归属；比较 canvas/list 几何、命中、焦点和 computed styles，保留 runtime seed/`data-scheme`，不引入远程运行资产或全局 reset 冲突。
- [ ] 与 appearance 负责人核验主题读写竞态与系统 scheme；与策略负责人完成浮窗可达、双语/双主题 desktop/高屏/390px/320px 及 reduced motion 的集成浏览器检查和截图审阅。结果交父任务终验。

## 原执行计划

- [ ] Inspect dirty shared files and active related tasks; record baseline and exclusive ownership before any edit.
- [ ] Read `trellis-before-dev` and dashboard spec, verify current token/controls and compute light/dark contrast for representative seeds.
- [ ] Introduce neutral surface and shadcn-like component roles while retaining seed-driven primary and `data-scheme`. Avoid global reset collisions.
- [ ] Replace shell markup/layout with compact responsive navigation and clear active/focus states; preserve all existing state callbacks.
- [ ] Integrate sibling monitoring API reads and locale copy into `App.tsx`/`i18n.tsx` only after monitoring props are agreed. Coordinate appearance and strategy style requirements without editing their view-specific files.
- [ ] Run `npm --prefix frontend run lint`, `npm --prefix frontend run test`, `npm --prefix frontend run build` and `sh scripts/build-frontend.sh --check` after final integration. Browser-check both schemes/locales, 320px/390px and desktop, keyboard focus, seed contrast, canvas hit testing and virtual-list heights.
- [ ] Review shared-file diff against dirty baseline. Revert only owned hunks on failure; do not reset the worktree or change API/storage contracts.
