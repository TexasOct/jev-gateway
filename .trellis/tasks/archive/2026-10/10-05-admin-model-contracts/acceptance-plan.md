# 模型契约独立验收计划

本文件是 `10-05-admin-model-contracts` 的第一轮验收计划。集成尚在进行，本轮仅阅读需求、规范和现有验证设施，并写入本文件。所有执行项均为待验证；没有运行测试，也没有对当前代码作出 PASS 判断。

验收负责人为独立 `accept-contracts` 上下文，与 `admin-contracts` 实现上下文分开。父任务在集成快照就绪后恢复本上下文，由本上下文执行验证并写入子任务 `acceptance.md`，给出 PASS 或 REWORK。实现方总结和自测日志可帮助定位文件，不能替代独立验收证据。

## 依据与范围

已读取以下材料：

- `/Users/texas/.pi/agent/skills/humanizer/SKILL.md`，按 embedded mode 校订本计划及后续报告文案。
- 根目录 `prompt.md`、`.trellis/workflow.md`。
- 父任务 `10-05-admin-experience` 的 `prd.md`、`design.md`、`implement.md`、`task.json`、`check.jsonl` 和 `research/current-state.md`。
- 本子任务的 `prd.md`、`design.md`、`implement.md`、`task.json`、`implement.jsonl` 和 `check.jsonl`。本轮文件清单中没有子任务独立的 `research/`；后续集成时重新检查新增研究资料。
- `.trellis/spec/backend/` 的全部指南：`index.md`、`directory-structure.md`、`quality-guidelines.md`、`provider-configuration.md`、`credential-configuration.md`、`provider-identities.md`、`dashboard-routing-config.md`、`initialization.md`、`error-handling.md`、`logging-guidelines.md`、`decision-providers.md`、`database-guidelines.md`、`cli-lifecycle.md`，以及跨层思考指南。

本任务负责 SP4、MI3、MI4、MI5、ME3 的后端/API 部分及其兼容、授权、隐私约束。供应商操作界面、模型 Dialog 和父级导航由对应独立验收上下文负责。本上下文仍核对真实 API 与这些界面的数据契约，并验证实际 UI 提交的模型记录不会损坏服务器状态。

已检查的现有设施包括 `ProviderConfiguration.command/project/discovery_provider`、`metadata_envelope`、catalog 模型及元数据解析、gateway 管理路由、`config_transaction.py`、模型发现和固定源元数据服务、`RoutingEngine.decide/preview`、策略选池/默认/固定会话路径、共享 TypeScript API 类型和客户端。测试参考为 `tests/test_provider_config*.py`、`test_provider_management_api.py`、`test_model_metadata.py`、`test_model_discovery.py`、`test_discovery_network.py`、`test_global_defaults.py`、`tests/conftest.py` 与 `tests/helpers.py`。这些读取用于设计验证，不证明集成版本符合要求。

## 集成后恢复与隔离

1. 父任务提供可复核的集成快照。记录 commit、任务相关差异、未提交补丁或快照归档 SHA256、规范和研究版本。仅有 `HEAD` 不能标识包含未提交集成改动的版本。
2. 验收前重新读取根需求、父子任务材料、新增研究与实际集成差异。对照本矩阵检查实现、文档、测试和消费者；不得根据实现方的完成声明勾选验收项。
3. QA 使用独立 checkout/worktree 或完整隔离副本。集成若尚未提交，父任务将确定的补丁/源文件快照复制进去；验收期间不从开发目录持续同步文件。记录源文件清单与哈希。
4. QA 独占自己的 `.venv`、`node_modules`、`jev_gateway/static/`、构建 `dist/`、测试报告和临时 runtime。不得共享开发 checkout 的 `.venv` 或将 `static/` 链接到其他代理输出目录。
5. 在 QA 中以任务专用变量设置 `JEV_GATEWAY_HOME`、`UV_PROJECT_ENVIRONMENT`、需要隔离的 uv 缓存/工具目录；不得重新定义 `HOME` 或 `CODEX_HOME`。每个 ASGI/运行时场景再用独立临时目录、显式 `models_file` 和合成凭证映射。记录解析后的绝对路径，注意 macOS `/tmp` 与 `/private/tmp` 的关系。
6. pytest collection 会导入 gateway。保持 `tests/conftest.py::pytest_configure` 在 collection 前准备的独立 runtime；不能读取操作者目录或根目录忽略的 `models.json`。所有单独 Python 探针先建立同样隔离，再导入 gateway。
7. `dashboard_bundle` session fixture 会执行 `npm --prefix frontend run build`。完整 pytest、浏览器脚本、bundle 检查和打包会写同一个 QA `static/`，在单一 QA checkout 内顺序执行。若并行跑浏览器，另用完整独立 checkout/build，并标识同一源快照。
8. 浏览器占用独立已确认空闲的 loopback 端口，使用 `JEV_BROWSER_PORT`，保留 `--strictPort` 和 `reuseExistingServer: false`。产物目录按本任务/本轮次命名。不得接管已有服务。
9. 所有上游和公共元数据自动化测试使用 fixture、注入 fetch/时钟/DNS/连接或受控 loopback 服务。对 generation 与 decision transport 设置调用计数或禁止调用桩。真实公网 generation 不在本任务授权或验收范围内。
10. QA 中确有必要的补充测试/探针由本上下文管理并保留可复现代码、命令和输出。共享测试文件需先确认归属；产品缺陷交实现方修复。修复后恢复本上下文，在新快照重验受影响矩阵和必要全量检查。

## 统一证据与不变状态

每条矩阵记录请求/fixture、预期、实际、测试 node ID 或探针位置、日志路径、快照标识。API 使用真实 `gateway.create_app` 与 `httpx.ASGITransport`，沿用 `asyncio.run()` 请求方式；只 mock 外部依赖或精确故障点，不 mock 被验收的事务、路由或 HTTP 返回值。

文件断言保存存在状态、完整字节和需要保护的权限，至少覆盖：`models.json`、`models.json.bak`、`routing-overrides.json`、`.env`、`.env.backup`、`credentials.json`、`credentials.json.backup`、`.provider-configuration.recovery`、`dashboard-theme.json`、`routing-canvas-layout.json`。不能把原本不存在与空文件视为相同。合作锁文件可存在；其创建不代表配置变更。

运行时断言覆盖 `engine.catalog`、策略 registry、gateway/auth 设置、配置来源、policy/routing snapshot、config hash、session/pin 状态、记录库 config-version 集合，以及 generation/decision/发现/公共源调用计数。只读管理请求与 validate 不激活或注册候选配置；chat 验证可能生成请求证据，需单独测量窗口。

失败、validate、发现、元数据查询、连接测试与取消路径，均检查相关文件字节、活动状态和进程环境不变。成功模型写入只允许目标 baseline 模型记录、其规定备份和正常配置激活证据变化。单独的模型更新不应修改凭证、overlay、主题或布局。

使用互不相同的合成 gateway/provider/transport 密钥和 hostile 异常文本作为隐私探针。断言这些值不出现在安全响应、警告、元数据 envelope、baseline、overlay、普通模型投影、配置版本/SQLite 管理证据、Dashboard、日志或错误中。受保护 credential 文件及故障恢复材料只检查合成值和权限，不将真实秘密写入报告。任何未经校验的上游异常正文不得被公开。

## 跨层契约矩阵

| 编号 | 需求 | 数据流与实际断言 |
| --- | --- | --- |
| X1 | ME3 | UI 完整草稿经共享 `ProviderMutation` 发到 validate/PUT，操作为 `{action: "update_model", model_id: "provider/upstream_model", model: ImportModel}`，外层为 `{expected_revision, operations}`。检验实际发送请求、gateway、配置 owner、catalog、磁盘、reload 和重新读取的同一字段值；没有分区独立保存或部分字段静默丢失。 |
| X2 | MI3 / 兼容 | `display_name: string|null`、`enabled: boolean`、`cost.cache_read_per_million`、`cost.cache_write_per_million` 贯穿 ImportModel、ProviderModelView、Python profile/cost、读/写/validate 投影、磁盘、routing snapshot 与 runtime。旧记录省略 enabled 等价于 true；显示名不参与 canonical identity；缓存缺失/null 不变成 0。 |
| X3 | MI3-MI5 | suggestion `fields` 为扁平 `input_per_million`、`output_per_million`、缓存两项、五项 capability、`reasoning_effort`、两个 limit。写入时分别映射 `cost.*`、`capabilities.*`、顶层 limit。查询对象不能直接作为 ImportModel。校验字段清单在 Python metadata owner、共享 TS 和 UI draft helpers 一致。 |
| X4 | MI4 / MI5 | 发现保留 `{upstream_model, qualified_id, imported, metadata, metadata_envelope}`；元数据查询项为 `{upstream_model, fields, sources, warnings, metadata}`，外层包含检索时间/stale。源候选的 `source_provider/source_model` 规范化为 envelope 的 `provider_id/model_id`，保留 source IDs、单位、时间、适用性和条件。 |
| X5 | SP4 | `POST /v1/provider-connection-test` 接受现有 LLM `ProviderSelector`：仅一个 `provider_id` 或 `provider`，可选 `credential: keep/set/clear`。响应字段为 `{provider_id, status, scope: "model_listing", model_count, warnings}`；status 严格为 `success|authentication_error|address_error|network_error|unsupported|incomplete`。TS/client、真实 ASGI、供应商消费者与文档对齐。 |
| X6 | ME3 / MI5 | `ProviderCommandResult` 保留安全配置快照及 `{valid, applied, imported, skipped, revision}`。validate 返回原 revision 且 applied=false；成功 PUT 返回 applied=true 和当前 revision。无凭证值。客户端收到 409 或保存失败不能视为成功；提交已成功、后续读取失败时，读取重试不能重复提交写入。 |
| X7 | DV1 / 兼容 | `docs/models-config.md`、`docs/http-api.md` 和 owning specs 描述新增字段、禁用行为、whole-record/revision、缓存估算边界、源时间、未知和测试 scope。对新增公共契约逐项比较文档/类型/HTTP/持久化；不能用仅更新 TS 类型代替后端实现。 |

## 模型事务验收矩阵

| 编号 | 需求 | 场景与断言 |
| --- | --- | --- |
| T1 | ME3 | 单次 update_model 同时修改显示名、启用状态、价格/缓存、能力、限制、合法路由属性和 metadata。validate 返回正确候选但所有文件、当前 catalog/registry/hash/auth/session 不变。PUT 后目标记录完整更新，重新 GET、构建新 engine 和 `/v1/routing/reload` 得到相同值；其他模型/供应商/默认/策略记录不变。 |
| T2 | ME3 / 兼容 | model_id 使用含斜杠 upstream 的 `test-provider/vendor/only`。不同显示名、中文名、null/省略显示名不改 provider ID、upstream 或 qualified ID；模型/标签显式列表、defaults、session route、layout model IDs 等引用保留。拒绝通过修改 provider/upstream、提交独立 `id/name`、裸 upstream、缺失/未知 canonical ID、空白 ID 来改名或新增模型。未知操作/字段返回 400，零写入。 |
| T3 | ME3 / 兼容 | baseline tags 如 `["task_aware/base", "quality/keep"]`、priority=23；overlay 使用同一模型不同 tags 和 priority=7。用真实 UI 实际提交的有效模型记录编辑价格/能力，断言未编辑的 baseline membership/priority 仍为原值，overlay 字节完全不变，GET/活动 engine 仍使用原有效 overlay membership/priority。防止有效投影被误写回 baseline。 |
| T4 | ME3 / 兼容 | 无 overlay、有 overlay、多次顺序编辑、显式编辑允许的 baseline tags/priority、取消后再次保存。foreign-strategy tags、默认模型和 overlay 引用不丢失；操作边界仍是 baseline 事务，不能把 display/enabled/cost/metadata 塞进 overlay 或重写其 membership。若 UI 不允许编辑 membership，直接 API 的允许/拒绝行为仍须与文档一致。 |
| T5 | ME3 | stale revision 在 validate 和 PUT 均为 409 `revision_conflict`。分别只改 baseline、overlay、dotenv、credential JSON 使旧 token 失效；两名合作写者同 revision 仅一名成功，另一名不覆盖。prepare 期间非合作磁盘改动被第二次 revision 检查拒绝。重启导致旧 token 无效。token 不暴露原始凭证 digest。 |
| T6 | ME3 | 一个 operations 列表含合法 update 后的非法模型更新/导入/默认引用，以及含凭证 SET 的混合事务。后一个操作失败时整个列表拒绝，没有前一项部分落盘/激活、没有 secret-store 变更或候选配置版本。可用完整事务原子调整 default 再禁用相关模型。 |
| T7 | ME3 | baseline 合法但 overlay 非法、baseline 非法、registry prepare 失败、storage 设置需要重启。所有场景在写前拒绝，活动 catalog 保持健康；不能只验证其中一份 catalog。prepare/activate 接收到的是已经合并且凭证一致的 candidate。 |
| T8 | ME3 / 兼容 | 在 `config_transaction.atomic_bytes` 的 baseline replacement、backup replacement 等实际步骤注入一次故障，并在 `engine.reload_catalog` 激活失败/激活后抛错处注入故障。HTTP 500 `provider_configuration_failed`，旧文件及原本不存在状态恢复，旧 catalog/registry/source/gateway key/hash 恢复。恢复成功清除 journal，恢复失败保留 mode 0600 journal 并阻止后续磁盘读/写/probe/reload。 |
| T9 | ME3 / SP4 | 用事件同步检验 reload-lock 后 file-lock 的顺序、合作 CLI 写者与模型 PUT/read/probe。读者等待完整事务后读一致 endpoint/credential/model；不能看到中间状态、误报正常 journal 为故障，或用旧 reload preparation 覆盖较新模型写入。恢复失败时已有健康内存 chat 仍独立可用。 |
| T10 | MI5 | 已导入 qualified ID 再次导入返回 skipped，不产生第二条、不覆盖人工 metadata、价格、tags、priority 或 overlay；同批次重复同一 ID、同 upstream 不同供应商均按 canonical ID 判定。只有显式 update_model 改已有记录。 |
| T11 | ME3 / 隐私 | 模型 update 禁止连接字段 `api_key/api_key_env/api_base`、未知嵌套 cost/capabilities/metadata 字段及 redacted 参数回写。安全投影/hostile 输入错误不回显合成秘密；模型写入不触碰 credentials/.env 或进程 `os.environ`。 |
| T12 | ME3 / 授权 | validate、PUT、discovery、metadata、connection-test 均检查已配置 Bearer：缺失/错误为 401 `invalid_api_key`；未配置网关 key 时相应管理 POST/PUT 为 403 `config_writes_disabled`，允许的匿名读仍保留。无外部调用、文件/活动状态不变；合法形状和畸形 body 各测授权顺序。 |

## 字段、数值与禁用路由验收矩阵

| 编号 | 需求 | 场景与断言 |
| --- | --- | --- |
| F1 | MI3 / 兼容 | 旧记录没有新增 display/enabled/cache/metadata 时保持原合法值和路由行为；不制造来源/确认时间。显式 enabled=true 与省略一致，false 在配置读中可管理。非法 enabled（null、0、1、"false"、数组）拒绝。显示名类型、长度、空白/控制字符按公开边界验证，null 清除可回读。 |
| F2 | MI3 / ME3 | input/output 是必需的严格 JSON number、有限且 >=0；合法 0 与缺失/null 分开。拒绝负数、布尔、数字字符串、NaN、±Infinity、溢出、对象。缓存两项可省略或 null，合法 0、正数在 parse/project/persist/reload 后保留；拒绝同类非法值和未知 cost key。不能通过 `or 0` 消掉未知。 |
| F3 | ME3 | context/output limit 必须显式为正 JSON 整数或确认 null。测 1、相等边界、大的合法值、output<context、output>context、0、负数、分数、布尔、字符串、缺失；两个都已知时 output<=context。分别 null 时按记录的未确认/确认规则处理，不把 null 当已知容量，也不新发明总上下文数据。失败在 API owner 拒绝，文件/runtime 不变。 |
| F4 | ME3 / 兼容 | priority 必须是公开契约允许的整数，拒绝 bool、分数、字符串；quality 必须有限，并测试最终公开约定的范围和边界。原参考文档未承诺 quality 的 0..1 限制，不能凭 fixture 的 0.5 认定历史值非法。若集成收紧范围，须说明旧有效配置的兼容策略并测试。金额不要求 output>=input 或 cache<=input；cache-write 高于普通输入是有效独立报价。 |
| F5 | MI3 / ME3 | 五项能力必须是显式 JSON bool；未知/null/缺失不作为新 import/update 的路由事实。reasoning_effort 必须合法列表，非法元素/类型/档位、超限列表拒绝；显式 [] 与缺失证据分开。`reasoning=false` 配合合法 `["none"]` 仍可表达接受的 effort，不能误加两者必须联动的规则。无 benchmark 自动推导 quality/priority/tags。 |
| D1 | MI3 / 兼容 | disabled 在管理 GET 中保留 ID、引用、字段。实际 chat 和 preview 对该 concrete ID 均不得生成；核对集成定义的固定 4xx code，不能绕过正常/explicit 路由启用过滤。`GET /v1/models` 的对外可用列表与管理列表需符合记录的禁用语义。 |
| D2 | MI3 / 兼容 | policy、decision、decision_matrix 及 auto registry 路径；tag pool、显式 model list、正常选池、扩大候选池、放宽能力/上下文/输出、最终 fallback 均排除 disabled。用一个价格 0/高质量但 disabled 的模型和一个有效 enabled 模型，跨三种 selection 断言实际选择 enabled；all-disabled 场景不能 IndexError/误选，返回确定的 unavailable/setup-incomplete 结果，零 generation。 |
| D3 | MI3 / 兼容 | tag 只剩 disabled、空 tag + 全局 default、default 指向 disabled、唯一模型 disabled、default/disabled 原引用一起原子调整。禁用不能留下可被选中的 default 或静默删除引用。若契约拒绝仍被 default 引用的禁用，验证 400 和不变状态，并另建合法 disabled/default 场景检验 runtime 保护；若允许保存，则验证不可用请求的准确响应。 |
| D4 | MI3 / 兼容 | 先使 session 真正 pin/cached/sticky 到 enabled 模型，再通过实际 PUT 禁用。分别走 sticky/cached/escalate/adaptive/fresh 后续轮次以及手动覆盖同一 ID；即使 pin.break_on=[]、迟滞未到期、预算/故障统计不触发，也不能保留 disabled。有 enabled 候选时按约定重选，没有可用模型则固定失败；旧 session 引用不变成秘密删模型操作。 |
| D5 | MI3 / 兼容 | enabled 重开后管理/route 同步，display 修改不改变选择 ID。使用更新后的有限价格、能力、limit 驱动实际排序/参数转发；调用桩观察 canonical 目的地和派生 reasoning/temperature 行为。仅缓存报价变化不改变原 input/output `estimated_cost` 与记录估算含义，不声称自动进行缓存账单结算。 |

禁用 concrete ID 的新错误 code、all-disabled/default 的精确行为必须在集成公共文档收口后冻结为测试预期。现有 `model_not_found`（404）和 `setup_incomplete`（503）可作为已有语义参考，本计划不声称新路径已经采用它们。不接受只有 `status_code >= 400` 的断言或从实现返回值临时生成预期。

## 元数据源、匹配和证据验收矩阵

| 编号 | 需求 | 场景与断言 |
| --- | --- | --- |
| M1 | MI3 / MI4 | Models.dev `api.json` 和 `catalog.json` 使用同 serving-provider 的精确模型 ID。同名片段、相似版本、latest/base 猜测、其他 provider row 不能匹配；显式 canonical_model_id/base_model 关联有来源记录。canonical facts 可以提供适用能力/限制证据，其价格和缓存价格不能冒充 serving 价格。 |
| M2 | MI4 | transport、实际 endpoint、HTTPS、host、port、path 与 serving provider 的关系均参与 applicability。官方地址/443/合法默认值与自定义 proxy、官方 host 的不同 path、HTTP、8443 分别测；换 display/brand/icon 不能给任意代理认证报价。reference-only 证据保留但不参与 runtime 建议和 conflict。OpenRouter billing 不混入原厂或其他渠道。 |
| M3 | MI3 | Models.dev input/output/cache_read/cache_write 已为 USD/M tokens，值不再乘百万。OpenRouter prompt/completion/input_cache_read/input_cache_write，LiteLLM input/output/cache_read/cache_creation 单价为 USD/token 时乘 1,000,000；用 `0.000002 -> 2`、`0.0000002 -> 0.2`、0 等独立算式断言原单位和目标单位。null/负/非法/NaN 保持未知，不通过默认值生成免费价。 |
| M4 | MI3 / MI4 | 原生列表 OpenAI ID-only 仅认证标识；Anthropic/DeepSeek 只根据显式字段补能力/限制。保留 max_input_tokens reference 字段，不能当 combined context_window；structured_output 与 json_mode 分开；不从名称 `reasoner` 等推导 reasoning。供应商完整 supported_parameters/effort 声明与缺失/null 的含义分别测。 |
| M5 | MI3 / MI4 | LiteLLM fallback 读取 QA 安装 distribution 的 `model_prices_and_context_window_backup.json`，记录安装版本、文件路径和 SHA256，使用静态读取，不通过新导入/调用 LiteLLM 触发网络成本表获取或 generation。精确 `{provider}/{model}` 或有依据的同 provider key，错误 litellm_provider 不匹配；未列 output/capability 仍未知。 |
| M6 | MI3 / MI5 | tier/context threshold、cache TTL/creation/read、batch/flex/priority、audio、时段/weekday、OpenRouter overrides、legacy threshold_unverified 和 unrecognized_conditions 安全保留。普通 input/output/cache 单价只采用适用且确认的字段；不得取最便宜 tier 无条件推广、把缓存读当未命中输入或混入不同 TTL 报价。USD/source unit 的 request/image/search 费用不能当 USD/M token。 |
| M7 | MI5 | 每字段 source_ids 可解析，source 保留 source_field/unit/source_unit、provider_id/model_id、applicable、schema_revision、canonical association。fetched_at、source_updated_at、confirmed_at 含义分开；源无更新时间不补造。304 验证时间与原报价更新时间不混淆，reload/restart 后 provenance 完整。 |
| M8 | MI4 / MI5 | known + null -> known；known false + null -> known false；known zero + null -> known zero；true + false 或不同已知价格/limits -> conflict、自动值空/null且保留双方证据；两项等值 -> known。对缓存、努力列表、两个 limits 同测；全部未知不认定 false/免费。native + 公共来源合并和 `metadata_envelope` 得到同一状态/value/source references。 |
| M9 | MI5 | refresh 不写入 catalog，也不更新已确认 runtime。用户的 manual/source-confirmed 值和 source IDs 持久化后，再返回变化、null、conflict、失败/过期建议：已确认值不被 server 替换。Model workspace 消费同一 evidence，保留触碰字段；恢复自动值由显式差异选择产生新的完整事务，再读回对应 provenance。source unknown 不能借恢复操作隐式完成严格必填项。 |
| M10 | MI5 | six-hour 缓存上限、源 cache-control/max-age/no-cache/no-store、条件请求、30 秒 refresh throttle、coalesced 并发、四源有界缓存；用注入时钟/事件实现确定性，不 sleep 等 TTL。source failure 时保留未过上限的旧证据并报告 stale/可重试；超过上限返回 unknown，不修改 confirmed 模型。恢复后可取得新建议。 |
| M11 | MI4 / MI5 | 元数据源全部超时、无效 JSON、响应过大、源间部分失败、备份不可读、busy、没有匹配。真实 `/v1/provider-metadata` 返回约定 unknown/stale/warnings，已有模型不变；同时用实际 `/v1/chat/completions` 配受控 fake completion 验证确认模型仍成功。让元数据 fetch 成为禁止调用桩，正常 chat 不得调用它。不以 lookup 单测代替 chat 独立性证明。 |
| M12 | MI4 / 隐私 | 公共 source fetch 仅固定 allowlist URL，header 只含必要 cache validators，不含 gateway/provider/transport secret、自定义 api_base 或用户请求文本。candidate credential 可用于私有 listing，但不能进入 Models.dev/OpenRouter 公共元数据检索。来源地址只作为证据保存，解析时不能进行网络请求。 |
| M13 | MI3-MI5 | 自动补全范围以现有路由字段为限。audio/video/PDF 等额外源声明作为 reference evidence，不能未经 schema/transport 契约确认拓展 runtime capability；外部 benchmark 不隐式改变 quality、tags 或 strategy membership。公开源失败也不降级/清空已配置模型。 |

源 schema 的权威证据需在执行轮核对：当前固定地址为 `https://models.dev/api.json`、`https://models.dev/catalog.json`、`https://openrouter.ai/api/v1/models`；当前源码记录 Models.dev schema revision `f4f37ea6a4315ebdb733a49c35499aa93fd35840`。集成若改变 schema/version，必须提供对应源码/官方文档及字段映射研究。上述只是本轮读取的定位信息，不认证未来接口数据。自动化完全使用已保存的无秘密 fixture；必要的公开 schema 检查保持只读并记录 URL、检索时间、版本和范围。

## 人工确认与 envelope 边界验收矩阵

| 编号 | 需求 | 场景与断言 |
| --- | --- | --- |
| E1 | MI4 / MI5 / ME3 | import 顶层 confirmed 必须为 true，价格/五 bool/努力列表/两个 limit 均显式。update_model 复用严格 complete-record 验证；源建议 known 不能代替缺失 runtime 字段。确认 unknown limit 为 null 是明确决策，不能自动补 null 并以旧 omission defaults 宣称确认。 |
| E2 | MI5 / ME3 | metadata.fields 每个 confirmed 值与实际 `cost.*`、`capabilities.*`、limit 精确一致，包括 false、0、[]、null 和缓存字段。价格改了但保留旧 confirmed 证据拒绝，能力/limits 同测；仅顶层 confirmation 不能绕过字段不一致。来源 raw 值可与 manual override 不同，但对应 field 标记和确认记录必须一致。 |
| E3 | MI5 | known/unknown/conflict/confirmed 四种状态、source/source IDs、method、confirmed_at round-trip；字段 unknown/conflict 不被投影成 known 或 confirmed。source method 使用的引用必须存在，manual 方法可无自动 source。对不能表达的状态/value 组合核对最终严格规则并测 safe rejection，不能以 truthiness 消掉 false/zero。 |
| E4 | MI5 / 隐私 | metadata version 必须为整数 1；整体 <=256 KiB UTF-8 JSON；sources <=32 且 ID 非空唯一；source references <=32且全能解析；文本长度及控制字符、effort 来源 <=16、pricing keys/深度/tiers/overrides 等现有边界在恰好上限及超限值均测。拒绝 NaN、任意上游 body、未知层级键、非法值类型。API 错误无回显。 |
| E5 | MI4 / MI5 / 隐私 | URL 只接受公共证据契约允许的无凭证 HTTPS，无 userinfo/query/fragment；HTTP、内嵌 credential、危险/private 目标以及错误 URL 形状按规定拒绝或保持非请求证据。保存源 URL 不能形成新的任意网络探测入口；不因 `allow_private_network` 把源 allowlist 扩展到私网。 |
| E6 | MI5 / ME3 | 规范 envelope 与原始 safe suggestion 区分，深拷贝结果；修改一次返回对象的 fields/source/pricing 不改变缓存或其他候选。validate/apply 后不可变 catalog metadata 不因 UI/查询 mutation 改变。使用固定时间源确认 timestamp 值和 source refs，不凭截图文本建立一致性。 |

## 连接测试验收矩阵

通过真实 ASGI 验证本地授权、payload 和语义响应，再在网络 owner 层检验实际 DNS/连接/HTTP 安全边界。不能把 mock 的完整 status response 当作连接测试实现证据。

| 编号 | 需求 | 场景与断言 |
| --- | --- | --- |
| C1 | SP4 | 已保存 provider 和未保存 candidate，keep/set/clear 分别解析一致的 immutable credential snapshot。测试采用候选地址和候选 key，却不保存它们；provider 记录/model/import/default/overlay/credential 文件、active registry/hash/session 和进程环境完全不变。不生成新配置版本或模型。 |
| C2 | SP4 | 错误/缺失本地 Bearer 为 HTTP 401 `invalid_api_key`，无网关 key 为 403 `config_writes_disabled`，不存在 LLM selector/二选一冲突/未知 key/非法 credential shape 为固定 400；外部 fetch 次数为 0。上游 401/403 是已授权探测的结果 status，不能发本地 401 令前端清空 gateway key。 |
| C3 | SP4 | 支持 transport 的完整有效列表为 HTTP 200、status=success、scope=model_listing、model_count=去重有效数量。完整空列表仍 success/count=0，并保留适当空状态说明；不能把没有模型当网络失败。成功只验证模型列举响应，不能宣称 generation、全部云参数或账单已认证。 |
| C4 | SP4 | 上游认证、地址、网络、unsupported、部分结果按下表精确分类，warnings 只使用固定 code。每个 status 实际由相应 fixture 触发，验证返回 keys/type/count；不接受 status 枚举任一项即通过的断言。 |
| C5 | SP4 / 隐私 | OpenAI/DeepSeek 与 Anthropic 的 endpoint prefix 和 header auth 保留；Anthropic version/paging 正确。凭证不进入 URL/query，不能转发任意 params 中的 secret headers。transport 无 safe model-list probe（包括 decision System One）不得发送 evaluation/chat 请求；用 unsupported 或明确 configuration-only 契约解释未验证 scope，不能伪报 model_listing success。 |
| C6 | SP4 | 默认只允许公共 HTTPS；private/loopback HTTP(S) 需明确 strict boolean opt-in。invalid scheme、userinfo/query secret、fragment、CR/LF、encoded controls、反斜线、混合公网/私网 DNS 答案、link-local/cloud metadata、未指定/组播/映射/转换地址在连接前拒绝。opt-in 后危险地址仍拒绝。 |
| C7 | SP4 | 实际 socket.connect 使用经过验证的数值地址；连接阶段二次 DNS 设置为禁止调用桩。TLS 使用默认验证 context 和原 hostname SNI/Host，不能禁用校验或代理绕过验证；错误证书/连接失败安全归类。所有重定向均拒绝，不跟随到新地址，也不把 key 发送给 redirect target。 |
| C8 | SP4 | 总 deadline 包含 DNS、connect、TLS、headers、body、所有分页，最多20秒、20页、1000模型、每页4 MiB；header/body停顿、超时、响应/声明长度超限、invalid JSON、gzip、valid JSON前缀但 Content-Length截断、循环 cursor均有界返回。前页有效数据可报告 incomplete/count，而不能误报完整成功。 |
| C9 | SP4 | semaphore/DNS容量不足、异常/取消后释放容量，后续合法测试可运行；拒绝 busy 不阻塞正常 chat。重复 test/discovery/metadata 不自动导入，也不改变 revision。网络 fixture 禁止真实公网和所有 generation/decision 调用。 |
| C10 | SP4 / MI5 / 隐私 | hostile 异常含合成 key、private endpoint/query、Authorization 正文时，API/warnings/logs不含异常原文。模型 ID/cursor 中嵌入 key 不能返回；网络、metadata、鉴权错误各检查相同隐私边界。未成功的探测也不能激活候选 endpoint/credential。 |

核心分类预期如下。HTTP 200 的上游探测结果与本地访问失败独立；后者使用错误 envelope。

| 触发条件 | HTTP / status 或 error.code | 必须保留的解释 |
| --- | --- | --- |
| 完整合法 listing，包含完整空列表 | 200 / success | model_listing；model_count准确，generation未验证。 |
| 上游 HTTP 401/403 / authentication_failed | 200 / authentication_error | 上游凭证未通过，不能表示网关 Bearer失效。 |
| invalid_url、blocked_target、redirect_rejected | 200 / address_error（进入地址校验前的非法 provider shape仍为400） | 地址/目标不适用或被网络规则阻止；无redirect追随。 |
| dns_failed、connection/TLS/network failure、timeout | 200 / network_error | 未能完成网络列举；不证明凭证错误。 |
| transport没有safe listing adapter | 200 / unsupported | 不发送generation或decision evaluation。 |
| 达到model/page上限、循环分页、已有有效页但后续数据不完整 | 200 / incomplete | 有界部分结果/count，不声称完整成功。 |
| 本地网关Bearer缺失/错误 | 401 / invalid_api_key | 没有任何上游调用。 |
| 未配置网关key的管理POST | 403 / config_writes_disabled | 没有任何上游调用。 |
| selector/credential/body违反公共shape | 400 / 固定公开configuration错误code | 无写入，不回显字段secret；与上游status分开。 |

父设计未细分 `rate_limited`、`busy/discovery_busy`、第一页 invalid_response/response_too_large、上游404/405/5xx、先成功页后authentication/network失败时 status 的优先级。集成执行前由实现方在公共契约中固定这些分类，本上下文对照原因和安全语义审查，再为每个分支冻结唯一预期 status/warnings/count。它们属于待收口验收项，不能从一份实现输出推导预期后宣称通过，也不能全部标为凭证错误。decision-only 若另有 configuration-only scope，需要同步父设计、TS 和 UI；现有 LLM model_listing shape 不可被静默改变。

## 执行顺序与必需检查

所有命令在确定的隔离 QA 根目录执行；正式运行记录工作目录、解释器/uv/Node/npm/依赖版本、源快照、环境隔离路径、开始/结束时间、原生退出码、完整日志。以下是计划命令，本轮未执行。

1. 检查集成 diff、文件所有权、docs/type/schema，以及矩阵中未定义的准确响应/边界。缺陷转实现方，避免在接受实现输出后倒写需求。
2. 在隔离环境安装项目现有依赖：`uv sync --all-groups`、`npm --prefix frontend install`。记录 lockfile前后哈希；若 npm 按平台更新 lockfile，不能污染开发目录或用更新后的不同源快照混称同一版本。
3. 先运行事务/metadata/network/route重点检查，再执行完整 gates。现有定位命令为：

```sh
uv run pytest -q tests/test_catalog.py tests/test_provider_config.py tests/test_provider_config_regressions.py tests/test_provider_management_api.py tests/test_provider_onboarding_integration.py tests/test_model_metadata.py tests/test_model_discovery.py tests/test_discovery_network.py tests/test_global_defaults.py tests/test_empty_tag_default.py tests/test_decision.py tests/test_routing_strategies.py tests/test_decision_strategy.py tests/test_decision_matrix.py tests/test_routing_overlay.py
```

集成新增测试文件及独立QA探针按实际路径追加，报告 exact node IDs。已有测试计数不能证明新矩阵全部覆盖。

4. 必需完整 gates：

```sh
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
npm --prefix frontend run test:browser
uv run pytest -q
uvx pyright
scripts/build-frontend.sh --check
uv build
```

浏览器命令设置专用 `JEV_BROWSER_PORT`。`npm run build` 同时包含 `tsc --noEmit`；browser脚本还检查 `tests/tsconfig.json`。Pyright使用QA自身 `.venv`，包含 `jev_gateway` 和 `tests`，不能复用开发环境或把受影响文件移出scope。当前无项目Ruff配置，不新增formatter gate，也不自动格式化。

5. 全量 pytest 的 `dashboard_bundle` 会再次生成静态输出，browser脚本也先build；因此 bundle freshness 在所有这些生产步骤之后检查。lint/unit/browser完整通过只作为跨层支持证据，本子任务仍须具备真实ASGI、文件和runtime矩阵。
6. 检查实际共享client请求/abort/error语义，单元测试中验证 update_model/connection-test请求shape及没有自动写重试。本轮检查过 `frontend/src/shared/api/client.test.ts` 的存在，执行轮读取其集成内容后决定覆盖缺口；不得用类型强转掩盖shape问题。
7. 按集成版本运行本地release资产验证：`python3 scripts/validate-release.py v<pyproject-version> <isolated-dist>`，输出目录只包含本次唯一wheel；构建与验证不发布。核对wheel metadata、许可证/入口/templates、shell所引用hashed JS/CSS、local icons与源码bundle逐文件字节/SHA256一致。
8. 把本次wheel安装到另一个隔离Python环境/runtime，从checkout外验证公开管理投影/endpoint及Dashboard真实ASGI serving：shell 200/no-store，hashed assets 200/immutable，CSP保持原规则，资源URL为同源 `/dashboard/assets/`，safe snapshots无secret。只需本任务API/资产回读，不执行operator安装、生产迁移或发布。记录installed distribution路径，防止import到source树。
9. 与supplier/model-workspace/parent验收上下文交叉核对实际消费者：新connection statuses显示的测试scope、tri-state metadata、whole-record保存payload、manual refresh/restore差异、409/读取重试、成功catalog刷新和disabled/default候选列表。对方browser fixture是UI行为证据，本上下文真实ASGI是服务器证据；两者分别记录。

## 报告、判定与复验

后续 `acceptance.md` 至少包含：

- PASS或REWORK、验收上下文身份、集成源码/补丁/fixture标识、Python/runtime/browser/build隔离路径。
- 每个 X/T/F/D/M/E/C 编号的预期、实际、证据链接/文件/test node ID，映射回SP4/MI3-MI5/ME3。
- 命令、退出码、完整日志位置和汇总；关键ASGI response/status、文件前后字节/存在/权限、runtime destination/call counts、来源/单位算式、rollback/revision结果。
- 浏览器与真实后端的覆盖边界、尚未运行或环境受阻项，不将其写成通过。
- 每个失败的分类：产品缺陷、测试问题、环境限制，或有基线重现证据的历史失败；失败负责人和最短可复现步骤。不能只凭日志认定历史失败。
- 修复轮次、新快照、复验项和结果；保留此前失败证据，不删断言/跳过用例/扩大timeout掩盖问题。

PASS要求分配矩阵具备实际证据、必需full pytest/Pyright/frontend/bundle/package gates通过，且没有未解决的已确认缺陷或准确契约缺口。缺少必要证据、集成未完成或环境阻断时记录REWORK及具体未验证原因；不声称产品已失败，也不提前签发PASS。父任务负责整体验收/生命周期/提交，本上下文只管理本子任务验收产物和复验。
