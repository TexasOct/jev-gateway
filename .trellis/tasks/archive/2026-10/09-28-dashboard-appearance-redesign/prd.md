# Dashboard appearance redesign

## Goal

Redesign the appearance view around a configurable accent on a neutral dashboard surface while retaining its existing theme behavior.

## Requirements

- Present the saved/previewed seed and its visual effect clearly, along with contrast information and save/reset actions.
- Preserve the existing theme GET/PUT/DELETE shape, local preview, write guards and light/dark scheme behavior. No new preference persistence.
- Use shared tokens/controls and preserve English/Chinese labels, keyboard access and responsive layout.

## Acceptance criteria

- [ ] Seed changes preview selected and primary colors on neutral surfaces, with legible contrast in both schemes.
- [ ] Save/reset retain the existing guarded API behavior and clear loading/error states.
- [ ] Theme changes do not modify policy, layout or locale storage.

## 承接的主题验收（2026-09-30）

根据用户确认的旧任务合并方案，本任务承接 `09-27-dashboard-ui-layout-redesign/research/acceptance-test-gaps.md` 中主题相关缺口；映射见 `.trellis/tasks/archive/2026-10/09-28-dashboard-visual-overhaul/research/legacy-task-consolidation.md`。

- [ ] theme GET 与 save/reset 的并发和迟到响应不覆盖当前状态；写入串行化、pending guard、旧 notice 清理及当前错误显示均正确。与 shell 负责人共同核验，不新增 API 字段或 preference 持久化。
- [ ] 刷新页面后的 seed 读取、系统 scheme 行为、完整浏览器对比度矩阵均有证据；代表性种子在 light/dark、双语和桌面/窄屏下可读，小字状态达到 4.5:1，键盘操作保持可达。

## Dependencies

The shared shell/token task owns seed-to-token mapping, `App.tsx` and shared CSS. This child owns appearance view presentation and view-specific style/tests only.

## Out of scope

Backend theme schema changes, fixed-neutral-primary replacement, external fonts or persisted scheme preferences.
