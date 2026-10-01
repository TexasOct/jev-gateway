# 旧 dashboard 任务合并记录

2026-09-30，用户同意把 `09-26-global-routing-canvas` 与 `09-27-dashboard-ui-layout-redesign` 的未完成验收转入本任务及现有子任务，再将两个旧任务归档。两项旧任务的原始 PRD、设计、执行记录和研究文件保留在 `.trellis/tasks/archive/2026-09/`；归档表示停止重复跟踪，不表示以下验收已通过。检查框保持未勾选，后续应据实际证据逐项核验。

## 视觉方向与结构约束

`09-27-dashboard-ui-layout-redesign` 原有的 Excalidraw/New York 视觉方向被本任务已批准的 Magpie/shadcn 中性视觉方向取代。其安全、交互、响应式、布局/策略隔离、Tailwind、源码目录和九个 CSS 文件等非视觉契约继续有效。不得为了保持旧视觉样式而覆盖新设计，也不得以新设计为由删除未验收的行为检查。

旧任务 `09-27` 的目录目标：`src/app/`、`src/features/{monitoring,routing,appearance}/`、`src/shared/{api,i18n,theme,ui}/`，跨模块导入使用 `@/`；`frontend/src/styles/` 仅有 `index.css`、`tokens.css`、`base.css`、`shell.css`、`monitoring.css`、`routing.css`、`canvas-geometry.css`、`appearance.css`、`virtual-list.css`，`index.css` 是唯一 CSS 入口。静态组件样式优先放在归属组件的 Tailwind 类中；动态坐标、种子调色及必要共享 CSS 按原契约保留。浏览器测试使用独立配置和合成 API 数据，不接触真实网关。

## `09-26-global-routing-canvas` 未完成项

| 原 PRD 未勾选项 | 继续负责的任务 | 完成前所需证据 |
| --- | --- | --- |
| 节点属性浮窗锚点、内部滚动和各画布边缘的可视范围 | `09-28-strategy-canvas-visual-redesign` | 桌面、320/390px、缩放及抽屉展开状态的实测布局和键盘访问；检查浮窗不覆盖手势目标。 |
| 取消选择或关闭详情后的画布操作、键盘和窄屏访问 | `09-28-strategy-canvas-visual-redesign` | 实际 pointer/keyboard 操作，确认 pan、drag、焦点和工具状态恢复。 |
| 单/多节点缩放平移拖动、取消手势、保存失败及滚轮/并发写入竞态 | `09-28-strategy-canvas-visual-redesign` | 阅读旧任务 `research/layout-race-followup.md`，复核其中受控滚轮模拟的限制；运行原生浏览器输入、失败后重试、布局独立 PUT 与刷新恢复。纯函数测试和旧脚本不能代替新视觉集成后的复测。 |
| 现有策略编辑、校验/审核/应用无回归，布局不产生待审策略更改 | `09-28-strategy-canvas-visual-redesign`，父任务终验 | 真实连线、节点编辑、warning 确认、应用/重置和请求记录；layout/selection/动画不发 policy PUT。 |

旧任务 `implement.md` 还承接了 `.trellis/tasks/archive/2026-09/09-24-dashboard-routing-workflow/research/browser-verification.md` 未验的 unmatched 重排、fallback、模型池连线、非法目标、规则增删、窄屏触控、跨浏览器布局恢复和并发写入。以上继续由策略画布子任务验证，无法执行的项保留明确缺口。

## `09-27-dashboard-ui-layout-redesign` 十项未完成验收的归属

| 原 PRD 顺序 | 继续负责的任务 | 保留的验收边界 |
| --- | --- | --- |
| 1. 三视图响应式视觉和画布占满工作区 | `09-28-dashboard-shell-visual-system`、`09-28-strategy-canvas-visual-redesign`、父任务终验 | 新视觉方向下的桌面、390/320px、双语及双主题无横向溢出；工具与浮窗可达。 |
| 2. 会话预览、已记录路由/结果与详情状态 | 父任务终验（已归档的 monitoring 子任务保留实现历史） | 新的策略优先监控仍能查看 preview/selected、加载/空/错误/不可用/未知及键盘可达的原始证据，不用原始 ID 代替解释。 |
| 3. 配置图的 first-match、fallback、标签/模型和草稿状态 | `09-28-strategy-canvas-visual-redesign` | 仅配置投影；不出现百分比、假流量或健康状态。 |
| 4. 解释动效、reduced motion 与无 policy PUT | `09-28-strategy-canvas-visual-redesign` | 有限运动与完整静态文案；选中、播放及布局写入不更改策略；检查关闭浮窗、改草稿及卸载时取消动效。 |
| 5. 画布手势、键盘、浮窗、高级编辑及策略/布局存储隔离 | `09-28-strategy-canvas-visual-redesign`、父任务终验 | 真正执行连接、marquee、多选拖动、完整高级编辑键盘遍历、校验/审核/确认/应用/重置及布局 PUT 的分离。 |
| 6. Tailwind 组件归属、九文件 CSS 及主题变量 | `09-28-dashboard-shell-visual-system`，画布子任务复核几何 | 保留 CSS 唯一入口、原坐标/虚拟列表尺寸、两种 scheme、种子调色、命中测试及无远程运行资产；按新视觉目标评审外观。 |
| 7. 前后端、产物和隔离浏览器矩阵 | 父任务终验 | 在最终合并树重跑 lint/tests/typecheck/build、bundle freshness、相关 gateway/security 及合成浏览器 pointer/focus/分页/reduced-motion 检查。 |
| 8. 迁移基线、逐步测试及安全隔离 | 父任务终验 | 旧任务已记录历史基线；后续从当前脏工作树重新记录改动前状态，只在正式浏览器测试设施使用合成 API，不碰真实网关。 |
| 9. 唯一 CSS 入口与几何数值 | `09-28-dashboard-shell-visual-system`，画布子任务复核 | 九文件列表、唯一 `frontend/src/styles/index.css` 入口及迁移前后 canvas/list 规则数值一致。 |
| 10. 目标树、别名、测试发现及 API/监控 ownership | `09-28-dashboard-shell-visual-system`、父任务终验 | 目标目录和浏览器 fixture/spec 拆分、旧目录缺席、模块导入及测试发现；`App.tsx` 编排和 API/监控契约保持一致。 |

详见归档后的 `09-27-dashboard-ui-layout-redesign/research/acceptance-test-gaps.md`，其中包括活动 telemetry 401/超时/可见性与过期响应、主题读写并发、route trace 取消、inspector 矩阵、原始证据键盘可达、连接/marquee/多选和截图视觉审阅缺口。旧记录里的 22 项浏览器测试与 565 项 Python 测试仅是当时结果，不是本次合并后重跑的证据。

## 收尾原则

按上述负责人更新父/子任务的 PRD 和执行计划后才归档源任务。父任务最终集成检查必须逐项核对本表和旧 PRD；失败或环境无法执行的项目继续未勾选并标明原因。不得把本次文档合并记为功能通过、代码已提交或线上已验收。
