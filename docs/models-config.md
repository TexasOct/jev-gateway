# `models.json` 配置参考

`models.json` 是网关的静态配置文件，默认从启动时的工作目录读取。它同时定义服务运行参数、上游连接、模型元数据和路由策略。文件必须是合法 JSON，不能写注释。可从 [`jev_gateway/templates/models.example.json`](../jev_gateway/templates/models.example.json) 复制起步；示例中的地址、模型名称和价格仅是配置示例，应按实际上游核对。

```bash
cp jev_gateway/templates/models.example.json models.json
# 在 .env 中设置 providers[*].api_key_env 指向的密钥；启用 decision 时还需配置对应决策提供方的密钥
uv run jev-gateway
```

`models.json` 是唯一的静态配置来源：providers、models、策略、重路由和网关运行参数都从这里读取。进程不读取固定的 `JEV_API_BASE`、`JEV_API_KEY`、`JEV_ROUTES`、`JEV_MODELS_FILE`，也不读取路由或策略覆盖变量。密钥只按配置中声明的名字解析，包括 `providers[].api_key_env`、`providers[].param_env`、`decision.providers[].api_key_env` 和 `gateway.api_key_env`。前两类用于上游调用，后两类分别用于分类器调用和入站鉴权；策略与检查响应只返回变量名或密钥是否存在的标记，不返回密钥内容。

以下默认值指字段省略时程序采用的值，不一定与仓库现有 `models.json` 的显式取值相同。配置文件变更后调用 `POST /v1/routing/reload`；`gateway.host` 和 `gateway.port` 改动需重启进程。

## 顶层结构

| 字段 | 含义 |
| --- | --- |
| `providers` | 必填、非空数组；上游服务的地址和密钥引用。 |
| `models` | 必填、非空数组；可路由的具体模型。 |
| `policy` | 顶层路由策略，注册为名为 `default` 的策略；没有 `strategies` 时必须提供有效的 `labels` 或兼容格式 `tier_models`。如果 `strategies.default` 指向一个显式定义的策略，可省略。 |
| `strategies` | 可选；具名策略及默认策略名称。 |
| `gateway` | 可选；监听、入站鉴权、会话及内存决策日志设置。 |
| `storage` | 可选；SQLite 请求和决策记录。 |
| `decision` | 可选；外部决策提供方配置。 |

## `providers` 与 `models`

每个 provider 可以供多个模型共用。`providers` 中的 `id` 必须唯一；`models` 中的 `(provider, upstream_model)` 组合也必须唯一。

| 字段 | 类型 / 默认值 | 含义 |
| --- | --- | --- |
| `providers[].id` | 非空字符串，必填 | 目录中的 Provider 标识，例如 `deepseek`；不决定 LiteLLM 的适配器。 |
| `providers[].type` | LiteLLM 支持的 provider 前缀，必填 | 例如 `deepseek`、`openai`、`azure` 或 `vertex_ai`；加载时校验是否由已安装的 LiteLLM 支持。 |
| `providers[].api_base` | 非空字符串，可选 | 上游基础地址；解析时去掉末尾 `/`。`type: "openai"` 时必填。 |
| `providers[].api_key_env` | 非空字符串，可选 | `api_key` 对应的环境变量名；设置后变量必须有值。`type: "openai"` 时必填。 |
| `providers[].params` | 对象，默认 `{}` | 发给 LiteLLM `completion()` 的非敏感 provider 参数，如 `api_version` 或 `vertex_location`；不可覆盖 `model`、`messages`、`stream`、`api_base`、`api_key`。 |
| `providers[].param_env` | 对象，默认 `{}` | 参数名到环境变量名的映射，供额外凭据使用，如 `vertex_credentials`；解析后的密钥不出现在策略响应中。 |
| `providers[].display_name` | 非空字符串或 `null`，可选 | Provider 页的显示名称；不改变实例 ID 或模型 ID，省略或 `null` 时显示实例 ID。 |
| `providers[].brand_id` | 非空字符串或 `null`，可选 | 供应商品牌标识，用于本地预设、图标和元数据来源匹配；不选择 LiteLLM transport。 |
| `providers[].icon_id` | 非空字符串或 `null`，可选 | 本地图标标识；无法识别时界面显示中性回退。 |
| `providers[].allow_private_network` | 布尔值，默认 `false` | 显式允许模型发现访问 localhost 或私网；只控制发现，不改变聊天 transport。 |
| `models[].provider` | 非空字符串，必填 | 引用已有的 `providers[].id`。 |
| `models[].upstream_model` | 非空字符串，必填 | 发给该 provider 的实际模型名。 |
| `models[].tags` | 字符串数组；默认 `[]` | 模型所属的精确路由标签。推荐使用 `<策略名>/<标签名>`，例如 `quality/critical`。`/` 只用于作用域分隔，不执行前缀或通配匹配。 |
| `models[].priority` | 整数；默认数组索引 × 10（索引从 0 开始） | 排序平局时优先较小的值。 |
| `models[].quality` | 数值；默认 `0.5` | `quality_first` 与 `balanced` 排序使用的质量分值；代码不校验取值范围。 |
| `models[].context_window` | 整数或 `null`；默认 `null` | 上下文 token 容量；`null` 在筛选中视为不受限。 |
| `models[].max_output_tokens` | 整数或 `null`；默认 `null` | 输出 token 上限；`null` 在筛选中视为不受限。 |
| `models[].capabilities.tools` | 布尔值；默认 `true` | 是否支持工具调用。 |
| `models[].capabilities.vision` | 布尔值；默认 `true` | 是否支持图片输入。 |
| `models[].capabilities.json_mode` | 布尔值；默认 `true` | 是否支持 JSON 响应格式。 |
| `models[].capabilities.reasoning` | 布尔值；默认 `false` | 上游模型的推理能力元数据。 |
| `models[].capabilities.reasoning_effort` | 字符串数组；默认 `[]` | 该路由接受的 `reasoning_effort` 取值；`[]` 表示未声明，网关不会为它推导任何档位。 |
| `models[].capabilities.temperature` | 布尔值；默认 `true` | 是否支持 temperature；向上游转发时用于处理该参数。 |
| `models[].cost.input_per_million` | 数值；默认 `0` | 每百万未命中输入 token 的美元估算单价，用于估算请求与会话成本。 |
| `models[].cost.output_per_million` | 数值；默认 `0` | 每百万输出 token 的美元估算单价。 |
| `models[].metadata` | 对象，可选 | 保存模型元数据来源和字段确认记录；路由继续使用上述 cost、capabilities 和 limit 字段。 |

模型的唯一 ID 由 `<provider>/<upstream_model>` 自动生成。例如 `deepseek` + `deepseek-flash` 对应 `deepseek/deepseek-flash`。`type` 只控制 LiteLLM 上游适配器，不改变这个 ID。手动指定请求 `model` 时使用完整 ID。自动分流由 `models[].tags` 建池；一个模型可以同时属于多个策略和标签。不要在模型里写 `id`、`api_base`、`api_key` 或 `api_key_env`；连接信息由 provider 提供，明文 `api_key` 也不能写在 provider 中。`capabilities` 不接受表中以外的字段。

`type: "deepseek"` 使用 LiteLLM 的原生适配器；`type: "openai"` 可连接自定义 OpenAI 兼容地址。Azure 可在 `params.api_version` 指定 API 版本，Vertex AI 可在 `params.vertex_project` 和 `params.vertex_location` 指定项目与区域；额外凭据使用 `param_env`。

### Provider 页与模型导入

Provider 页分别管理 LLM 与 decision 实例。供应商预设和自定义表单都提交同一种规范配置；展示名称、品牌和图标可独立修改，实例 ID 保持稳定。Settings 继续管理语言和外观。

LLM 模型发现支持 OpenAI 兼容、Anthropic 和 DeepSeek transport；不支持的 transport 可手动添加模型。列表只生成候选，搜索、刷新和取消都不会写入有效目录。选中模型后，用户补齐或确认元数据，再显式导入；已有 `provider/upstream_model` 跳过导入，保留原有配置和 routing overlay。

管理导入接口要求显式提供输入和输出价格、`tools`、`vision`、`json_mode`、`reasoning`、`temperature` 五项布尔能力、`reasoning_effort` 列表，以及 `context_window` 和 `max_output_tokens`。价格须为有限非负数。两个 limit 可以是正整数，也可以在确认未知后设为 `null`。旧的手工配置仍采用字段表中的省略默认值；发现数据缺失时不能用这些默认值完成新模型确认。

在线元数据建议按实际服务商和 upstream model 精确匹配。Models.dev 的价格已经是 USD/百万 token；OpenRouter 和 LiteLLM 的 per-token 数据在查询中转换为该单位。OpenRouter 的服务价格只适用于对应 OpenRouter 实例，不能套用到任意代理。缓存、时段和上下文分段报价需要用户选择适用估算值；检索时间与来源声明的更新时间分别显示。查询不会覆盖已经确认或手工修改的值，也不会改写路由标签。

发现默认要求公网 HTTPS。`allow_private_network: true` 允许 localhost/私网的 HTTP 或 HTTPS；重定向、link-local、云 metadata、未指定地址和组播仍被拒绝，HTTPS 证书校验保持开启。公共元数据查询使用固定公开源，不接收用户的上游密钥或自定义地址。

Provider 配置写入需要已配置的 `gateway.api_key_env`。管理操作在同一事务中验证 baseline、凭证引用与 overlay；旧 revision 返回冲突，失败恢复旧配置。密钥保存在邻近 `.env`，JSON 继续只保存环境变量引用。高级 `params` 和 `param_env` 在普通表单操作中省略时保留原值；配置读取只返回安全投影，不能把投影当原始高级参数写回。HTTP 请求格式见 [`http-api.md`](./http-api.md)。

`clear` 清除本地 `.env` 条目；启动 shell 仍提供该引用时，有效凭证继续存在，读取的 `has_api_key` 反映这一状态。凭证解析使用局部映射，不临时修改进程环境。

未标记的旧 `.env` 赋值保留 python-dotenv `override=True` 的文件顺序、重复赋值与 `${NAME}` / `${NAME:-default}` 展开规则；单引号本身不会禁止旧规则展开。管理 SET 使用单引号并转义反斜线和单引号，值含 `${` 时在行尾添加 ` # jev-managed-literal-v1`，只对该记录保留字面值。例如 `FIXTURE_KEY='fake-${BASE_KEY}' # jev-managed-literal-v1` 在 JEV 中解析为字面 `fake-${BASE_KEY}`。这是同一 `.env` 中的 JEV 约定，通用 dotenv 读取器不实现该标记。SET/CLEAR 替换目标名称的所有赋值，其他记录保持原顺序。

多文件恢复失败留下 journal 时，修复前禁止从磁盘加载、reload 或发现部分配置；已有健康的内存目录可继续服务。正常 CLI 写入期间 startup/reload 等待共同文件锁，不能把尚未完成的写入误报为需要恢复。

### `models[].metadata`

元数据使用 version 1 envelope，所有对象层级都拒绝未知键。整个模型的 metadata 最大 256 KiB；`sources` 最多 32 项，每项需要唯一的 `id`。它记录来源证据与确认过程，路由仍使用模型顶层的价格、能力和 limit 值。

| 字段 | 含义 |
| --- | --- |
| `version` | 必须为 `1`。 |
| `sources[]` | 来源记录：`id` 必填；可选 `source`、`provider_id`、`model_id`、`url`、`fetched_at`、`source_updated_at`、`applicable`、单位、schema/canonical 信息、原始 effort、逐字段证据与经过限定的 `pricing`。 |
| `fields.<字段名>.status` | `known`、`unknown`、`conflict` 或 `confirmed`。来源候选状态与用户确认状态分开。 |
| `fields.<字段名>.value` | 该字段的候选或确认值，类型与字段一致；未知值为 `null`。 |
| `fields.<字段名>.source_ids` | 引用本 envelope 中的来源 ID；最多 32 项。 |
| `fields.<字段名>.method`、`confirmed_at` | 可选确认方式和确认时间；不代替来源更新时间。 |
| `confirmation` | 可选整体确认记录，包含 `method` 和 `confirmed_at`。 |

`fields` 接受十个扁平名称：`input_per_million`、`output_per_million`、`tools`、`vision`、`json_mode`、`reasoning`、`temperature`、`reasoning_effort`、`context_window`、`max_output_tokens`。导入时，`confirmed` 的值必须与对应的 `cost.*`、`capabilities.*` 或顶层 limit 一致；确认未知的 limit 使用 `value: null`。

来源中的 `fields` 还可保存 `max_input_tokens` 和 `structured_output` 作为证据，不能自动把它们当成 combined context window 或 JSON mode。每条证据包含 `value`、`source_field` 和可选单位。价格条件只允许经过限定的缓存、上下文分段和时段结构，不能直接保存任意上游响应。来源 URL 必须是无 userinfo、query 或 fragment 的 HTTPS 地址；配置解析器只保存它，不请求它。

查询接口同时提供原始安全候选与规范 envelope：模型发现项使用 `metadata_envelope`，元数据查询项使用 `metadata`。确认时保留规范 envelope 的来源，按选择的值更新字段状态；不能把候选中的 `source_provider` / `source_model` 原样用作持久化字段。旧模型可省略 metadata，不会自动获得来源或确认记录。

`cost` 只支持一个输入价，不能表达缓存命中、批量模式或按时段计费。它应取最保守且可复现的输入单价，用于路由排序与记录估算，不是账单结算。仓库当前 `deepseek-flash` 用中国大陆官方高峰价：缓存未命中输入 2 元、输出 8 元 / 百万 token，按 2026-09-23 人民币中间价 6.7468 元 / 美元换算为约 $0.2964 / $1.1857。DeepSeek 高峰是北京时间工作日（不含法定节假日）9:00-12:00、14:00-18:00；其余时间价格减半。

## `policy` 和 `strategies`

`policy` 与每个 `strategies.<名称>` 使用同一字段结构。每个策略有自己的 `labels`，按 JSON 声明顺序排列。没有决策提供方结果或矩阵规则时，采用第一项作为稳定回退标签。每项的 `description` 供决策提供方分类使用，`reasoning_effort` 可选。模型池默认来自 `<策略名>/<标签名>`：默认策略名是 `task_aware`，其他策略直接使用配置名。匹配是完整字符串精确匹配。标签可用 `tag` 改成其他精确标签。具名策略未声明 `labels` 时继承顶层集合，声明后整体替换，不合并不同命名体系。候选仍会经过约束筛选和策略排序；必要时可能扩大至整个模型目录。

```json
"labels": {
  "quick": {"description": "短请求", "reasoning_effort": "low"},
  "deep": {"description": "架构或审计", "reasoning_effort": "high"}
}

"models": [
  {"provider": "deepseek", "upstream_model": "deepseek-flash", "tags": ["task_aware/quick"]},
  {"provider": "openai", "upstream_model": "gpt-5.6-sol", "tags": ["task_aware/deep"]}
]
```

`labels` 与 `tier_models` 不能在同一策略同时声明。旧 `tier_models` 可读取，转换成 `simple`、`standard`、`complex` 标签并保持该顺序。旧格式具名策略仍可按层覆盖旧格式顶层策略。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `mode` | `sticky` | `sticky` 保持首轮模型，只有 `pin.break_on` 指定的原因才允许解除；`cached` 使用相同的硬约束切换规则，但决策提供方仅在会话首轮分类；`escalate` 与 `adaptive` 在后续轮次按条件切换，其中 `adaptive` 可按预算等仍支持的会话条件调整；`fresh` 每轮重新选择。 |
| `selection` | `balanced` | `cheapest_adequate` 优先估算成本低者；`quality_first` 优先 `quality` 高者；`balanced` 按归一化成本与质量综合排序。平局参考 `priority`。 |
| `labels.<名称>` | 无有效省略值 | 任意数量、任意名称的标签；声明顺序就是升降顺序。不接受 `score` 字段；可提供 `description`、`reasoning_effort` 和 `tag`。没有 `tag` 时使用 `<策略名>/<标签名>`。兼容配置仍可用 `models` 直接列模型，但不能和 `tag` 同时出现。 |
| `escalation` | 见下文 | 后续轮次升级或降级触发条件。 |
| `hysteresis` | 见下文 | 防止频繁切换的限制。 |
| `pin.break_on` | `["capability_gap", "context_pressure", "output_limit"]` | `sticky` 模式允许打破固定模型的原因列表；例如还可填入 `upstream_failures`。 |
| `budget.max_cost_per_session_usd` | `null` | 会话成本上限；`null` 不按成本触发降级。 |
| `budget.context_pressure_ratio` | `0.75` | 当前模型上下文使用量超过窗口的该比例时，触发上下文压力检查。 |
| `reasoning` | 见下文 | 选定模型之后如何决定思考档位。 |

紧凑格式中，`strategies` 的每个同级键都是策略名和 OpenAI API 的虚拟模型名。`strategies.task_aware` 必须存在，并且是默认虚拟模型；例如 `model: "quality"` 选择 `strategies.quality`，`model: "task_aware"` 选择默认策略。provider 限定的具体模型 ID 仍表示手动指定。可以同时定义任意多个策略，每个策略只写与顶层策略不同的字段，并可声明自己的完整标签集合。每项还可选填 `description` 和 `kind`：显式类型为 `policy`、`decision` 或 `decision_matrix`，省略时使用 `auto`。请求只能通过 JSON body 的 `model` 字段选择策略；`?strategy=` 会返回 `400 unsupported_parameter`，`X-JEV-Strategy` 请求头不参与选择。已废除的 `auto`、`jev-auto` 仍是保留名称，不能配置为策略名；请求它们会返回 `404 model_not_found`。策略名也不得与具体模型 ID 重名。旧的 `default`/`definitions` 包装格式仍可读取，但默认项省略时使用 `task_aware`。

本地提示词评分、模式检测和意图触发已移除。旧配置中的顶层 `signals`、`policy.scoring`、标签 `score` 以及依赖提示词检测的升级/推理字段会被严格解析器拒绝。请求文本仍可提供给决策提供方；工具、图片、JSON、上下文和输出限制仍作为结构约束使用。

### `escalation` 与 `hysteresis`

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `escalation.max_consecutive_failures` | `2` | 连续上游失败达到次数后尝试换模型。 |
| `escalation.max_consecutive_truncations` | `2` | 连续以 `length` 结束达到次数后尝试升级。 |
| `hysteresis.min_turns_between_switches` | `2` | 两次切换至少间隔的轮数。 |
| `hysteresis.cooldown_seconds` | `45.0` | 两次切换至少间隔的秒数。 |
| `hysteresis.max_switches_per_session` | `8` | 每个会话允许的最多切换次数。 |

`sticky` 和 `cached` 模式下，升级原因还必须出现在 `pin.break_on`，才可能解除固定模型。`cached` 会把决策提供方分类限制在同一会话的首轮，后续复用会话阶层与模型。`fresh` 模式每轮重新排序，不走上述会话升级流程。

### `reasoning`

思考档位分成两层。**哪条路由接受哪些档位**是上游事实，写在 `models[].capabilities.reasoning_effort`；**这次跑在哪一档**是决策，由 `policy.reasoning` 在策略选好模型之后决定，并向所选模型声明的梯度收敛。同一份策略因此在两条路由上会得到各自合法的档位。未声明梯度的模型不参与推导：网关既不填也不改，请求原样透传。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `reasoning.mode` | `override` | `override` 完全采用推导值；`cap` 只降不升，客户端请求低于推导值时保留客户端的；`fill` 仅在客户端未提供时填入；`preserve` 保留客户端取值，但会把它收敛到路由认得的档位；`off` 完全不读不写该字段。 |
| `reasoning.effort_by_label` | `{}` | 按最终路由标签给出的目标档位；标签内的 `reasoning_effort` 优先于此映射。 |
| `reasoning.fallback` | `medium` | 前几条都不适用时的档位。 |

推导顺序为 `labels.*.reasoning_effort` → `effort_by_label[标签]` → `fallback`，取第一个适用者，再向所选模型的梯度收敛：档位以 `none, minimal, low, medium, high, xhigh, max` 为序，先向上再向下取最近的可接受值。`mode`、各档位与 `effort_by_label` 的键都会在加载时校验，写错拼写或写一个不存在的等级都会直接报错。

这里的“等级”是路由最终采用的等级，也就是响应头 `X-JEV-Task-Type` 和决策记录 `label`（以及兼容的 `tier`）里的值，不再存在本地评分等级。决策提供方分类器可选择标签；未取得分类结果时使用首个配置标签，会话固定模式则沿用会话已有标签。用最终等级可以保证告知客户端的等级与思考档位不会互相矛盾。



不同路由接受的枚举不同，梯度必须按上游实测填写，不能照抄：

```bash
curl -s "$API_BASE/chat/completions" -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"...","messages":[{"role":"user","content":"ok"}],"max_completion_tokens":16,"reasoning_effort":"minimal"}'
```

返回 `502` 时，错误信息里会列出上游真正接受的枚举。例如本仓库实测的 OpenAI 兼容路由对 `minimal` 返回 `litellm.UnsupportedParamsError`，DeepSeek 路由则七个档位全接受，因此两者的梯度不同。

档位会写进决策记录（`reasoning_effort`、`reasoning_effort_source`），并出现在响应头 `X-JEV-Reasoning-Effort` 和 `X-JEV-Reasoning-Source` 中。`X-JEV-Reasoning-Source` 取值为 `client`、`clamped_client`、`derived`、`capped` 或 `invalid_client`；字段未被网关改动时（`off` 模式，或所选路由未声明梯度）两个响应头都不出现。`POST /v1/routing/preview` 按同一规则给出档位。

`capabilities.reasoning` 与 `capabilities.reasoning_effort` 回答两个不同的问题：前者用于筛选需要推理的请求，后者只描述该路由认得的档位。想在不被当作“推理模型”的便宜路由上压低思考开销时，只填 `reasoning_effort`（例如 `["none"]`）即可。

### `decision_matrix`：如何定义规则

`kind: "decision_matrix"` 的策略把配置放在 `strategies.<名称>.options` 里，只接受 `questions`、`rules`、`fallback` 三个键，多写一个键会在加载时报错。它把决策提供方的回答当作策略选择，而不是模型名：每个问题是一道单选题，`rules` 按顺序把答案映射成 `label` 和/或 `selection`。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `options.questions` | 无有效省略值 | 非空对象；键是问题名，值是发给决策提供方的选择题。 |
| `options.rules` | `[]` | 有序规则数组；按顺序检查，取第一条命中的规则。 |
| `options.fallback` | `{}` | 拿不到可用答案时使用的选择。 |

每道问题的结构：

| 字段 | 含义 |
| --- | --- |
| `questions.<名称>.type` | 必须是 `"choice"`，目前只支持单选。 |
| `questions.<名称>.instructions` | 非空字符串，告诉决策提供方该按什么标准作答。 |
| `questions.<名称>.criteria` | 至少两项的 `标签: 描述` 对象；标签是规则里可引用的答案，描述是给决策提供方的判据。 |

一条规则由 `when` 和 `select` 组成，两个键都必须存在，也多不出来：

```json
{
  "kind": "decision_matrix",
  "options": {
    "questions": {
      "risk": {
        "type": "choice",
        "instructions": "答错这次请求的代价有多大？",
        "criteria": {
          "low": "日常、可撤销的请求。",
          "high": "安全、迁移等高代价请求。"
        }
      },
      "objective": {
        "type": "choice",
        "instructions": "这次更看重哪一侧？",
        "criteria": {
          "cost": "在有限任务上压低成本。",
          "quality": "优先答案质量。",
          "speed": "宁可略差也要快。"
        }
      }
    },
    "rules": [
      {"when": {"risk": "high"}, "select": {"label": "deep", "selection": "quality_first"}},
      {"when": {"objective": ["cost", "speed"]}, "select": {"selection": "cheapest_adequate"}},
      {"when": {"risk": "low", "objective": "cost"}, "select": {"label": "quick"}}
    ],
    "fallback": {"label": "working", "selection": "balanced"}
  }
}
```

| 字段 | 含义 |
| --- | --- |
| `when` | 非空对象。键必须是已声明的问题名，值是该问题 `criteria` 里的标签，或这些标签组成的非空数组。同一个 `when` 里的多个键之间是「与」，一个键的数组里是「或」。 |
| `select` | 只能含 `label` 和/或 `selection`。`label` 必须是当前策略声明的标签，`selection` 取 `cheapest_adequate`、`quality_first`、`balanced`。兼容字段 `tier` 可代替 `label`，但两者不能同时出现。两个选择字段都不写表示不改标签和排序方式。 |

匹配从第一条规则开始，命中即停止，`reason` 按顺序记为 `rule_1`、`rule_2`。`when` 里没提到的问题不参与判断。所有规则都不命中时 `reason` 为 `default`，使用策略的首个标签和原有 `selection`。`fallback` 只在拿不到可用答案时生效：决策提供方未启用或调用失败，或者回答缺少任一问题、给了 `criteria` 之外的标签，整组答案作废并记为 `fallback`。若 `fallback` 未指定 `label`，同样使用首个标签。

`select.label` 设置本次策略标签，`select.tier` 只是它的输入兼容别名；两者都不会改写本地提示词分类结果。`select.selection` 只替换这个策略本次的排序方式。所选标签的模型池仍会经过能力、上下文窗口和输出上限筛选。决策记录与 `X-JEV-Reason` 以 `decision_matrix:<来源>:<rule_N|default|fallback>` 开头，后面接实际选择原因，来源取命中的 `decision.providers[].id` 或 `local`。

`mode: "cached"` 只在会话首轮提问，后续轮次直接复用会话已存的标签与模型；手动指定模型的请求不提问，直接走策略原本的选择逻辑。`options` 在加载时校验：问题必须是非空的 `choice` 对象且至少两个 `criteria`，规则必须是恰好含 `when` 和 `select` 的对象，`when` 的键必须是已声明的问题、值必须是该问题的标签，`select.label`（或兼容的 `select.tier`）必须属于当前策略，`selection` 必须是已支持的排序方式。任一项写错都会在加载时直接报错。

### 仓库当前使用的 `task_aware` 分流表

`models.json` 用三道题描述一次请求：`workload`（research / docs / small_change / coding / reverse）、`scale`（bounded / moderate / large / cross_domain）、`rigor`（draft / exacting）。九条规则按顺序命中，落成七个标签：

| 标签 | 命中条件 | 模型池 | 思考档位 |
| --- | --- | --- | --- |
| `quick` | 小改且 `scale: bounded`、`rigor: draft` | `deepseek-flash` | `minimal` |
| `draft` | 调研、文档或小改且 `rigor: draft`，且未被前面的规则命中 | `gpt-6-luna`；仅当请求所需输出上限超过 Luna 的上限时回退到 `deepseek-flash` | `low` |
| `review` | 文档或小改且 `rigor: exacting` | `gpt-6-luna`；仅当请求所需输出上限超过 Luna 的上限时回退到 `deepseek-flash` | `medium` |
| `investigate` | 调研且 `rigor: exacting` | `deepseek-flash` | `high` |
| `craft` | 未被前面规则命中的编码：`scale` 非 `large`、非 `cross_domain`，且不是 `moderate` + `exacting` | `gpt-6-luna` | `medium` |
| `engineering` | `workload: reverse`；或编码且 `scale: large`，或 `scale: moderate` + `rigor: exacting` | `gpt-6-sol`，`gpt-6-luna` 作为约束回退 | `high` |
| `ultra` | `scale: cross_domain` 且 `workload` 为 coding 或 reverse | `gpt-6-astra` | `xhigh` |

分工依据：决定模型的是标签归属，而不是质量阈值，`cheapest_adequate` 只在池内按成本挑第一个满足上下文与输出上限的模型。Luna 比 `deepseek-flash` 更便宜，质量分也更高，所以两者共处的池一律选出 Luna。DeepSeek 只保留 Luna 不在的两个池：bounded 的草稿级小改（`quick`）和严格调研（`investigate`）。Luna 承接文档、review，以及不涉及大规模的那部分可交付编码，并在 `engineering` 池里作为 Sol 的能力/上下文回退；Sol 承接大规模编码与逆向；`ultra` 只由跨领域超高复杂任务触发，再大的单领域难题也留在 `engineering`。

规则 1 额外要求 `workload` 为 `coding` 或 `reverse`，所以“调研一个跨领域课题”或“为跨领域课题写文档”仍留在日常池（`draft` / `review`），不会因为话题本身难而被抬到最高档。

决策提供方不可用、调用失败，或回答缺少任一问题时使用 `fallback`，当前是 `review` + `cheapest_adequate`，落在 Luna 上。`gpt-5.6-terra` 不再带任何 `task_aware` 标签，只保留 `quality/analysis`：GPT-6 一代已经没有中间档，它的位置由 Luna 承担。重新把它放进某个标签池会让它和 Luna 在成本排序上竞争，谁胜出完全取决于该 provider 配置的价格。

#### `ultra` 与 Astra

`ultra` 只挂 `gpt-6-astra`，并使用 `quality_first`。它只会被规则 1 命中，规则 1 同时要求 `scale: cross_domain` 和 `workload` 为 coding 或 reverse。因此普通难题、单领域工程任务、调研和文档工作都不会进入 Astra 的候选池。

上游的 `/v1/models` 集合接口目前未列出 GPT-6 别名，但模型详情与实际 chat/responses 请求已确认 `gpt-6`、`gpt-6-astra`、`gpt-6-sol`、`gpt-6-luna` 可用，且 `gpt-6` 是 Astra 别名；`gpt-6-terra` 返回 `404 model_not_found`。目录使用显式别名而不是不完整的集合结果。

## `gateway`

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `host` | `127.0.0.1` | 网关监听地址。 |
| `port` | `8000` | 监听端口，范围 `1` 至 `65535`。 |
| `api_key_env` | `null` | 可选入站鉴权密钥的环境变量名；设置后变量必须有值。 |
| `session_strategy` | `derived` | `derived` 从用户标识和首条用户消息生成会话 ID；`header` 仅使用请求头；`user` 使用请求的 user 字段；`off` 禁用会话。非 `off` 模式下有效的 `X-JEV-Session-Id` 请求头优先。 |
| `session_ttl_seconds` | `1800` | 内存会话过期时间，须大于 0。 |
| `max_sessions` | `2048` | 内存会话数量上限，至少为 1。 |
| `decision_log_size` | `500` | 内存决策日志条数，至少为 1。 |
| `echo_requested_model` | `true` | 响应中的模型名是否回显请求的 `model`；路由选中的具体模型仍可从 `X-JEV-Route` 查看。 |
| `logging_level` | `INFO` | 网关模块日志等级：`DEBUG`、`INFO`、`WARNING`、`ERROR` 或 `CRITICAL`，不区分大小写；启动时生效。 |
| `log_format` | `pretty` | 日志输出格式：`pretty` 按字段分组换行，适合终端阅读；`json` 每条事件输出一个 JSON 对象，适合日志采集；`compact` 使用单行 `key=value` 格式。启动时生效。 |
| `access_log` | `false` | 是否输出 Uvicorn 的逐条 HTTP 访问记录；启动时生效，默认关闭轮询造成的刷屏。 |

`jev-gateway` 启动后将网关、Uvicorn 与 LiteLLM 日志写入 stderr。常规路由决策和结果按 INFO 输出，开始流式响应按 DEBUG 输出，失败与存储异常按 WARNING/ERROR 输出。默认 `pretty` 格式会把路由事件按 identifiers、model、selection、reasoning、outcome 等分组换行，避免长行在终端折断。`json` 不添加 ANSI 颜色，并保持每条事件为一个 JSON 对象，字段名与控制台格式一致。三种格式都只输出白名单字段，不输出请求正文或密钥。`uvicorn.error` 是 Uvicorn 的生命周期 logger 名称，不代表 ERROR 级别；终端中显示为 `uvicorn`。在 `pretty` 与 `compact` 格式中，终端输出只给日志级别文本着色，时间、模块名和正文保持终端默认颜色；重定向到文件或管道时全部保持纯文本。LiteLLM 的 provider 提示直写 stdout 已关闭；其有效警告仍保留。需要查看每个 HTTP 请求时将 `gateway.access_log` 设为 `true` 并重启。通过其他 ASGI 启动方式运行时，应自行配置服务器日志。

## `storage`

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `enabled` | `false` | 是否启用 SQLite 记录。 |
| `path` | `jev-records.sqlite3` | SQLite 文件路径。 |
| `capture_content` | `true` | 是否保存请求与最终 LiteLLM 请求的内容；关闭后保留摘要、信号统计、模型、时序和安全的结构信息，不保存消息、提示词、工具或响应格式正文。 |
| `max_requests` | `null` | 最多保留的请求数；`null` 不剪裁，非负整数启用清理。 |
| `max_continuations_per_session` | `40` | 每个会话保留的提供方续写记录上限，至少为 1。 |
| `max_continuation_sessions` | `2048` | 保留提供方续写记录的会话数上限，至少为 1。 |
| `busy_timeout_ms` | `5000` | SQLite 忙等待时间，须为非负整数。 |
| `queue_size` | `4096` | 异步写入队列容量，至少为 1；满队列会拒绝新请求。 |

启用后，请求、决策、脱敏后的最终 LiteLLM 请求、上游结果与配置快照写入 SQLite。最终 LiteLLM 请求在 provider 消息转换和 reasoning effort 应用后记录；`api_key`、Authorization/header、凭据特征字段以及 `providers[].param_env` 提供的字段会在入队前脱敏。写入先进入队列，进程异常退出前尚未提交的数据可能丢失。会话仪表盘的保留请求时间线依赖此存储；关闭或降级时仍可查看当前进程中的活动会话和路由信息。

提供方续写记录包含会话 ID、assistant 消息哈希、来源 provider type 和由适配器定义的 JSON 数据，不保存公开的 assistant 消息、工具参数或提示词。适配器负责提取和恢复这些数据，例如 DeepSeek 的 reasoning content；同一存储接口也可供后续提供方签名使用。上述两个上限分别约束每个会话的记录数和保留的会话数。

所有 `storage` 字段都在进程启动时生效。修改路径、保留上限、队列或内容采集设置后需重启；`POST /v1/routing/reload` 会以 `400 restart_required` 拒绝这些变更。

## `decision`

`decision` 配置独立于聊天补全 `providers` 的决策提供方。决策结果选择策略标签或匹配本地规则，再由策略选择模型。启用时至少配置一个决策提供方；调用失败或回答无效时尝试下一个，全部失败则使用策略的本地回退。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `enabled` | `false` | 是否调用外部决策提供方。 |
| `default_provider` | `null` | 优先尝试的提供方 `id`；省略时按数组顺序尝试。 |
| `timeout_seconds` | `1.5` | 每次请求的超时秒数，须为正数。 |
| `providers[].id` | 必填 | 唯一的决策提供方名称。 |
| `providers[].protocol` | 必填 | 协议；目前仅支持 `system_one`。 |
| `providers[].api_base` | 必填 | 决策请求的完整 URL；直接向该地址发起 POST。 |
| `providers[].api_key_env` | 必填 | 密钥环境变量名；缺失时跳过该提供方。 |
| `providers[].model` | `null` | 可选模型名；省略时请求不带 `model`。 |
| `providers[].display_name` | `null` | 可选显示名称；省略时界面使用实例 ID。 |
| `providers[].brand_id` | `null` | 可选品牌标识，与 `protocol` 分开。 |
| `providers[].icon_id` | `null` | 可选本地图标标识，缺失或未知时显示中性回退。 |

例如，`jev_gateway/templates/models.example.json` 禁用外部决策并使用不带模型名的通用端点。启用时按实际端点填写地址和密钥环境变量；若端点要求模型名，再显式设置 `model`。不要把密钥明文放进 JSON。

旧顶层键 `jev` 已移除，配置中必须使用 `decision`：将 `sources` 改为 `providers`、`default_source` 改为 `default_provider`，并为每个提供方显式填写 `protocol: "system_one"`。若旧端点依赖原先省略 `model` 时的默认值，还需显式填写 `model`；新配置不会代填。旧策略类型 `jev`、`jev_matrix` 也已移除，分别改用 `decision`、`decision_matrix`。旧分类器前缀 `jev:` 和矩阵前缀 `jev_matrix:` 分别改为 `decision:` 和 `decision_matrix:`；`X-JEV-Reason` 响应头名称不变。

## 运行时覆盖文件

`models.json` 是基线配置。路由覆盖接口不会改写它；面板上的拖拽改动写到与它同目录的运行时文件里，重启和 `POST /v1/routing/reload` 都会重新应用。

`routing-overrides.json` 覆盖规则顺序和模型的标签、优先级：

```json
{
  "version": 1,
  "strategy": "task_aware",
  "rules": [
    { "when": { "scale": "large" }, "select": { "label": "engineering", "selection": "quality_first" } }
  ],
  "models": {
    "openai/gpt-6-luna": { "tags": ["quality/routine", "task_aware/craft"], "priority": 10 }
  }
}
```

合并规则如下：

- `rules` 整体替换 `strategies.<strategy>.options.rules`，同一策略下的 `questions` 和 `fallback` 仍取自基线文件。
- `models.<模型 ID>` 整体替换该模型的 `tags`，`priority` 存在时才替换。模型 ID 是 `provider/upstream_model`。
- 任何层级出现未知键都会被拒绝，因此存储、gateway、provider、decision 段都碰不到，密钥也进不了这个文件。
- 未知策略名或未知模型 ID 会被拒绝。
- 标签与模型的绑定靠标签：把模型放入某个标签就是给它加上 `{策略}/{标签}` 标签；改标签时只动这个标签，其它策略的标签（如 `quality/*`、`economy/*`）保持原样。

覆盖文件会先合并进 `models.json` 文档，再走原有的解析与策略注册流程，所以标签没有对应模型、规则指向不存在的标签或选择模式等错误，都会用解析器自己的报错信息被拒绝，现役路由不受影响。写入是原子的：校验通过才落盘，落盘后重新加载；写盘后若加载失败，会恢复上一个文件内容并切回旧目录。每次成功应用都会在 `config_versions` 里留下一条记录。

`dashboard-theme.json` 只存面板主题的种子色，不存派生结果：

```json
{"version": 1, "seed": "#3b66d9"}
```

调色板由前端用 chroma-js 从种子推导。删除这两个文件都会回到基线行为，重启或 reload 后生效。默认主题种子 `#3b66d9` 与旧面板的强调色一致。

写入 `routing-overrides.json` 仍要求配置 `gateway.api_key_env`，否则返回 `403 config_writes_disabled`。保存或重置 `dashboard-theme.json` 无需配置网关密钥；配置了密钥时，主题接口仍要求正确的 Bearer，否则返回 `401 invalid_api_key`。主题色不受路由/Provider 的写权限限制，三个文件的读接口沿用现有鉴权规则。


## 检查配置

```bash
# 从 models.json 解析、校验并构建模型目录；需要先配置 provider 密钥
uv run python -c 'from jev_gateway.catalog import load_catalog; print(load_catalog().names())'
uv run pytest -q
```

网关启动后可访问 `GET /v1/routing/policy` 查看生效的配置和密钥是否存在的布尔值，该接口不会返回密钥内容。路由流程、API 用法和重载操作见 [`README.md`](../README.md) 与 [`routing-design.md`](routing-design.md)。
