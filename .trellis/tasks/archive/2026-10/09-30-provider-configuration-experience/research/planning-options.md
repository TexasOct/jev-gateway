# 初版规划与待收敛边界

## 状态

父任务及四个子任务保持 `planning`。本文件记录基于证据的技术建议和执行顺序，不代表已通过最终方案审核。用户已确认 A：自动发现后搜索/勾选导入，支持全选；随后确认方案 1：新模型导入前补齐或显式确认必要价格与能力元数据，并要求调查在线查询数据源。技术方案和 `implement.md` 仍需收敛并审核。

## 已确认的现状

1. `models.json` 是统一静态配置底座，CLI 可写 provider 和模型；gateway 的现有 HTTP 配置写入仅作用于 routing overlay。其“不写 baseline”的约束不能通过给 overlay 塞入 provider 字段绕过。
2. 现有 LLM 预设是 OpenAI、Anthropic、DeepSeek 和 custom。`type` 表示 LiteLLM transport，provider `id` 表示用户实例。
3. Decision provider 已独立存于 `decision.providers[]`，目前注册 `system_one`，`api_base` 是完整评估 endpoint，`model` 可以省略。
4. Provider 页面只是占位。现有 provider 观察表是历史/运行观测，不是配置管理或连接健康证明。
5. `/v1/models` 只列出本地策略与已配置模型。前后端都没有上游发现/导入接口。
6. Lucide 已承担操作图标，但没有品牌资产图集。根目录 `DESIGN.md` 已在本轮提炼，当前事实和未实现扩展明确分开。

证据入口：`config-and-model-discovery.md`、`dashboard-provider-design-baseline.md`、`related-task-boundaries.md` 和 `cc-switch-and-upstream-references.md`，均位于本目录。

## 建议的配置边界

- 保留规范配置中的 `providers[]` 与 `decision.providers[]`，不强行合并两种执行语义。上层使用共同的 Provider 编辑模型与校验/提交服务。
- 将稳定实例 ID、展示名称、供应商品牌、图标资产 ID、LLM transport/decision protocol 分开。建议两种 provider 都添加可选展示字段，旧文档缺省时回退到实例 ID 与中性图标；字段名和具体 schema 在最终技术设计中定稿。
- 预设 registry 是录入模板，由现有 CLI 预设扩展并供 UI 消费，避免前后端复制两套 endpoint/类型默认值。模板不能覆盖用户已经修改的字段，品牌 logo 不能推断 transport。
- Provider 自定义沿用已有 transport registry 与 decision protocol registry。System One 必须出现在 decision 类型选择器，未实现协议不能通过输入品牌名变成可用类型。
- 展示字段不得改变现有 `ProviderProfile.name` 的稳定 ID 语义；保留 `provider/upstream_model`，UI 另显示名称和品牌。

## 建议的配置管理接口职责

当前需要新增一条目录管理边界。以下是职责草案，尚未批准路由名称或写入协议：

| 职责 | 输入/输出重点 | 安全与一致性 |
| --- | --- | --- |
| 读取管理目录 | 两类 provider、受支持类型、预设、展示字段、模型与写可用性 | 仅返回 secret reference/presence，revision 不能包含 secret |
| 校验配置候选 | 明确的新增/修改/删除操作与 expected revision | 校验完整候选、模型/策略/overlay 引用，不改变磁盘或活动目录 |
| 保存 provider / 导入模型 | 规范字段、已选择模型和明确凭证动作 | 共享 mutation 服务，跨进程锁或条件写，事务与回滚契约 |
| 凭证操作 | keep/set/clear 独立动作，secret 只在写请求体传入 | 禁止回读 key、URL key、浏览器持久化与进程级临时环境替换 |
| 上游发现 | 已保存 provider ID；首次表单可评估使用仅内存的候选配置 | 无目录写入；只返回规范模型与安全 metadata，限制网络请求 |

推荐继续让 `models.json` 承担静态 provider/model 存储，凭证值沿用受保护的 `.env`，策略仍使用 `routing-overrides.json`。这会新增经过授权的 HTTP baseline mutation，必须在本任务最终审核中明确批准，并更新现有 dashboard/CLI spec；旧 routing configuration API 的 baseline 不变约束保持不动。

不能直接从 HTTP 调用目前 CLI 的 `add_provider`：它为验证临时替换 `os.environ`，在并发 gateway 中不安全，而且 `.env` 与 catalog 写入不是事务。应抽取无全局环境副作用的共用服务；失败不能留下半份凭证/配置，也不能替换正在使用的有效目录。

没有 key 或模型的初始表单先保持 UI 草稿；仅在候选符合现有 catalog invariants 后提交。不为简化向导偷偷放宽非空 catalog、凭证或策略验证。完全空配置的 gateway 启动/无鉴权 bootstrap 不在本轮默认范围。

## 建议的发现边界

- 优先覆盖现有预设所需的发现路径：OpenAI-compatible、native Anthropic 与 DeepSeek；其他当前 transport 必须明确 supported/unsupported。OpenAI/Anthropic 的官方列表与认证文档已取证，DeepSeek 的本轮页面提取只返回片段，完整契约仍需在实现前核实。Gemini 等后续支持以注册适配器和官方协议为前提，不把整个 LiteLLM provider_list 标为支持模型发现。
- 发现 registry 独立于 chat history adapter，使用 provider type/显式能力选择协议，服务端解析凭证。Decision System One 默认保留手填模型，不对其完整 POST endpoint 盲拼 `/models`。
- 原始上游模型名原样保存，以 provider ID 生成 qualified ID。分页、去重、响应体大小、超时与结果完整性都要有边界。
- 凭证放 header；禁止携带凭证跨 origin 重定向，不记录原始上游异常或响应。内网/localhost 的支持需保留现有自定义 endpoint 用途，同时明确 gateway-key 授权、危险目标与 DNS/redirect 防护；实施前在技术设计中写出精确规则。
- 缓存随 endpoint、类型、配置 revision 与凭证变化失效。缓存不是运行时配置来源，无法请求时展示过期/不可用状态，不认证当前连接健康。
- 发现不能普遍证明 capabilities、context、cost 或 quality。当前 catalog 默认 tools/vision/json_mode 为 true、价格为 0；用户已确认新模型导入前补齐/显式确认必要元数据，且不改变旧配置已约定的默认语义。在线查询用于预填，需要区分模型规格与实际服务商的价格/限制。

## 浏览和表单流程建议

```text
Provider workspace
  LLM providers / Decision providers
  已配置实例列表 + 搜索 + 添加

添加
  供应商品牌浏览 + 名称/别名搜索 + 自定义
  基础配置与身份图标
  LLM: 受支持类型 + endpoint + 凭证动作
  Decision: System One 类型 + 完整 endpoint + 可选 model
  模型发现 / 搜索选择 / 手动添加
  校验候选 + 保存结果

策略配置
  从已确认的有效模型目录选择 provider-qualified 模型
  继续使用既有 validate / review / apply
```

浏览页面使用现有中性 token、紧凑布局和官方 logo，搜索结果也保留品牌身份。基本表单和高级选项共用规范映射。取消/返回、错误认证、禁写、空结果、失败重试、旧请求竞态和窄屏键盘状态都要有独立可验收行为。

官方网站 logo 需要逐项来源/品牌说明。当前只核实了来源入口和未完成项，不宣称已经收齐供应商品牌资源。官方资产不可得时，不用仿制图标冒充；先保留自定义中性回退并明确覆盖缺口。

## 模型导入产品决策

| 选项 | 用户流程 | 代价 |
| --- | --- | --- |
| A，用户已确认 | 自动发现上游列表，搜索/勾选模型后显式导入；可全选批量提交 | 多一步确认，但可以校验未知 metadata，控制目录规模及路由候选 |
| B，未采用 | 自动发现后全部加入有效模型目录 | 操作少，但会增加大量非对话/未校验模型，必须额外解决能力默认值、成本排序、失效模型与刷新规则 |

选定流程保留手动添加、重复去重以及不删除已有模型/策略的刷新行为。发现、刷新与取消只读；显式导入只处理用户选中的模型。全选需要清楚显示范围和数量，不代表后续新发现的模型也会自动加入。

## 新模型未知元数据的确认规则

源码核对确认 `ModelCost` 的输入/输出价格默认 `0.0`，`ModelCapabilities` 的 tools/vision/json_mode 默认 true；`cheapest_adequate` / `balanced` 排序实际使用这些成本（`jev_gateway/catalog.py:86`、`:102`；`jev_gateway/strategy/policy.py:392`）。勾选导入本身不能解决错误默认值。

用户已确认新模型导入前补齐或显式确认必要路由元数据，可信来源可预填，重复配置支持批量设置。未知价格不能认证为免费，未知能力不能认证为已支持；此项已纳入父/子 PRD，尚未进入产品实现。

用户进一步要求寻找可在线查询的数据源。后续研究需验证 provider/model 的精确匹配、价格单位、能力字段含义、数据更新方式和服务商差异；获取成功不代表数据与实际账户计费完全一致。最终来源与缓存契约写入技术设计。

用户允许为实现便捷优化模型存储结构。具体方案应分开模型规格、提供方服务配置、报价和用户确认值，让新数据能记录来源、适用范围及状态；保留统一配置来源、旧目录兼容、稳定模型 ID 和迁移回滚。此授权允许调整结构，具体 schema 尚待最终方案审核。

在线来源调查保存于 `model-metadata-sources.md`：Models.dev 可作跨厂商预填来源，实际 provider 的原生元数据与 OpenRouter serving 信息按对应关系优先；LiteLLM 本地成本表作备用。已核实价格单位差异、Models.dev 每小时适配器同步的覆盖限制、last_updated 不代表核验时间，以及 OpenRouter 公共 GET 的缓存与认证观察。在线查询/刷新仍不直接覆盖确认值或路由目录。

当前策略在候选不足时会放宽能力条件，未知上下文上限视作无界（`jev_gateway/strategy/policy.py:365`、`:430`）。仅将未知能力写成 false 或不赋标签不能充当模型隔离机制；本任务仍不改路由算法。旧配置默认语义保持原样。

## 初版执行顺序

1. 选中导入流程和导入前元数据要求已确认；调查在线数据源，收敛父任务 PRD，各复杂子任务补齐并审核技术设计与实施计划。
2. 配置契约子任务先完成规范字段、凭证解析与配置 mutation 服务、条件写/回滚测试。新增管理写边界必须单独更新 spec。
3. 模型发现子任务实现注册适配器、规范结果、安全限制与经确认的导入流程，mock 不同协议、未知 metadata 与冲突。
4. 界面子任务在已有 Provider 入口实现供应商目录、浏览搜索、官方资源、预设/自定义表单与模型选择。复用 Settings 和图标工作，不平行造另一套 provider 页面。
5. 设计文档子任务核对根目录 `DESIGN.md`，在新 UI 完成后才把相应计划项改为现状。
6. 父任务做跨任务验收：首次添加、重载、CLI/HTTP 一致性、策略选择、凭证隔离、旧配置兼容与双语/窄屏交互。

计划中的验证命令：

```bash
python3 ./.trellis/scripts/task.py validate .trellis/tasks/09-30-provider-configuration-experience
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
npm --prefix frontend run test:browser
uv run pytest -q
uvx pyright
uv build
scripts/build-frontend.sh --check
```

这些产品测试和构建本轮未运行。root `DESIGN.md` 的源码核对与任务 artifact validation 属于本轮规划检查，不代表产品实现通过验收。

## 既有任务与回滚

既有 `09-30-unified-provider-management-ui` 仍为 planning，本次用一个增量方案承接交叠需求，未标记旧任务被替代或完成；是否合并任务记录留到负责人明确操作。设置、操作图标和视觉任务的 owner 文件边界见 `related-task-boundaries.md`。

当前所有产品改动均在本轮之外，因此规划撤回只涉及新任务与新文档。后续实现必须按子任务分段验证，并在目录/凭证/overlay/runtime 激活失败时恢复旧有效状态。不能在共享 dirty worktree 通过全仓 reset 或覆盖用户改动回滚。
