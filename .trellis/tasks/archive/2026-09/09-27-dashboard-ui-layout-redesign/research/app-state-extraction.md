# App 状态抽取：最小边界

本结论基于当前工作树；CSS 迁移和 API 契约有并行负责人，实施前需重新核对行号及文件所有权。任务要求先有测试基线和 CSS/import 组织，再抽取 App 状态，API 与 monitoring 文件迁移等接口稳定后再做（`prd.md` R10–R12；`design.md`「Source and test structure」；`implement.md`「Ordered work」）。目前没有独立的 `useMonitoringData`、`useRouteActivity`、`useDashboardTheme` 或 `AppShell`；以下名称均为拟议的抽取边界，现有实现集中在 `frontend/src/App.tsx:45-765`。

## 可迁移的状态及调用边界

| 边界 | 连同状态一起移动的逻辑 | 留在 App 的依赖和接口 |
| --- | --- | --- |
| `useRouteActivity` | `App.tsx:52-59` 的样本、错误、序号、轮询 kick 及四个 refs；`App.tsx:103-131` 清除、停止、重试、重启；`App.tsx:173-225` 带超时的请求；`App.tsx:287-348` 可见性监听和轮询。向监控视图提供 `activity`、`activityError`、`activitySequence`、`retry`，向 App 暴露 `stop`/`restart`。 | 输入 `view === "monitoring"`、`needsKey` 与一个处理 401 的 App 回调。页面切换 `App.tsx:525-533` 和手动刷新 `App.tsx:441-443` 继续分别调用 stop/restart。不要把活动样本解释成配置策略的播放或健康状态。 |
| `useMonitoringData` | `App.tsx:51,60-81` 的 providers/strategies/policy、会话/详情/选中请求、完成/错误/加载/epoch、分页忙标记、generation 和详情 abort；`App.tsx:227-285` 并行首页读取及游标遍历，`App.tsx:350-424` 两类续页，`App.tsx:477-504` 选会话。输出保持 `App.tsx:693-728` 的 `MonitoringView` props 形状，可提供 `refreshSelectedDetail` 和 `resetDetail` 给 App 的总刷新调用。 | `run` 和 401 处理由 App 提供；尤其 `App.tsx:382-385,412-416` 的局部续页 401 也必须清除模块凭据、打开认证并停止活动轮询。`loadConfiguration` 仍是 `App.tsx:426-428` 的独立策略读，不放进监控 hook。总刷新仍按 `App.tsx:441-468` 的顺序：停止/重启活动，废弃详情，加载监控，重新读取所选详情，再加载配置、主题。 |
| `useDashboardTheme` | `App.tsx:83-101` 的 seed/savedSeed、方案偏好、系统暗色订阅、palette 推导及 document 应用；`App.tsx:149-171` 读主题；`App.tsx:536-588` 保存/重置和忙标记。输出包含 scheme setter、palette、seed setter、loading/error/notice、save/reset/load，保持 `App.tsx:729-746` 的展示属性。 | `t` 用于通知文本，`run` 用于全局异常/401；`configuration.write_available` 仍在 App `App.tsx:590` 决定禁写。`App.tsx:634-649` 的方案选择可由 shell 调用 hook setter。不要另建持久化主题 store。 |

`App.tsx:133-147` 的 `run`、`App.tsx:48-50,506-533` 的认证、全局错误、视图导航和总刷新由 App 编排。`App.tsx:430-439` 的 mount 加载保留微任务延后，避免同步 effect setter 规则变化；`App.tsx:513-520` 仍先把 trim 后的密钥交给 API 模块，再读监控和主题。主题读在监控加载之后，监控首页四个请求则并行 `Promise.allSettled`（`App.tsx:240-278`）。不要为了减少 props 把这些顺序隐含在 shell 中。

## 并发与凭据语义

- 活动读仅在可见、监控页、无需输入密钥时执行，同一个在途请求复用 promise（`App.tsx:173-176`）；generation 阻止旧响应写回，10 秒超时 abort 并使样本失效，成功样本仅维持剩余新鲜期（`App.tsx:178-220`）。轮询每轮完成后才安排下一轮；隐藏、切页和 effect 清理会停计时、abort、清空样本/标为不可用，恢复可见时立即请求（`App.tsx:287-348`）。移动时应整体迁移这些 refs/effect，不能只抽取 fetch 函数。
- 会话首页和游标请求目前不传 abort signal，以 `sessionGeneration` 及 `remainingSessionPages` 的 `isCurrent` 丢弃过期页，保留成功页供重试，storage 失败不得标为完整（`App.tsx:227-285,350-394`；`frontend/src/session-pages.ts:4-22`）。详情续页/切换/刷新使用 `AbortController` 和 `detailGeneration`，旧请求不得覆盖新选择；续页合并按 request ID 去重（`App.tsx:396-424,441-463,477-504`）。抽取阶段不要顺手改成统一 abort 策略。
- 主题读有 `themeReadGeneration`，写入期间读被跳过；保存/重置使旧读失效，`themeWriteBusy` 同步阻止重复提交，异步 pending 仅控制 UI（`App.tsx:149-171,536-588`）。系统配色订阅和 `applyPalette` 属于 hook 的浏览器副作用（`App.tsx:31-43,92-101`）；只有 locale 在 `frontend/src/i18n.tsx:4` 使用浏览器存储。
- API 凭据只在 `frontend/src/api.ts:1-6,229-243` 的模块内存中，由 `setCredential` 写入，带 Bearer 头且 `cache: "no-store"`。认证入口 `App.tsx:506-523`、全局 401 `App.tsx:133-147` 以及上述局部续页和活动 401（`App.tsx:210-217`）行为均须保留。hooks 不存储、复制或通过 shell props 传递密钥；可共享无密钥的 `onUnauthorized` 回调。注意首页 `allSettled` 收集失败、最终才抛第一个错误（`App.tsx:240-278`），不能因某一路失败提前丢弃其他成功数据。

## AppShell 的展示边界

建议最后才从 `App.tsx:592-765` 拆纯展示 `AppShell`：接收 view、needsKey、keyDraft、error、locale/t、scheme、各视图 props 及事件回调，渲染 header/nav `App.tsx:593-663`、main/连接表单/全局错误 `App.tsx:665-691` 和视图切换 `App.tsx:693-761`。认证表单的空值校验和密钥写入仍由 App 事件处理；shell 只调用回调。策略 `RoutingEditor` 的 `key={configuration.config_hash}`、错误及 reload 回调保留（`App.tsx:748-760`）；`writeDisabled` 源于配置，不属于主题 hook。可以先抽三个 hook，再抽 shell；不为迁移重排监控/API 文件或改动视觉 owner 正在处理的 CSS。

## 已覆盖行为与测试增量

`frontend/src/api.test.ts:10-25` 检查 Bearer/no-store 的策略读；`frontend/src/session-pages.test.ts:16-61` 覆盖失败续页、游标、代次淘汰和 storage；`frontend/src/monitoring/MonitoringView.test.tsx:27-45,49-90`、`frontend/src/appearance/AppearanceView.test.tsx:16-35,63-65` 使用 `renderToStaticMarkup` 检查子视图文案/状态，不能验证 App effect、交互或计时。目前 App 仅由生产入口 `frontend/src/main.tsx:4,14-19` 挂载，未见 App/AppShell 的直接组件测试。现有浏览器 suite 用 Playwright 独立 loopback preview `frontend/playwright.config.ts:3-21`；`frontend/tests/browser/fixtures.ts:6-16` 安装 synthetic API 并拦住意外写，`frontend/tests/setup/mock-api.ts:14-69` 默认只放行 canvas-layout PUT。

浏览器可观察基线：游标错误和重试保留已有行 `frontend/tests/browser/dashboard.pw.ts:8-24`，键盘选会话/详情 `:26-37`，策略切换和 reduced-motion 路径无策略写 `:39-61`，键盘/指针移动只写布局 `:63-86`，320/390px 两语言两配色和各视图无页面溢出 `:88-103`。这些测试尚未覆盖 App 的空密钥/连接/401 转换、活动隐藏/恢复/超时/陈旧结果、快速换会话后旧详情、总刷新顺序、系统方案订阅和主题保存/重置的读写竞争。

最小增量：抽 shell 后可用已有 SSR 模式测试其静态分支（连接表单、nav `aria-pressed`、全局错误、策略加载态），明确 SSR 不证明点击。交互和 race 用既有 Playwright fixture 扩展受控响应和请求记录：先覆盖连接与 401、快速换会话/刷新后旧详情不露出；再覆盖可见性暂停/恢复与活动超时、主题写入期间旧读不覆盖新 seed。主题 PUT/DELETE 测试需仅在该测试受控放行并断言请求体及没有多余写；保持默认 fail-closed，不引入新 DOM 测试环境。所有 API 形状断言和活动/监控 fixture 扩展须待 API owner 稳定后进行。

## 等待条件与执行验证

现在可规划 hook/shell 边界；实际编辑须等 CSS/import 迁移完成并通过该步 lint/tests/build，且 `App.tsx` 归集成 owner 单独持有。进一步涉及 `/v1/routing/activity`、监控 payload、`api.ts`、`monitoring/` 或 synthetic fixture 的类型与行为时，先等另一 owner 明确完成契约、相应 API/监控测试通过、字段及错误/401/abort 语义不再变化，再核对 `frontend/src/api.ts:102-126,257-270` 与 mock `frontend/tests/setup/mock-api.ts:38-65`。若未稳定，抽取保持当前 API 调用与 props 原样，相关测试增量延后；不以本研究推定新契约。

实施后按任务计划每步运行 `cd frontend && npm run lint && npm test && npm run build`；浏览器用 `cd frontend && npm run test:browser`（脚本含 build 和浏览器 TS 检查，`frontend/package.json:6-12`），并按集成门禁执行 `sh scripts/build-frontend.sh --check`。重点观察隐藏时活动停止与恢复、401 后凭据被清除、旧会话/主题响应不回写、重试保留已读页，以及没有非预期策略 PUT。此轮仅做静态研究，未运行长测试。
