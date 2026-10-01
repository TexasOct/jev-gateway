# Dashboard shell and visual system

## Goal

Give all dashboard views a consistent Magpie-inspired, shadcn/ui-like visual foundation while keeping JEV's configurable seed as the action/selection accent.

## Requirements

- Build a compact navigation/shell with clear view switching and reachable refresh, locale and theme controls on desktop and mobile.
- Apply a neutral surface, border, spacing, type, focus and control system through existing Tailwind v4 and project-owned shadcn-adapted components.
- Retain the seed-derived accent, `data-scheme` light/dark behavior, existing theme API shape, same-origin assets, localization and memory-only credentials.
- Own and integrate shared files only after reviewing current uncommitted modifications. Coordinate view-owned changes without overriding them.

## Acceptance criteria

- [ ] All three views consume the same neutral visual tokens and control treatment, while selected/primary accents change with the saved theme seed.
- [ ] Light/dark themes, English/Chinese labels, keyboard focus and narrow navigation remain usable.
- [ ] Shared stylesheet migration does not override canvas hit geometry or virtual list fixed heights.
- [ ] No unrelated dirty changes, auth/persistence behavior or asset paths are changed.

## 承接的结构与集成契约（2026-09-30）

用户同意将 `09-27-dashboard-ui-layout-redesign` 的结构及 CSS 验收转至本任务；完整映射见 `.trellis/tasks/archive/2026-10/09-28-dashboard-visual-overhaul/research/legacy-task-consolidation.md`。视觉方向服从现有 Magpie/shadcn 设计，以下结构契约继续保留。

- [ ] 保留 `src/app/`、`src/features/{monitoring,routing,appearance}/`、`src/shared/{api,i18n,theme,ui}/`、跨模块 `@/` 导入、归属模块内测试及 `__tests__/`、正式合成浏览器 fixture/spec 拆分；旧路径缺席，导入/测试发现和 API/监控 ownership 正确，`App.tsx` 编排行为不变。
- [ ] `frontend/src/styles/` 恰含 `index.css`、`tokens.css`、`base.css`、`shell.css`、`monitoring.css`、`routing.css`、`canvas-geometry.css`、`appearance.css`、`virtual-list.css`，唯一 CSS 入口为 `index.css`。组件静态样式由 Tailwind 类承载，共享全局规则/主题定义/keyframes 按契约保留，不恢复编号 CSS、独立 Tailwind 文件、feature CSS、`@apply` 替代类或通用选择器映射。
- [ ] 保持画布命中/坐标和固定虚拟列表尺寸、runtime seed 与 `data-scheme`、same-origin/CSP/鉴权、内存凭证和仅 locale 的浏览器持久化。联合各视图验证 desktop/高屏/390px/320px 双语双主题、焦点、溢出、控件可达与当前截图视觉效果。

## Out of scope

Backend/API changes, new theme persistence fields and per-view content redesign (owned by sibling tasks).
