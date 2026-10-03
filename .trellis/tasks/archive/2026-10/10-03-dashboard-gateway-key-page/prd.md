# Dashboard 网关 Key 独立连接页

## Goal

将 Dashboard 网关 API Key 输入改为独立连接页面。用户先完成连接，再使用控制台；失败原因和重试操作留在连接页面。

## Background

- 用户已在上一轮确认独立页面、验证成功进入 Dashboard、错误反馈、401 返回和现有样式/中英文/内存凭据的范围，并明确授权“创建任务并改造”。
- 当前源码基线为 main。AppShell 将连接表单与 Dashboard 导航、业务视图同时渲染；App.connect 在请求完成前解除 needsKey。
- 运行实例的配置位于 /Users/texas/.jev-gateway，已只读确认 .env 存在、PID 40853 正在运行；本任务修改源码，不修改其凭据或运行目录。

## Requirements

- R1：需要网关 Key 时展示独立整页，Dashboard 导航和业务面板不可见。
- R2：密码输入有明确 label，可用 Enter 提交；连接过程中显示 pending 并阻止重复提交。连接成功后进入 Dashboard，错误 Key 或网络失败留在连接页并可重试。
- R3：后续认证失效（401）清除内存凭据、停止活动轮询并返回连接页。保留当前未启用鉴权网关的访问兼容。
- R4：Key 仍由 shared/api/client.setCredential 在内存管理，保留 trim 兼容；不写入 URL、localStorage、sessionStorage 或 cookie，不显示实际凭据。
- R5：沿用现有组件、颜色、字体及 English/中文文案，页面在窄屏和明暗模式可读。
- R6：已连接 Dashboard 的 Monitoring、Strategy、Provider、Settings 行为和 API 契约保持兼容。

## Acceptance Criteria

- [x] AC1：401/未连接时独立连接页可见，导航和业务面板不存在；正确 Key 验证成功后可见完整 Dashboard。
- [x] AC2：空白输入不发请求，Key 输入为密码，Enter 可提交，pending 中不提前进入控制台且重复提交不产生第二次连接尝试。
- [x] AC3：错误 Key、网络失败可见错误且可重试；后续 401 返回连接页并停止活动轮询；无需鉴权的网关仍可进入。
- [x] AC4：发出的认证头使用 trim 后的 Key；刷新不会从浏览器存储恢复 Key，URL/cookie/localStorage/sessionStorage 无凭据。
- [x] AC5：English/中文、桌面/窄屏、明暗连接页及已连接主要导航有 browser 验证，无水平溢出。
- [x] AC6：frontend lint、type check、unit、browser 和 build/freshness 检查通过；新增测试验证真实状态转换和请求边界。

## Boundaries

- 本次为轻量 frontend 任务，PRD 加研究与上下文 manifests 即可。
- 沿用 /dashboard/ 应用入口，用独立页面状态呈现连接；不新增后端认证协议、持久登录或账户系统。
- 不重做首次安装 setup、轮换 Key、修改当前 .env、部署运行实例、移动 release tag 或重新发版。
