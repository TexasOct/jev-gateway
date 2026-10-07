# 父任务独立集成验收计划

状态：PLAN ONLY。本文规划后续验收所需证据，本轮没有运行产品检查、测试、构建或浏览器验收，也没有给出 PASS。父验收上下文只负责 `10-05-admin-experience`，后续恢复本上下文检查实际集成结果并写父 `acceptance.md`。

## 验收依据与边界

最高需求依据是完整的根目录 `prompt.md`，本轮读取版本的 SHA-256 为 `ca26f4867b759c69f0f076eaf78ce6a509bfb7924685eff06ef733c93622cdc9`。父 PRD 的 31 条要求是索引；父子设计、实现计划或测试范围不能删减源需求。后续若发现遗漏，应记录原文位置、负责模块和补充证据，交实施方处理。

后续用户补充了前端 Provider 源码整理与全部修改完成后发布 0.1.3。父 PRD 增加 OR1、RL1，目前共 33 条；原计划及断言保留，以下补充纳入最终父验收。用户已授权提交和发布，不需要再次申请发布许可。

当前验收还须应用父 PRD 的最新布局指令：导航为 Monitoring、Strategy workflow、Suppliers、Settings；每个供应商连接下直接显示自己的模型，Edit 打开统一模型 Dialog，发现和批量导入留在该供应商下。用户已取消独立 Models 导航和额外模型详情入口要求。下方原计划中的五个导航、open-models 页面回调及第三详情入口保留为历史记录；最终 IA1、ME1、X1 和相关 U08 验收按最新供应商内联布局核对身份、字段、草稿、焦点与保存链路。

本次续接源码为 `55d71f0d74c4951ac6bad94d250bb120b8775df0` 加待验收的 Dialog Escape 修复，仓库位于 `/Users/texas/Workspace/jev-gateway`。最终报告须区分历史通过记录、本轮实际执行和仍未验证的条目；具体交付状态统一维护在 `acceptance-contexts.md`。

本轮已读：父 `prd.md`、`design.md`、`implement.md`、`research/current-state.md`、`task.json`、`check.jsonl`；五个子任务各自的 PRD、设计、执行计划、任务记录和检查清单；`.trellis/workflow.md`；backend 的 index、directory-structure、dashboard-routing-config、provider-configuration、credential-configuration、provider-identities、quality-guidelines、initialization、error-handling、logging-guidelines、cli-lifecycle；cross-layer-thinking-guide。另核对了 frontend package scripts、Vite/Playwright 配置、现有测试文件清单和 `docs/admin-experience.md`。文字按 `humanizer` 技能整理，质量检查方法参考 `trellis-check`，执行范围以本次授权为准。

本轮唯一允许写入的文件是本文。没有产品、测试、公共配置、静态资产、任务生命周期、journal、spec 或提交操作。后续验收也不替实施方修产品代码；缺陷返回实施方，修复后由原独立验收上下文复查。

## 独立验收分工

| 任务 | 独立上下文与必需报告 | 子任务负责范围 | 父验收如何使用 |
| --- | --- | --- | --- |
| `10-05-admin-settings-security` | `accept-settings`；该目录 `acceptance.md` | GS1-GS3、Settings 的 IA3-IA5 | 检查报告与复查记录；验证真实 shell 挂载、权限、轮换与导航边界 |
| `10-05-admin-workflow-canvas` | `accept-canvas`；该目录 `acceptance.md` | WF1-WF6、画布的 IA3-IA5 | 检查报告与原生手势记录；验证共享导航、配置重挂载、布局和策略边界 |
| `10-05-admin-supplier-connections` | `accept-suppliers`；该目录 `acceptance.md` | SP1-SP5、供应商的 IA2-IA5 | 检查报告与复查记录；验证模型入口、凭证变更和模型草稿联动 |
| `10-05-admin-model-contracts` | `accept-contracts`；该目录 `acceptance.md` | SP4、MI3-MI5、ME3 的后端/API 契约与兼容 | 检查真实 HTTP/事务/路由证据；追踪最终 UI 的字段映射 |
| [10-05-admin-model-workspace](../archive/2026-10/10-05-admin-model-workspace/acceptance.md) | `accept-models`；归档目录 `acceptance.md` | MI1-MI5、ME1-ME4、模型的 IA3-IA5 | 检查报告与复查记录；验证统一 Dialog、供应商上下文和整个保存链路 |
| `10-05-admin-experience` | 本父验收上下文；父目录 `acceptance.md` | IA1-IA5、DV1-DV3、所有跨子任务契约与全系统检查 | 独立阅读最终代码、运行集成检查并给父结论 |

父上下文必须与六个实施/main 上下文及五个子验收上下文分别独立。报告记录实际上下文标识和负责角色；标签本身不能证明独立性。五个子报告各自保留需求审计、命令、证据、问题、结论和复查轮次。父报告不能替代缺失的子报告，也不能把实施方自测改称独立验收。

## 后续验收就绪条件

以下条件齐备后，恢复本上下文开始最终验收；开发期间的预读与计划不产生通过结论。

1. 五个模块的任务改动已集成，实际 `App`/`AppShell` 挂载 Settings、独立模型页、供应商到模型页回调和共享离开保护。API/types/manager/Dialog 的依赖均落实，不再依赖“集成时补上”的假定。
2. 五个独立子验收报告齐备，明确验收代码版本、证据路径、结论和复查记录。每份报告最终为 PASS，已确认问题均有原上下文复查证据。若父发现问题影响某子任务，由该子上下文更新报告。
3. 主实施方交付可复核的固定集成源码快照，记录基准提交、集成差异及源码/测试/lockfile 的内容清单。未提交源码可以作为候选，但必须冻结并可辨认其字节。子报告若来自较早 worktree，应列明与最终候选的差异及受影响复查，不把旧 PASS 自动带到新代码。
4. 父和五个子验收使用独立实体目录、独立 `jev_gateway/static`、浏览器输出、构建产物、测试运行时目录和 loopback 端口。不能软链接共享可写静态输出或共享 Playwright 结果目录。快照包含新文件与当前任务应保留的既有改动，不能只复制 HEAD。
5. 安装版本、Node/npm/Python/uv、浏览器二进制及类型检查工具可用。工具缺失或权限拒绝记录为限制并交调度方处理，不以未运行代替通过。
6. 全系统检查期间停止对该快照的产品源码写入。源码发生变化就更新候选身份，重跑受影响检查；报告不能拼接不同代码版本的结果。
7. 截图、HTTP/文件状态记录与线上来源研究齐备且可读取。所有凭证采用合成值，截图、日志和公开记录没有凭证；本验收没有真实上游生成请求、部署、发布、合并或最终发布批准。

## 保存既有工作与快照隔离

本轮工作目录 HEAD 为 `8965b83fa997921482f450080fb50a97b1d17d35`。观察到的开发私有基准为 `/private/tmp/jev-admin-experience-baseline` 的 `0501e29044eeda1c5b23516bd05f667c3f4ed532`；它是开发基准，不能当作最终集成候选。

进入本轮时的五个已暂存文件和 blob 如下，供父验收复核原有 index 保留情况：

| 文件 | 已暂存 blob |
| --- | --- |
| `.trellis/spec/backend/dashboard-routing-config.md` | `d2971a8090c6132b7dd2969f804d3c1b37332b71` |
| `.trellis/workspace/TexasOct/index.md` | `7ec786e53a7de35c027855e5c80b7ec649c9864c` |
| `.trellis/workspace/TexasOct/journal-1.md` | `dd1bef30ed0322dbc69d6260a82433bf4fa7599b` |
| `frontend/src/features/providers/ProviderView.tsx` | `52a65c63834f5420715e11d390875c8489c8573e` |
| `frontend/tests/browser/select-controls.spec.ts` | `f607691e49435a0230ef4c70096b90f33d49d64b` |

`09-28-gateway-typescript-port-assessment`、`10-01-agent-auto-compaction-compatibility-research`、`10-01-auto-gateway-restart` 原路径删除与 `archive/2026-10/` 新路径同时存在，按既有归档工作保留。其他 dirty/untracked 路径包含开发进行中的 shell、locale、mock、文档及任务材料，不能因不在 HEAD 中而丢弃。

验收开始和结束分别比较主工作区路径状态、index blob 与协调方记录的基准；当前任务覆盖同一文件时对照私有基准分析新增差异。父验收不 reset、stash、checkout、add、commit、移动任务或恢复旧字节。并发实施方产生的新改动应按实际归属记录，不能归因于验收，也不能用旧状态覆盖它们。

`npm run build` 与 `test:browser` 都会清空/生成 `jev_gateway/static`；`tests/conftest.py::dashboard_bundle` 在每次 pytest 会话中重建同一目录。父快照内部按构建、浏览器、pytest、最后 freshness/package 的顺序执行，避免自己的浏览器预览与 pytest 构建互相覆盖。与子验收并行时各自快照隔离，不依靠仅换端口解决资产竞态。示例父浏览器端口为 4188，真实运行前检查占用并在记录中写明所选端口；不复用已有服务器。

## 父级直接验收矩阵

下表所有条目均为计划，证据尚未执行。必需证据中的源码入口须在最终报告补齐具体文件和行号。

| 要求 | 最终集成场景与判据 | 必需证据 |
| --- | --- | --- |
| IA1 | 五个任务目的地为监控、策略工作流、供应商、模型、通用设置。键盘和点击均切到正确内容；供应商入口携带正确选中实例到模型页。通用设置拥有网关访问/安全和现有偏好；供应商只负责上游连接/凭证；模型负责单记录；工作流负责路由。供应商和模型无网关密钥编辑器、重复提交入口或残余隐藏挂载。 | `App`/`AppShell`/navigation 的实际状态与回调追踪；五个页面 DOM/截图；供应商到模型页再返回的集成浏览器记录；对网关表单所有挂载点的审计 |
| IA2 | 中文标题、按钮、字段、状态、错误、菜单、帮助、空状态统一使用“供应商”。普通新增/编辑不要求填写内部 ID、凭证引用或品牌 ID；高级兼容入口说明用途。协议名、代码标识和品牌专名保留其必要语义。 | locale 与最终渲染文案审计；新建多连接、重命名后各页面的实际实例和模型引用记录；子供应商报告 |
| IA3 | 新页面、表单、Dialog、菜单、图标和错误采用现有配色、字阶、间距及控件样式；保持本地 SVG、CSP 和现有样式入口。DeepSeek 为无文字图形，深浅色均可辨认。主 shell/header 与各内容宽度符合已有布局约定，新模型页布局说明可复核。 | 普通/密集/错误/选中状态截图；computed geometry、文字对比度、图像加载与 CSP 记录；旧 select/provider 样式回归；子模块视觉报告 |
| IA4 | 设置、供应商、模型、工作流分别有 loading/empty/error/saving/forbidden 状态，错误解释原因和下一步。失败保存保留输入；成功写入后读取失败提供读重试。pending 阻止重复提交，旧读不能覆盖新状态。完全 clean 浏览/切页/关闭不会触发未保存或无端风险提示。 | 延迟/失败/403/409 的集成浏览器网络顺序和表单值记录；实际后端 safe errors；mutation 次数及刷新结果；每个页面状态证据 |
| IA5 | 原生键盘表单、清楚的 accessible name、可见焦点；Dialog 初始焦点、Tab/Shift+Tab、Escape/外部关闭、回到原触发元素。统一聚合 Settings、供应商、模型、工作流 dirty 状态，保留/确认丢弃、切供应商、切策略、离页行为一致。草稿返回原值后恢复 clean。窄窗口滚动区域和按钮可访问。 | 键盘实际操作和焦点目标；多模块 dirty/pending 与 clean 对照；320/390px overflow/header/Dialog/footer 几何；子模块焦点/dirty 报告 |
| DV1 | 文档逐模块说明现有问题、目标交互、布局、字段归属、必需/可选项、兼容迁移和执行依赖。源需求每项有 owner 和验收证据；英文 README 与中文镜像保留相同 heading 层级/顺序、相对链接及代码块（允许翻译注释）。API/模型/凭证文档反映最终实现。 | `docs/admin-experience.md`、相关 docs/README 对实际代码的逐项核对；source PRD audit；README parity 与链接记录 |
| DV2 | 在真实浏览器完成密钥配置、画布增删、凭证更换、批量导入、元数据失败、人工覆盖和模型整记录保存。保存主要页面、失败/dirty/unknown/manual/pending 等关键状态截图或可复核记录，并列出未验证范围。 | 后述全系统命令、跨边界场景、截图清单；每个记录含候选身份、环境、步骤、断言、结果和输出路径 |
| DV3 | 五个子任务和父任务各有独立 reviewer/context、报告和持续复查记录；任务 worktree 并发开发符合源请求。任何子 REWORK/缺报告/过期报告都阻止父 PASS。 | 实际上下文标识、开发 worktree/集成差异、五子 `acceptance.md`、缺陷修复和同上下文 recheck 记录；父自身代码审查与执行证据 |
| OR1 | 前端 Provider 按连接与凭证、模型管理、共享配置与展示职责整理；网关密钥表单归 Settings。所有应用、测试、fixture、SVG glob、JSON/license 与文档引用同步；资产字节和 API/凭证/模型身份保持兼容。 | 最终目录、移动/提取 diff、依赖与残余引用审计、lint/unit/types/build、本地资源与完整浏览器回归 |
| RL1 | 所有修改与独立验收完成后再提交并发布稳定 0.1.3。三个根版本一致，依赖锁定结果保留；隔离已提交源码通过完整 gates，标签 workflow 的同一产物通过 Ubuntu/macOS installed-wheel gates，公开产物与之逐字节一致，pinned/latest installer 均通过隔离验收。 | 发布前父验收与保护快照、签名 scoped commit/tag/SHA、workflow 与同一 artifact、四个公开资产摘要、稳定/latest 状态、安装及实际 HTTP/browser 记录。发布准备与发布后证据分开记录 |

“无端提示”不取消权限缺失、校验失败或会影响客户端的真实说明。检查 clean 场景时分别记录说明内容与触发原因，避免把必要状态信息和脏草稿警告混为一谈。

## 子需求在父候选中的逐条证据

子独立上下文负责下列需求的 verdict。父逐项核对报告及最终集成差异，并执行跨模块相关部分，不以这张表代替子任务结论。

| 要求 | 应有的子独立证据及父候选复核 |
| --- | --- |
| GS1 | 通用设置 > 访问与安全可初始化/替换；原配置迁移前后 credential 文件/引用不因页面移动改变；供应商/模型页没有编辑入口。父验证实际挂载和使用当前 manager。 |
| GS2 | 配置状态只读且已存值不回填；明确客户端到网关、网关到上游和 Dashboard 当前共享 Bearer 三种用途。若没有独立后台 key，文案不虚构一套。父检查新入口和登录页说明一致。 |
| GS3 | bootstrap 的 listener/peer/Host/Origin/forwarding 限制、当前 Bearer、revision conflict、立即生效、旧 key 失效、新 key handover 与失败重试均有证据；替换前说明客户端影响，成功明确生效时间。父执行轮换与 pending GET 联动。 |
| WF1 | 所有实际支持的可创建节点类型均有右键和显式按钮入口；枚举与最终工作流规则对应。zoom/pan/page+canvas scroll/content origin 后真实 pointer 位置正确，新节点选中并打开配置，必填缺失提示可见。子设计中规则/问题例子不能限制源要求的全部支持类型。 |
| WF2 | blank/node/edge 菜单位于可视窗口内，外部点击与 Esc 关闭；菜单操作不会启动拖动/连线。保留 native hit-test 和手势记录。父在共享 header/Drawer 遮挡条件下复核。 |
| WF3 | 节点编辑/删除入口、连线删除、Delete/Backspace、输入框/textarea/contenteditable 的文本安全；删除同步更新关联 edges、规则 slot 和 layout。入口/必要/generated 对象按现有规则禁删且说明原因；禁止任意自由图改写。 |
| WF4 | 平移、缩放、Fit、选择、普通删除撤销及 redo；复原配置、布局与选择。历史的 save/config remount 边界明确，不能把旧配置或 stale gesture 写回；重大不可逆动作按实际影响确认。 |
| WF5 | 每种节点类型显示类型、名称、关键摘要；普通/选中/不完整/失败可区分。统一 inspector 按 basic/condition/advanced 分组；JSON 与可视 draft 双向一致；解析/图校验错误定位修复目标。 |
| WF6 | 工作流名称/说明/dirty/save/校验区可读；保存、成功回读、重新打开后配置、连线和布局保留。拖动/viewport/layout 写不改 baseline、overlay、live policy 或 config-version；routing apply 仍有 validate/review/显式 apply。 |
| SP1 | 先 preset/方法，再名称/地址/所需凭证；确定默认可编辑，account endpoint 与 cloud required fields 不能绕过；高级选项有场景说明；同品牌创建两个具不同名称/地址的连接。 |
| SP2 | 新实例 ID/ref 系统生成并稳定；重命名后模型 qualified ID、策略引用、default 和关联凭证不变。环境/shared/param_env 的高级兼容保留；普通修改不回写 safe/redacted params 或更改协议。 |
| SP3 | direct credential 的 keep/replace/explicit clear；空 replacement 默认为 keep；失败留输入，成功/确认取消清空；共享引用拒绝且无修改，继承环境值存在时状态准确。父复核 credential change 与模型草稿/查询取消。 |
| SP4 | 真实 `/v1/provider-connection-test` request/type/view 链路；auth/address/network/unsupported/incomplete 分开，scope 为实际模型列表或合法的配置检查，成功不声称生成/余额可用。探测/校验/discovery 非写入，公开元数据请求不携带供应商凭证。 |
| SP5 | DeepSeek 图形无 wordmark，列表/选择器/预览/深浅色表现正确；本地资源、hash/来源/license、wheel 包装和实际 gateway CSP 下加载证据。 |
| MI1 | discovery 接自动元数据查询，搜索、visible select-all 与 batch selection 的范围/数量正确；预览可编辑单条，批量操作不强制每条开 Dialog；手工 model ID 路径可用。父复核当前选中供应商与 query target 一致。 |
| MI2 | exact match、partial/unknown、conflict、fetch failure、already imported 状态真实可辨；重复导入明确 skip 并保留模型/标签/priority/overlay；编辑已有模型走 update 操作。成功空列表、partial listing、unsupported 和失败区别保留。 |
| MI3 | input/output/适用 cache USD/M tokens、context/max output、tools/vision/json_mode/reasoning/temperature/effort 和所有现有 routing 属性完整映射；structured_output/max_input 只作对应 evidence，不错误等同 json_mode/combined context。单位、条件、渠道适用性和可选字段兼容有后端与 UI 证据。 |
| MI4 | exact serving-provider/model 或有证据 alias，不因相似名/品牌/ID-only listing 推断事实；unknown/null 与 false/zero 分开，未知价格不形成免费 route，未知 capability 不自动变支持或拒绝。不完整导入有逐字段确认/补全说明与实际后端阻断。 |
| MI5 | 字段 source IDs、来源日期/抓取日期/confirmed_at 和人工状态持久化；refresh 只更新未手工覆盖字段。restore-auto 给出差异并逐项选择，未知/失败保留已有数据可重试；重开仍保留人工优先与一致 evidence。缺失对 enable/import/routing 的影响准确。 |
| ME1 | list/import-preview/detail 三入口使用同一个 model Dialog，涵盖 basic、capabilities、limits、prices、existing routing attrs。旧模型 identity 保护或有显式安全拒绝；无独立区域保存和基础嵌套 Dialog。 |
| ME2 | auto/manual/unknown 的字段状态、支持/不支持/未知控件、source/date 可检查；价格币种/单位/适用条件一致。旧无 provenance 记录不能标为在线验证。 |
| ME3 | finite/nonnegative price、positive integer limits、范围/关系/必填/identity 校验靠近字段且后端同样执行；一个 revision-aware whole-model transaction，失败原文件和 active catalog 不变，稳定模型/策略/default 引用。 |
| ME4 | cancel 不写，失败保留所有 fields/source/selection，成功更新 list/detail/routing catalog；已提交后回读失败仅重试读取。Dialog body 滚动/footer 可达，close 后回焦，窄窗口无裁切。 |

## 跨子任务集成场景

| 编号 | 场景和执行方法 | 判据与保存记录 |
| --- | --- | --- |
| X1 | 通过五个导航目的地和供应商的 open-models 回调往返，两个同品牌实例交替选中；模型保存后回工作流查看 catalog。 | selected provider、model qualified ID 和详情一致；不重复请求/不选错实例；实际 callback/props/types 与浏览器请求记录对应。 |
| X2 | Settings gateway、supplier credential、model Dialog/import preview、workflow semantic/layout draft 各自制造 dirty，再覆盖同时存在两个 guard 的情况；依次 navigate、close、switch supplier/strategy、retry、confirm discard。 | 多个 guard 都有效，不能后注册覆盖前者或解除一个时清掉其他 guard。取消离开保留全部草稿且无写；确认按明确范围丢弃；还原原值和 successful save 后 clean 不再提示。若 browser unload 有保护，验证 dirty/clean 的差异。 |
| X3 | 延迟 validate/apply/config GET/metadata/discovery；快速切供应商、改连接地址/凭证后 refresh、发更晚请求，再释放旧结果。另覆盖保存中切页/关闭/二次提交。 | query 绑定有效 provider configuration；旧响应不回填新实例、不重开旧 Dialog、不覆盖新 draft/来源状态；pending 对动作的限制明确，无重复写和虚假成功。 |
| X4 | gateway rotation 发起后释放旧 Bearer GET 401；成功时延迟新配置 read，失败时允许正常 unauthorized 处理。 | 新 key 安装在 pending GET 处理之前，GET 至多按现有规则重试，PUT 不自动重试；旧 key 后续拒绝，新 key 可访问；权限仍为 bootstrap/current Bearer/configured-key guards。 |
| X5 | 在模型 preview/Dialog 有手工修改时进入供应商 credential change；取消/确认后测试、discovery、metadata、模型保存。 | 先保护模型草稿，接受变更后取消旧 candidate 查询并清理或重新绑定预览；未提交凭证不写/不流向公众源；keep/replace/clear 的文件与 runtime presence 一致。 |
| X6 | 确认 import/update 后模拟 catalog read 失败，随后 read retry；同时检查 default selector、模型页详情、routing editor 的新配置。 | committed mutation 只有一次，UI 不误报保存失败并重复写；重试刷新所有消费者；config hash remount 不恢复旧 history/gesture，dirty 清理只针对已保存值。 |
| X7 | baseline、overlay、credentials JSON/local dotenv、theme、layout 同时存在；改供应商名称、全模型保存、只拖节点、只改主题；校验、取消、冲突、write/activation failure。 | 每种操作只修改其所有权文件；baseline/effective tags、priority、quality、foreign strategy tags、defaults 与 references 保留；失败恢复原字节/live state，备份/恢复材料权限及 unresolved journal 语义正确。 |
| X8 | 支持/false/unknown、价格 known/zero/unknown、条件 cache price、limits null/known、manual/auto provenance 从公开源/原生 listing 经实际 API 到编辑器，再 transaction、disk/reload、routing selection。 | 所有层的值、source refs、单位和确认状态一致；不完整 suggestion 不激活；人工编辑优先；enabled=false 不被 normal/explicit/default/pinned 选择；legacy omission 行为保持。按下表留完整数据链。 |
| X9 | zoom/pan/scrolled canvas 在共享 header、expanded drawer、inspector 状态下 add/delete/undo/Fit/save/reopen；选择不同节点再切高级编辑。 | 真实 elementFromPoint 到 intended node/port；菜单未超窗，输入不误删，选中与 inspector 同步；layout 独立，回读后 graph/config/layout 一致。 |
| X10 | 中文/英文、系统 light/dark、320px/390px、普通 desktop 与 1430×2511 tall；header 换行、Dialog 滚动、错误摘要和密集画布。 | 无不可访问字段/footer/导航，无页面水平溢出；画布填充 header 后可用区域，展开 drawer 不产生第二页编辑器；焦点与点击点未被 fixed header/panel 遮挡；真实主题状态样式可辨。 |
| X11 | 未配置、配置中、configured wrong Bearer、forbidden、empty supplier/model 与 valid incomplete workflow；回到 clean 正常浏览。 | 首次进入写权限正确；theme 保留普通授权独立规则；loading/empty/error/forbidden 不混用，无 dummy model/provider 绕过规则，无 clean discard 警告。 |
| X12 | 最终生产 bundle 通过实际 gateway `/dashboard` 提供页面和供应商图标，并检查 wheel 包装。 | shell/assets/cache/CSP/privacy 规则有效；本地 DeepSeek 文件完整且无 data:/CDN；生产 JS 没有 URL/cookie/sessionStorage 密钥，仅固定 locale localStorage；资源与源码/wheel 完全对应。 |

脏草稿与凭证清理存在旧 spec 表述差异：credential guide 的“提交前清空”不符合本次 prompt 与父设计的“失败保留输入”。本任务验收按用户要求检查失败时只在组件内存保留草稿、成功或确认取消时清空，禁止持久化或响应回显；实施方需同步最终文档，不能以旧 spec 为由豁免失败留输入。

该文档差异已同步到当前 credential guide：捕获提交值后清空输入，失败恢复内存中的原值与动作；已提交后的读取失败只重试 GET。最终验收须核对实际行为和最终 spec，原有失败留输入断言继续有效。

## 元数据与人工记录的整条链路

使用固定合成供应商和模型、可复核的来源响应与本地临时 runtime。子 Contracts 和 Models 报告须给出字段矩阵；父检查实际 schema 与真实 UI/API 对应，并在集成候选上复核链路。

| 记录 | Source 到 editor | Transaction 到 routing | 必需边界 |
| --- | --- | --- | --- |
| M1 可靠精确匹配 | Models.dev/OpenRouter/LiteLLM/支持的 native 来源按实际覆盖字段取证，source provider/model/date/unit/applicability 可查看，填到同一 Dialog。 | 批量确认两个新模型；PUT 完整 runtime fields+metadata；disk/reload/safe GET 保留值；路由只用确认后的 cost/capability/limit。 | 明确实际采用的来源，不能把一个来源覆盖当作所有来源在线可用；public lookup 不携带 provider key。 |
| M2 ID-only、未知与冲突 | listing 仅 model ID；相似 suffix/version/proxy/channel、明确 false、零价格、null 与矛盾 known 分别出现；状态和输入保留区别。 | 未完成输入/能力确认的 import 被拒且文件/live model 不变；用户手工明确补全后才能启用；已知零与未知价格分开。 | 不用默认零、默认布尔值、品牌/icon 或无证据 alias 抹掉未知；缺失 limit 的显式 null 语义与现有规则一致。 |
| M3 手动覆盖再刷新 | 编辑 input price、capability、limit/cache 或其他实际字段，保存并重开；新来源给不同值，另给 unknown/失败。restore-auto 显示差异并可选/取消。 | 默认 refresh 不改 manual；明确选择恢复才提交新记录；引用、tags/priority/quality/default、未选字段与 metadata source refs 保留；cancel 不写。 | confirmed_at/source retrieval/update 各自真实；持久人工优先不能仅靠当前 Dialog touched flags；不存在“来源确认=用户手改”的误标签。 |
| M4 源失败、旧证据与乱序 | 查询失败/timeout/stale cache 与 retry；A/B provider 或新旧 lookup/discovery 交错；配置 refresh 发现地址/key 改变。 | 失败不能清掉上次有效 evidence/confirmed runtime；最新 query 绑定当前有效连接；重复 import skip；成功 apply 后 refresh 失败仅 read retry。 | UI 数值、badge、source detail 与 confirmation 必须来自同一证据版本。 |
| M5 字段与 serving 约束 | input/output/cache 值带 currency/unit/tiers/conditions；structured_output/max_input 保留 evidence；exact serving price 与 reference quote 分开。 | parse/projection/update/reload/runtime/estimate 的实际行为对应 docs；optional cache price 未知不免费；现有 input/output estimate 语义保留。 | 不混渠道价格，不把 structured output 直接推断为 json_mode、不把 input limit 当 combined context。 |
| M6 enabled 与旧目录 | 已有无新增字段/无 metadata 的模型可编辑，不伪造来源；explicit disabled 保留管理能力。 | 禁用后覆盖 normal、explicit、global default、session pin/cached selection；拒绝或使用现有可用 route，不能仍调用被禁模型。legacy omitted enabled 维持原行为。 | 实际 parser、safe snapshot、strategy、default/pin 和 UI catalog 同步；稳定 canonical ID，不能静默重命名破坏引用。 |

每条记录保留关联顺序：source 响应/权威 schema URL 与获取时间、normalized API item、editor 字段/来源状态、已选差异、transaction request/response、变更前后文件摘要、安全 GET、reload/route 结果。记录不保存真实 credentials 或真实用户请求正文。权威资料应由 Contracts 提供并在最终候选按需复核，注明来源版本/日期；线上读不到的来源明确标未在线验证，确定性 fixture 仍验证 parser/链路，不能声称外部账号或生成已通过。

## 全系统执行检查

以下命令均在固定父快照中执行，本轮未运行。命令日志和退出码写到父专用 evidence 目录；测试输出、缓存和 runtime 均与其他验收隔离。

| 次序 | 命令或检查 | 完成判据 |
| --- | --- | --- |
| G0 | 记录 `git status --porcelain=v1`、源码身份、Node/npm/Python/uv/Playwright 版本；按已有方式准备 `uv sync --all-groups` 与 `npm --prefix frontend install` | 快照与 lockfiles 一致，平台 native bindings 可用；准备引起的 lockfile 差异不默认为产品改动。 |
| G1 | `npm --prefix frontend run lint` | 完整 ESLint 通过；不得用禁用规则、删断言或 suppressions 掩盖错误。 |
| G2 | `npm --prefix frontend run test` | 全 frontend unit/structure suite 通过；查看行为断言而非只采总数。 |
| G3 | 在快照 `frontend/` 执行 `npm exec -- tsc --noEmit` 和 `npm exec -- tsc -p tests/tsconfig.json` | 应用与 browser fixture 类型一致，shared API、view callbacks、Dialog/manager contract 完整；无 any/unknown 强转绕过契约。 |
| G4 | `npm --prefix frontend run build` | TypeScript/Vite 构建通过；base=/dashboard/、本地资源实际输出，generated bundle 仅在快照中。 |
| G5 | 启动两个独占合成凭证网关，设置 `JEV_CREDENTIAL_LIVE_URL/HOME`、`JEV_CREDENTIAL_DEFAULT_URL/HOME`，在父专用端口运行完整 Playwright suite；记录实际 inventory、命令与隔离输出目录 | 完整 inventory 全部执行且通过，zero skips/retries；两个真实凭证 suite 均执行。沿用 forbidOnly、no server reuse，覆盖 monitoring/connection/appearance/select/canvas/provider 回归并验证进程清理。不能用不带凭证环境的默认跳过执行作为 full PASS。 |
| G6 | 补充全系统浏览器执行 X1-X12、M1-M6、截图/几何/keyboard/native gestures；使用已有测试或可复核手动记录 | 满足上表断言；自动滚动不能掩盖按钮原本在 header/overlay 下不可见的缺陷；无 fake pointer 代替原生手势。若需新增测试由实施方在所属范围补充后再验。 |
| G7 | `uv run pytest -q` | 完整后端测试通过，包括 ASGI、real files/locks/rollback、catalog、metadata/discovery、gateway guards、routing/default/pins、credentials/setup、release/assets；查看新增 contract 与实际代码。测试使用 mock upstream，不生成真实请求。 |
| G8 | `uvx pyright` | `jev_gateway` 与 `tests` 按 Python 3.12 配置全量通过；不能用空诊断缓存代替执行。 |
| G9 | pytest 的 bundle 构建结束后 `scripts/build-frontend.sh --check`；记录 source/index/asset hashes，运行 `uv build` | bundle 是本候选生成且 freshness 通过；wheel/sdist 含 dashboard index、所有 referenced assets、本地图标/许可证/模板/入口点，不跟踪 generated output。 |
| G10 | 按当前 `pyproject.toml` 版本运行 `python3 scripts/validate-release.py <matching-tag> <isolated-dist>`，检查 `tests/test_release_validation.py` 和 source/wheel 文件字节；实际 gateway HTTP shell/CSP/cache/image 检查 | dist 恰含本次产物，tag 与 package 版本一致；exact asset parity、AGPL SPDX/LICENSE、入口点及模板正确。此为本地检查，不发布 release。 |
| G11 | 按 README/docs 的契约运行临时 home 的本地安装轮子检查；适用时复用 `scripts/smoke-installed-release.py --wheel <absolute-wheel> --work-dir <absolute-isolated-workdir> --version <actual-version>` | 安装资源与实际 HTTP 页面/CSP 一致，合成 JSON-only credential/setup/reconnect 保留；只控制该测试拥有的进程，不访问或修改操作员 home。平台/工具限制明示。 |
| G12 | source audit、README mirror parity、five child report/recheck audit、主工作区/index/path preservation 对比 | 33 条与 prompt 所有细项都关联证据；无子失败、缺口、旧版本证据混用；既有工作保留。 |

G3 的两个 tsc 检查也由当前 `build`/`test:browser` 脚本覆盖，实际报告可引用对应完整命令日志，不必重复运行。G10/G11 不带版本更新、发布、操作员安装替换或源仓库生命周期操作。完成必要检查后，只因新改动、失败或未解风险而扩大/重复测试。

重点阅读入口包括 `frontend/src/app/`、`shared/navigation/`、`shared/api/types.ts`/`client.ts`、settings access component、ProviderView、ModelManagementView/ProviderModels/ModelFields/model helpers、useProviderManagement、shared Dialog、routing editor/canvas/model helpers；后端为 catalog/provider_config/model_metadata/discovery/gateway 及相关 strategy/default/pin selection 路径。实际检查记录具体文件、行号、行为和测试名，不只复述开发总结。

## 浏览器画面与可复核记录

| 画面/状态 | 必需记录 |
| --- | --- |
| 五个目的地与 header | 中文普通 desktop；320/390px 两语言导航可见/无溢出；系统深浅色各一组核心画面 |
| Settings 访问与安全 | 未配置、已配置、初始化/轮换成功、失败保留、pending、forbidden；密钥草稿不出现在截图中 |
| 供应商连接 | preset/custom/cloud 普通与高级、两个同品牌连接、凭证 keep/replace/clear、auth/address/network/unsupported test、DeepSeek 两主题 |
| 模型 workspace/import preview | search/batch、complete/partial/conflict/failed/already imported、unknown 与 manual source detail、失败重试 |
| 统一模型 Dialog | list/preview/detail 入口复用、分区、字段错误、manual refresh/restore diff、dirty cancel、保存失败/成功与 subsequent read failure；narrow body/footer/focus |
| 策略工作流 | blank/node/edge menus、add-at-pointer、selected/incomplete/error inspector、删除/undo/redo、JSON error定位、save/reopen；zoom/pan/scroll/native hit-test |
| 跨页 dirty 与 clean | keep/confirm discard 对照、多个 dirty guards、clean 无提示、pending 期间行为、返回可见触发点 |
| 实际 gateway bundled page | `/dashboard`、asset/CSP/cache、安全响应、icon load；与 Vite synthetic fixture 截图分别标注 |

画布覆盖普通 desktop、1430×2511、390px/320px、两语言/两主题，包含 expanded drawer、wrapped header、密集 Unicode 节点和 inspector occlusion。表单/Dialog 覆盖普通 desktop 与 320/390px；长内容使 body 真正滚动后验证 footer 和焦点。每条主要流程有截图或能复核的 step/network/DOM/focus/geometry 记录，关键视觉状态保留 PNG 并由验收者实际检查。截图应通过 per-test output path 或父专用 evidence 路径保存，不能复用开发者固定文件覆盖其他报告。

## 证据格式、缺陷与最终结论

最终父证据目录按候选身份和运行轮次组织，含 manifest、commands、browser records/screenshots、API/transaction/route records、child-report references、requirements audit 和 rechecks。manifest 记录 source/baseline hashes、任务差异、环境、端口、时间、实际命令、退出码及所用 fixture/runtime 范围。每行需求填写代码位置、可复现步骤、测试/记录路径、观察结果和缺口。

证据必须区分：源码审查、pure helper/unit、synthetic API browser、真实 ASGI/文件事务、本地真实 HTTP 与 installed wheel、只读 public source。Vite fixture 不证明 HTTP 权限/磁盘事务，后端测试不证明 pointer/focus/布局；截图不单独证明保存，测试通过不证明真实外部生成、余额或部署。没有运行或工具不可用的项明确标明，不写成历史失败，除非有可重复的基准证据。

缺陷记录 requirement ID、复现、期望/实测、候选、日志/截图、负责实施方和影响范围，区分产品缺陷、测试错误、环境限制和已证实基准问题。测试失败不能通过删断言、skip、随意加超时或过度 mock 处理。修复后父在本上下文检查真实 diff，相关子上下文完成自己的 recheck；更新候选并重跑受影响检查，需要时重跑 full gates。

最终父 `acceptance.md` 只在上述就绪条件和实际验收后产出，结论为 PASS 或 REWORK。PASS 要求五个独立子报告有效且通过、父直接矩阵/全系统检查通过、源需求完整、证据可复核、没有确认缺陷或必需项未验证。任一缺失/失败/过期报告/必需环境阻塞均给 REWORK，明确责任与所需复查；可保留子报告原有 BLOCKED_DECISION 状态并解释其对父结论的影响。父结论是集成验收，发布批准仍由用户或发布负责人负责。
