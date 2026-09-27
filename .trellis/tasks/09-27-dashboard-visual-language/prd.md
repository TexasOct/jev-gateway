# Dashboard 设计语言与监控路由回放

## Goal

为 JEV Gateway Dashboard 制定一致、可读的视觉语言，并设计一套让操作者检查已留存请求路由证据的监控交互。策略编辑行为保持不变；监控路由动画仅解释已有证据，不伪装成实时流量。

## Background

- 用户希望美化交互 UI，最初要求保留交互逻辑；之后要求参考 Magpie 的路由动画重新设计监控交互，并确认本计划的推荐方案。
- Dashboard 由 Vite/React/TypeScript 和原生 CSS 构成，已有 seed 派生的 light/dark 语义色。
- 当前监控详情包含 request、decision、upstream_request、outcome 字段，可能分别缺失。没有完整的有序 retry 日志、实时事件订阅或 per-stage duration。
- 仓库有其他未提交工作，本任务不能重置、清理、覆盖或提交它们。

## Requirements

- R1：[已完成] 审查现有 UI、样式、参考站点、设计 skills、监控数据契约与测试基线。
- R2：[已完成] 编制独立视觉样式板和可复用的 token/组件规范，使用现有主题色角色与风格边界。
- R3：[已完成] 编制 Magpie 路由动画的证据分析，区分参考事实与 JEV 设计取舍。
- R4：[已完成] 编制独立离线交互原型，采用明确标注的合成样例展示已留存字段及有限回放。
- R5：[已实施] 在现有监控详情卡片内联显示所选请求路由；不另开 modal 或浮层。
- R6：[已实施] 顺序展示 Request → Decision → Upstream request → Outcome。仅已留存字段参与路径；缺失字段以明显断点呈现，动画只沿连续可用连线移动。
- R7：[已实施] 用户显式操作回放；提供 Replay、Pause/Resume、Reset、Replay again。切换会话/请求、刷新或卸载详情时停止并重置回放。
- R8：[已实施] `prefers-reduced-motion` 下保留完整静态路径；如用户显式启动回放，只静态强调有证据的节点，不移动 packet。
- R9：[已实施] 状态只根据所选请求的 outcome 确定：`ok=true` 为成功，`ok=false` 为失败，缺失为未知/未留存，不能展示为“进行中”。
- R10：[已实施] 只复用现有 API 和 retained record 字段，不新增后端 schema；会话分页、request cursor、虚拟列表窗口、证据隐私保持原契约。
- R11：策略工作流、canvas 手势、策略草稿、validate/review/apply、节点几何、布局持久化、API 与后端行为不得因本任务改变。
- R12：生产实现只用现有技术栈，不新增外部字体或运行时依赖；视觉色彩继续采用 seed 派生语义变量。

## Acceptance Criteria

### 已完成的设计阶段

- [x] 独立 style board 覆盖共享导航、监控、策略画布、检查器、底部抽屉、主题与控件状态。
- [x] 独立 monitoring prototype 覆盖会话/请求选择、route path、可留存证据、缺失证据、成功/失败及手动回放控制。
- [x] prototype 只使用本地合成数据；浏览器未发出外部资源/API 请求。
- [x] prototype 验证脚本通过 1440px、390px、320px 视口及 light/dark 下无页面横向溢出；播放、暂停、恢复、重置、完成、空会话、切换和 reduced-motion 检查通过。
- [x] `frontend/` 未被本任务修改。现存 `RoutingCanvas.tsx`、`canvas.ts`、`styles.css` 与最初哈希基线不同，属于并行工作区变化并须保留。
- [x] Task manifests 验证通过；prototype CSS 的 pi-lens 诊断无问题。

### 已完成的产品实现

- [x] 在现有 monitoring detail 卡片内联 route trace；保留 session/request list 和分页结构。
- [x] 路径对应当前选中的 `RetainedRequest` 字段；缺失字段可见且对应连线断开，packet 不跨过缺失证据。
- [x] 成功、失败、未知状态只由 `outcome.ok` 决定；未知不显示为执行中。
- [x] 用户可 Replay、Pause、Resume、Reset、Replay again；切换请求、detail 更新和卸载时取消旧动画帧。
- [x] reduced-motion 下保留静态路线和有证据字段强调。
- [x] 键盘按钮/证据详情可操作，状态通过 polite live region 告知。
- [x] synthetic UI harness 在桌面和 390px 下验证 trace、无文档级横向溢出和回放不增加 API 请求。
- [x] Frontend lint/test/build、bundle freshness、dashboard 相关 pytest、完整 589 项 pytest、Pyright 与 `git diff --check` 通过；见 `research/production-verification-summary.md`。

## Out of Scope

- 新增 retry/attempt event schema、SSE/WebSocket 实时数据、per-stage timings、provider health 判断或 provider-summary API 修改。
- 连接尝试路径、把 candidates 推断为真实调用顺序，或根据 `switched_from` 绘制完整失败序列。
- 修改 API/backend/auth/storage、策略编辑器交互、路由配置语义、节点大小/手势/持久化。
- 执行 Git 清理、恢复其他人的编辑、提交或发布。

## Key Decisions

- 视觉：冷色中性 light/dark、seed 派生强调色，清晰层级，克制的边框和状态样式；画布保留点阵与图结构。
- 监控：在当前详情区内联展示选定请求；route trace 仅说明字段记录顺序，绝不表示真实阶段耗时。
- 交互：显式 Replay/Pause/Resume/Reset/Replay again，无 autoplay/无限循环。
- 证据：只有真实 retained record 字段可进入 production trace；合成数据只允许用于独立 demo。
- 策略编辑器的交互逻辑不变。

## Approval Boundary

用户“按照你的建议继续”确认了上述监控交互方向。当前最终计划待用户评审；收到对本计划的明确实施批准后，才能运行 `task.py start` 并修改产品文件。
