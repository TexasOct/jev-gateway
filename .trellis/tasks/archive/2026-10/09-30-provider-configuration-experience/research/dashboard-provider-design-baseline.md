# Dashboard provider 前端与设计基线

本轮只研究前端，不审查后端实现或外部 CC Switch。`task.py current --source` 返回 `Current task: (none)`、`Source: none`；依据调用方明确指定的任务目录保存研究，不更改活动指针。本文区分源码事实、待核实风险和规划建议。

## 阅读范围与设计文档

完整读取 `frontend/src/styles/` 下九个 CSS 文件（共 125 行）、`shared/theme/palette.ts`、`app/App.tsx`、`app/AppShell.tsx`、`features/appearance/AppearanceView.tsx`、`features/routing/RoutingEditor.tsx` 和 `RoutingCanvas.tsx`。补读 API 类型/客户端、共享控件、监控视图及浏览器测试。CSS 唯一入口及导入顺序见 `frontend/src/styles/index.css:1`、`:73`。

研究时根目录枚举未发现设计规范文件，包括大小写不同的名称。不存在的文件没有可引用行号，此项是目录检查结果；创建根目录 `DESIGN.md` 的要求见父任务 PRD 的 R6 / AC6。本研究 agent 不创建它；父会话随后已据本研究和源码核对生成根目录 `DESIGN.md`，并按 Google 官方 alpha specification 重排。格式来源与校验记录见 `design-md-format.md`。

## 现有页面和配置流程

- Shell 的页面联合类型为 monitoring、strategy、providers、settings；Providers 仅渲染标题和 pending 文案，没有配置表单（`frontend/src/app/AppShell.tsx:15`、`:286`；`frontend/src/shared/i18n/en.ts:14`）。
- Settings 包含语言、配色模式及 Appearance，主题状态和保存/重置回调由上层传入（`frontend/src/app/AppShell.tsx:240`、`:254`、`:269`）。Appearance 使用颜色输入与 hex 输入共同编辑 seed，非法值有 `aria-invalid` 和 alert；保存/重置受 loading、writeDisabled 约束（`frontend/src/features/appearance/AppearanceView.tsx:253`、`:260`、`:266`、`:272`、`:277`、`:286`）。
- 前端 `api.providers()` 读取观察摘要；`ProviderRow` 包含 configured、has_api_key、attempts、延迟和观察结果。监控表格呈现这些观察记录，不能据此称为实时健康检查或配置管理（`frontend/src/shared/api/client.ts:65`；`frontend/src/shared/api/types.ts:109`、`:124`；`frontend/src/features/monitoring/components/SessionInspector.tsx:239`）。
- 客户端当前没有 provider CRUD、连接测试、模型发现、预设目录或 decision provider 管理方法。已有写接口是 routing configuration 的 validate、PUT、DELETE；其 overlay 只包含 questions、rules、fallback 和模型 tags/priority，不能承载凭据、provider type 或 upstream_model 编辑（`frontend/src/shared/api/client.ts:64`、`:82`；`frontend/src/shared/api/types.ts:142`、`:147`）。这里说明前端契约状态，不推断后端是否已有未接入接口。
- 模型列表提供 provider、upstream_model、priority 和 tags；规则标签可通过拖拽或 select 分配模型、移除成员并修改优先级，外部标签只展示（`frontend/src/shared/api/types.ts:38`；`frontend/src/features/routing/RoutingEditor.tsx:202`、`:231`、`:244`、`:250`、`:256`）。显式 models 标签锁定成员；保存后的池排序是服务端结果，不是实时预览（同文件 `:704`、`:725`）。
- 策略模式列表合并现有规则值与硬编码 cheapest_adequate、quality_first、balanced；编辑先 validate，再 review/显式 apply，reset 单独调用接口（`frontend/src/features/routing/RoutingEditor.tsx:393`、`:482`、`:501`、`:519`）。这些模式是路由选择策略，不能直接当作模型发现服务策略。
- API credential 只留在模块内存，按需加入 Authorization，fetch 使用 no-store（`frontend/src/shared/api/client.ts:35`、`:47`、`:49`）。Settings 打开时加载 theme，configuration 在 Strategy 分支加载；writeDisabled 依赖 configuration.write_available（`frontend/src/app/App.tsx:111`、`:119`）。因此先进入 Settings 时，写可用性尚未读取是需验证的前端风险，本文未运行浏览器复现。

## 颜色和主题原值

静态默认 token 见 `frontend/src/styles/tokens.css:2`：

| 角色 | 原值 |
| --- | --- |
| bg / surface / surface-alt / code-bg | `#f5f7fa` / `#ffffff` / `#eef1f7` / `#edf1f7` |
| border / text / text-muted | `#d8dee8` / `#17202a` / `#5c6b80` |
| accent / hover / active / on-accent | `#3b66d9` / `#3259c2` / `#294ba9` / `#ffffff` |
| good / bad / warn | `#1f7a4b` / `#b33b3b` / `#8a5a00` |

运行时 `buildPalette` 使用默认 seed `#3b66d9`；浅色中性面为 bg `#f8f9fa`、surface `#ffffff`、surfaceAlt `#f2f3f5`、codeBg `#f4f4f5`、border `#d8d9de`、text `#18181b`、muted `#52525b`。深色对应 `#0b0b0c`、`#161618`、`#222225`、`#1b1b1e`、`#38383e`、`#f4f4f5`、`#b4b4bd`（`frontend/src/shared/theme/palette.ts:13`、`:129`、`:153`、`:171`、`:195`）。accent 等运行时值经 seed/对比度计算，不能把静态 fallback 写成所有 seed 下的最终颜色。

`paletteVariables` 映射变量，`applyPalette` 写 root inline style 并设置 data-scheme（`frontend/src/shared/theme/palette.ts:311`、`:331`）。CSS 深色规则只声明 color-scheme，不提供完整静态深色变量（`frontend/src/styles/tokens.css:18`）。两套浅色原值不一致是确定事实；是否产生可见首帧闪变尚未实测。DESIGN.md 应同时记录 fallback 与运行时来源。

Tailwind 角色映射把 primary 对应 seed accent，但 shadcn 的 accent 对应 surface-alt 中性 hover；不要按变量名字误认为二者颜色相同（`frontend/src/styles/index.css:42`、`:50`、`:62`）。

## 字体、尺寸、布局和控件

- body 为 `14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif`，表单继承字体（`frontend/src/styles/base.css:2`；`frontend/src/styles/index.css:8`）。Shell 标题 text-sm、font-semibold、tracking-tight，副标题 11px；策略标题 17px，inspector 13px，Appearance 对比度表 text-xs（`frontend/src/app/AppShell.tsx:108`、`:111`；`frontend/src/features/routing/RoutingEditor.tsx:534`、`:575`；`frontend/src/features/appearance/AppearanceView.tsx:68`）。
- 原生按钮最小高度 2.25rem、padding 0.45rem 0.7rem、圆角 0.4rem；输入 padding 0.45rem 0.55rem。共享圆角 sm/md/lg 为 0.375/0.5/0.625rem。Button 使用 rounded-md、gap-2、text-sm，尺寸 h-9/h-10、icon size-10、icon-sm size-9；Card 使用 rounded-lg、gap-4、py-4、px-4（`frontend/src/styles/index.css:10`、`:19`、`:32`；`frontend/src/shared/ui/button-variants.ts:6`、`:18`；`frontend/src/shared/ui/card.tsx:7`）。
- 非策略主内容 max-width 1440px、gap-4、px-4/py-5，在 720px 以下 gap-3/p-3，lg 为 px-6；策略页 h-dvh、两行 grid、overflow-hidden（`frontend/src/app/AppShell.tsx:95`、`:164`）。Header 默认两列，lg 三列，gap-x-3/gap-y-2、px-3/py-2，sm px-5、lg px-6（同文件 `:99`）。
- Appearance 在 lg 使用 1.15fr/0.85fr 两栏，色板 repeat(auto-fit,minmax(min(100%,7rem),1fr))、gap-3；表格 min-width 29rem 并允许横向滚动（`frontend/src/features/appearance/AppearanceView.tsx:175`、`:139`、`:67`）。Monitoring 自有 1600px 上限，左栏 280 至 380px，在 899px 以下收拢（`frontend/src/features/monitoring/MonitoringView.tsx:57`）。
- 策略 inspector 宽 min(340px,100vw-24px)、高上限 460px；底部 drawer 高上限 min(48%,36rem)，有 900px/600px 分支。Canvas toolbar bottom/left 12px、宽 calc(100%-24px)、gap 0.3rem，600px 下调整并横向滚动（`frontend/src/features/routing/RoutingEditor.tsx:573`、`:584`；`frontend/src/features/routing/RoutingCanvas.tsx:543`）。
- 安装的 Tailwind 默认 sm/md/lg 为 40rem/48rem/64rem（`frontend/node_modules/tailwindcss/theme.css:327`、`:328`、`:329`）；业务另用 720/899/900/600px，DESIGN.md 需要分别列明。

## 状态、motion 和 a11y

- disabled 为 not-allowed、opacity 0.65；focus-visible 为 2px accent outline、offset 2px（`frontend/src/styles/index.css:24`、`:25`）。导航 aria-pressed 控制选中样式；非法 seed 切换负向边框；drop zone 切换 primary/5 与中性面（`frontend/src/app/AppShell.tsx:134`；`frontend/src/features/appearance/AppearanceView.tsx:261`；`frontend/src/features/routing/RoutingEditor.tsx:284`）。Canvas 分 selected、compatible、incompatible、dragging、read-only 状态（`frontend/src/features/routing/RoutingCanvas.tsx:615`）。
- 配置连线 trace 为 900ms ease-out 单次动画，拖动节点为 0.9s ease-in-out 无限往返，两者提供 reduced-motion 分支；监控连线另有无限流动/暂停处理。平移和 reveal 使用 instant scroll（`frontend/src/features/routing/ConfiguredRouteFlow.tsx:106`；`frontend/src/styles/routing.css:2`；`frontend/src/features/routing/RoutingCanvas.tsx:615`、`:470`、`:488`；`frontend/src/features/monitoring/components/StrategyDistribution.tsx:143`；`frontend/src/styles/monitoring.css:2`）。不能把这些动画解释为供应商实时健康或模型发现进度。
- Canvas 有 aria-label、tabIndex=0、toolbar roving focus、命名的操作组、zoom polite status；Escape 关闭 inspector/drawer（`frontend/src/features/routing/RoutingCanvas.tsx:533`、`:543`、`:554`、`:557`；`frontend/src/features/routing/RoutingEditor.tsx:560`）。Appearance 有 aria-busy、alert、loading/notice status，装饰色板 aria-hidden（`frontend/src/features/appearance/AppearanceView.tsx:177`、`:272`、`:295`、`:310`、`:145`）。
- 调色板以正文 4.5、大文字 3 为对比度目标，并输出测量 pass/fail（`frontend/src/shared/theme/palette.ts:14`、`:15`、`:307`）。这些代码目标不等同于整页已经通过无障碍审计。

## 品牌 logo 与操作图标

`lucide-react` 已安装且在 package.json 固定为 `1.48.0`；它承担通用操作和节点类别符号（`frontend/package.json:23`；`frontend/src/features/routing/components/CanvasNodeContent.tsx:27`；`frontend/src/features/routing/RoutingCanvas.tsx:551`）。Refresh 使用装饰 SVG、aria-hidden/focusable=false，按钮负责名称（`frontend/src/app/AppShell.tsx:153`；`frontend/tests/browser/icons.spec.ts:5`）。路线箭头仍有内联 SVG（`frontend/src/features/routing/RoutingEditor.tsx:94`；`frontend/src/features/routing/ConfiguredRouteFlow.tsx:105`）。

frontend 目录资产枚举没有发现 svg/png/ico/webp/jpg/jpeg 文件；这是文件检查结果，无可引用行号。当前产品标记是样式化文字 J（`frontend/src/app/AppShell.tsx:101`）。因此本地尚无可直接复用的供应商品牌图集或品牌选择器。品牌 logo 的授权、来源、暗色可见性、fallback、自定义身份图标应另立契约；Lucide 操作图标继续沿用已有规范。这是规划建议，不代表已选定资源或实现。

## 可扩展位置与待决策项

建议新增独立 Provider workspace、供应商浏览/搜索、预设/自定义表单及身份图标选择器，通过共享配置表单底座组织；Shell 保留页面切换和编排职责。依据当前占位位置及现有 Settings 组成：`frontend/src/app/AppShell.tsx:240`、`:269`、`:286`。

LLM 与 decision provider 应分区，自定义入口分别保留；System One 是 decision provider 类型选择，不是 logo 分类。此需求来源于父任务 PRD 的 R5 / AC5，现有前端 API/types 尚没有对应编辑契约（`frontend/src/shared/api/client.ts:64`；`frontend/src/shared/api/types.ts:142`）。

用户已确认先展示远端发现项，搜索/勾选后显式导入并支持全选；导入成功后刷新现有策略 ModelRow 目录，不能把未导入远端项直接塞入当前规则 select。父任务 PRD 的 AC3 / AC4 已记录此流程；随后确认导入前补齐/显式确认必要元数据，并要求调查在线价格/能力查询（`frontend/src/shared/api/types.ts:38`）。发现服务策略选择需要独立类型、可用性、加载/重试/失败/手工 fallback 状态；当前规则 selection_mode 无法证明支持这些能力（`frontend/src/features/routing/RoutingEditor.tsx:393`）。

## DESIGN.md 必须保留的冲突

1. 静态 token 与运行时中性面原值不一致，dark 静态变量缺失；记录来源与应用顺序，不能在文档中合并成一套假想颜色（`frontend/src/styles/tokens.css:2`、`:18`；`frontend/src/shared/theme/palette.ts:129`、`:331`）。
2. 原生 0.4rem 圆角与共享 sm/md/lg 并存，Card lg 为 0.625rem；宽度上限与断点也按视图区分（`frontend/src/styles/index.css:13`、`:32`；`frontend/src/app/AppShell.tsx:164`；`frontend/src/features/monitoring/MonitoringView.tsx:57`）。
3. 标题 tracking-tight、监控标题负 tracking 和 viewport clamp，以及 canvas 10/11px 小字都是当前硬编码。即使与新设计约束不一致，也应列入现状，后续变更另审批（`frontend/src/app/AppShell.tsx:108`；`frontend/src/features/monitoring/components/StrategyDistribution.tsx:117`；`frontend/src/features/routing/components/CanvasNodeContent.tsx:85`）。
4. Settings write guard 的加载顺序风险与 Providers pending 状态应如实记录，不把规划中的表单当成已实现（`frontend/src/app/App.tsx:111`、`:119`；`frontend/src/app/AppShell.tsx:286`）。

## scripts 和测试

存储核对以工作区代码为准：spec 只允许固定 locale key 的 localStorage（`.trellis/spec/backend/dashboard-routing-config.md:196`、`:249`、`:456`）；实际 key 是 `jev-dashboard-locale`，在 i18n 初始化读取、切换时写入（`frontend/src/shared/i18n/index.tsx:7`、`:40`、`:53`）。凭据保持模块内存（`frontend/src/shared/api/client.ts:35`），theme seed 通过 theme GET/PUT/DELETE 保存（`frontend/src/app/hooks/useDashboardTheme.ts:49`、`:81`、`:106`），配色模式只是 React state（同文件 `:24`；`frontend/src/app/AppShell.tsx:259`），不能写成已持久化的用户偏好。上述范围没有发现代码与存储 spec 冲突；静态 token 与运行时调色板的差异仍按源码分别记录。

`frontend/package.json:6` 定义 dev=vite、build=tsc --noEmit && vite build、preview=vite preview、lint=eslint .、test=vitest run src、test:browser=先 build/测试类型检查再 Playwright。build 输出到 `jev_gateway/static`、base 为 `/dashboard/`（`frontend/vite.config.ts:8`、`:15`），规划研究不运行会写入产品静态目录的 build。

既有测试覆盖 settings 禁写/并发/401、appearance 保存重置及 1280/1430/390/320 宽度双语言双色、routing validate-review-apply/reset、画布键盘指针和 toolbar geometry、操作图标语义（`frontend/tests/browser/settings.spec.ts:4`；`frontend/tests/browser/appearance.spec.ts:7`、`:29`；`frontend/tests/browser/routing-editor.spec.ts:48`、`:88`、`:127`；`frontend/tests/browser/icons.spec.ts:5`）。本轮未运行测试，不报告测试通过。

## 供后续直接读取

- CSS/token：`frontend/src/styles/index.css`、`tokens.css`、`base.css`、`shell.css`、`appearance.css`、`routing.css`、`canvas-geometry.css`、`monitoring.css`、`virtual-list.css`；运行时主题：`frontend/src/shared/theme/palette.ts`。
- Shell/view：`frontend/src/app/App.tsx`、`AppShell.tsx`、`frontend/src/features/appearance/AppearanceView.tsx`、`frontend/src/features/routing/RoutingEditor.tsx`、`RoutingCanvas.tsx`、`ConfiguredRouteFlow.tsx`、`components/CanvasNodeContent.tsx`、`frontend/src/features/monitoring/MonitoringView.tsx`、`components/StrategyDistribution.tsx`、`components/SessionInspector.tsx`。
- 契约/控件：`frontend/src/shared/api/client.ts`、`types.ts`、`frontend/src/shared/ui/button-variants.ts`、`card.tsx`。
