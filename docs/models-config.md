# `models.json` 配置参考

`models.json` 是网关的静态配置文件，默认从启动时的工作目录读取。它同时定义服务运行参数、上游连接、模型元数据和路由策略。文件必须是合法 JSON，不能写注释。可从 [`models.example.json`](../models.example.json) 复制起步；示例中的地址、模型名称和价格仅是配置示例，应按实际上游核对。

```bash
cp models.example.json models.json
# 在 .env 中设置 providers[*].api_key_env 指向的密钥；启用 JEV 时还需配置对应来源的密钥
uv run jev-gateway
```

以下默认值指字段省略时程序采用的值，不一定与仓库现有 `models.json` 的显式取值相同。配置文件变更后调用 `POST /v1/routing/reload`；`gateway.host` 和 `gateway.port` 改动需重启进程。

## 顶层结构

| 字段 | 含义 |
| --- | --- |
| `providers` | 必填、非空数组；上游服务的地址和密钥引用。 |
| `models` | 必填、非空数组；可路由的具体模型。 |
| `policy` | 顶层路由策略，注册为名为 `default` 的策略；没有 `strategies` 时必须提供有效的 `tier_models`。如果 `strategies.default` 指向一个显式定义的策略，可省略。 |
| `strategies` | 可选；具名策略及默认策略名称。 |
| `gateway` | 可选；监听、入站鉴权、会话及内存决策日志设置。 |
| `storage` | 可选；SQLite 请求和决策记录。 |
| `jev` | 可选；外部 System One 任务等级分类器。 |
| `signals` | 可选；所有策略的信号提取默认设置。 |

## `providers` 与 `models`

每个 provider 可以供多个模型共用。`providers` 中的 `id` 必须唯一；`models` 中的 `(provider, upstream_model)` 组合也必须唯一。

| 字段 | 类型 / 默认值 | 含义 |
| --- | --- | --- |
| `providers[].id` | 非空字符串，必填 | Provider 标识，例如 `deepseek`。 |
| `providers[].api_base` | 非空字符串，必填 | OpenAI 兼容 API 的基础地址；解析时去掉末尾 `/`。 |
| `providers[].api_key_env` | 非空字符串，必填 | 保存上游密钥的环境变量名；变量未设置或为空时加载失败。 |
| `models[].provider` | 非空字符串，必填 | 引用已有的 `providers[].id`。 |
| `models[].upstream_model` | 非空字符串，必填 | 发给该 provider 的实际模型名。 |
| `models[].priority` | 整数；默认数组索引 × 10（索引从 0 开始） | 排序平局时优先较小的值。 |
| `models[].quality` | 数值；默认 `0.5` | `quality_first` 与 `balanced` 排序使用的质量分值；代码不校验取值范围。 |
| `models[].context_window` | 整数或 `null`；默认 `null` | 上下文 token 容量；`null` 在筛选中视为不受限。 |
| `models[].max_output_tokens` | 整数或 `null`；默认 `null` | 输出 token 上限；`null` 在筛选中视为不受限。 |
| `models[].capabilities.tools` | 布尔值；默认 `true` | 是否支持工具调用。 |
| `models[].capabilities.vision` | 布尔值；默认 `true` | 是否支持图片输入。 |
| `models[].capabilities.json_mode` | 布尔值；默认 `true` | 是否支持 JSON 响应格式。 |
| `models[].capabilities.reasoning` | 布尔值；默认 `false` | 推理能力标记，推理升级时可用于筛选。 |
| `models[].capabilities.temperature` | 布尔值；默认 `true` | 是否支持 temperature；向上游转发时用于处理该参数。 |
| `models[].cost.input_per_million` | 数值；默认 `0` | 每百万输入 token 的美元单价，用于估算请求与会话成本。 |
| `models[].cost.output_per_million` | 数值；默认 `0` | 每百万输出 token 的美元单价。 |

模型的唯一 ID 由 `<provider>/<upstream_model>` 自动生成。例如 `deepseek` + `deepseek-flash` 对应 `deepseek/deepseek-flash`。`policy.tier_models` 和手动指定请求 `model` 时都要使用完整 ID。不要在模型里写 `id`、`api_base`、`api_key` 或 `api_key_env`；连接信息由 provider 提供，明文 `api_key` 也不能写在 provider 中。`capabilities` 不接受表中以外的字段。

## `policy` 和 `strategies`

`policy` 以及每个 `strategies.definitions.<名称>.policy` 都采用相同结构。每个策略的 `tier_models` 必须分别列出至少一个 `simple`、`standard`、`complex` 候选模型，且所有 ID 都要在 `models` 中存在。数组顺序不是严格的优先级；候选还会经过约束筛选与策略排序。约束不足时路由器可能扩大到整个模型目录或逐步放宽筛选，不能把 tier 列表当作绝对隔离名单。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `mode` | `sticky` | `sticky` 保持首轮模型，只有 `pin.break_on` 指定的原因才允许解除；`escalate` 与 `adaptive` 在后续轮次按条件切换，其中 `adaptive` 还可在稳定后降级；`fresh` 每轮重新选择。 |
| `selection` | `balanced` | `cheapest_adequate` 优先估算成本低者；`quality_first` 优先 `quality` 高者；`balanced` 按归一化成本与质量综合排序。平局参考 `priority`。 |
| `tier_models.simple/standard/complex` | 无有效省略值 | 三个等级的候选模型 ID 数组；都必须非空。 |
| `scoring` | 见下文 | 请求复杂度信号与阈值。 |
| `escalation` | 见下文 | 后续轮次升级或降级触发条件。 |
| `hysteresis` | 见下文 | 防止频繁切换的限制。 |
| `pin.break_on` | `["capability_gap", "context_pressure", "output_limit"]` | `sticky` 模式允许打破固定模型的原因列表；例如还可填入 `upstream_failures`。 |
| `budget.max_cost_per_session_usd` | `null` | 会话成本上限；`null` 不按成本触发降级。 |
| `budget.context_pressure_ratio` | `0.75` | 当前模型上下文使用量超过窗口的该比例时，触发上下文压力检查。 |

`strategies.default` 是默认策略名称，可为顶层 `policy` 注册的 `default` 或 `definitions` 中的名称。每个 `strategies.definitions.<名称>` 可填 `description` 和必填的完整 `policy`；该策略不会继承顶层 `policy` 的字段，省略的子字段使用程序默认值。请求可用 `?strategy=<名称>` 或 `X-JEV-Strategy` 选择。若同时定义顶层 `policy`，不可在 `definitions` 里重复定义 `default`。

### `scoring` 与 `signals`

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `signals.patterns_enabled` | 未指定（沿用各策略评分默认值） | 所有策略的 pattern 检测默认开关；策略自己的 `scoring.patterns_enabled` 可以覆盖。仓库当前配置明确设为 `false`。 |
| `scoring.patterns_enabled` | `true`（没有顶层覆盖时） | 控制本地文本关键词及正则检测，包括 markers、推理要求、纠错、多步骤、长输出与代码块检测；不关闭从请求结构识别工具、图片、JSON、长度与轮次的信号，也不关闭外部 JEV 分类器。 |
| `scoring.markers` | 内置复杂任务词表 | 文本关键词数组；命中时赋予 marker 分值，且基础等级至少为 `complex`。 |
| `scoring.marker_weight` | `0.40` | 首个命中关键词的加分。 |
| `scoring.additional_marker_weight` | `0.10` | 后续每个命中词的加分。 |
| `scoring.max_additional_marker_weight` | `0.30` | 后续关键词加分的上限。 |
| `scoring.reasoning_weight` | `0.15` | 文本触发推理请求检测时的加分。 |
| `scoring.multi_step_weight` | `0.12` | 多步骤文本的加分。 |
| `scoring.long_output_weight` | `0.10` | 长输出请求文本的加分。 |
| `scoring.tools_weight` | `0.08` | 请求包含 tools 时的加分。 |
| `scoring.vision_weight` | `0.06` | 请求包含图片时的加分。 |
| `scoring.code_weight` | `0.05` | 文本中包含代码围栏时的加分。 |
| `scoring.long_prompt_chars` | `1500` | 超过该字符数时视为长提示。 |
| `scoring.very_long_prompt_chars` | `5000` | 超过该字符数时额外加入超长提示加分。 |
| `scoring.long_prompt_weight` | `0.10` | 长提示加分。 |
| `scoring.very_long_prompt_weight` | `0.20` | 超长提示额外加分。 |
| `scoring.turn_depth_weight` | `0.03` | 第二轮起每轮的加分。 |
| `scoring.max_turn_depth_weight` | `0.12` | 轮次加分上限。 |
| `scoring.correction_weight` | `0.10` | 检测到用户纠错文本时的加分。 |
| `scoring.standard_threshold` | `0.35` | 分数达到此值时至少为 `standard`。 |
| `scoring.complex_threshold` | `0.65` | 分数达到此值时为 `complex`，不得低于 `standard_threshold`。 |

评分总分最高为 `1.0`。仓库现有策略将各项权重显式设为 `0` 并关闭 pattern 检测；如果未获得有效的外部 JEV 结果，本地等级可能保持 `simple`，但仍会按工具、图片、上下文和输出限制筛选模型。

### `escalation` 与 `hysteresis`

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `escalation.max_consecutive_failures` | `2` | 连续上游失败达到次数后尝试换模型。 |
| `escalation.max_consecutive_truncations` | `2` | 连续以 `length` 结束达到次数后尝试升级。 |
| `escalation.min_turns_before_escalation` | `1` | 复杂度上升触发升级的最早轮次。 |
| `escalation.escalate_on_user_correction` | `true` | 检测到纠错时允许升级；依赖相应信号。 |
| `escalation.escalate_on_reasoning_request` | `true` | 推理请求且当前模型不支持 reasoning 时允许升级。 |
| `escalation.escalate_on_complexity_spike` | `true` | 当前等级高于会话等级时允许升级。 |
| `escalation.deescalate_when_settled` | `true` | `adaptive` 模式下稳定后允许降级。 |
| `escalation.settle_window` | `3` | 判定稳定所需的最近评分轮数。 |
| `hysteresis.min_turns_between_switches` | `2` | 两次切换至少间隔的轮数。 |
| `hysteresis.cooldown_seconds` | `45.0` | 两次切换至少间隔的秒数。 |
| `hysteresis.max_switches_per_session` | `8` | 每个会话允许的最多切换次数。 |

`sticky` 模式下升级原因还必须出现在 `pin.break_on`，才可能解除固定模型。`fresh` 模式每轮重新排序，不走上述会话升级流程。

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

## `storage`

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `enabled` | `false` | 是否启用 SQLite 记录。 |
| `path` | `jev-records.sqlite3` | SQLite 文件路径。 |
| `capture_content` | `true` | 是否保存请求内容；关闭后保存摘要及信号统计，不保存完整提示文本。 |
| `max_requests` | `null` | 最多保留的请求数；`null` 不剪裁，非负整数启用清理。 |
| `busy_timeout_ms` | `5000` | SQLite 忙等待时间，须为非负整数。 |
| `queue_size` | `4096` | 异步写入队列容量，至少为 1；满队列会拒绝新请求。 |

启用后请求、决策、上游结果与配置快照写入 SQLite。写入先进入队列，进程异常退出前尚未提交的数据可能丢失。

## `jev`

`jev` 指独立的外部任务等级分类器，不是 `providers` 中负责聊天补全的模型。分类器返回 `simple`、`standard` 或 `complex`，再由策略在该等级选择具体模型。启用时至少配置一个来源；失败时按来源顺序尝试下一个，全部失败则使用本地信号等级。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `enabled` | `false` | 是否调用外部分类器。 |
| `default_source` | `null` | 优先尝试的来源 `id`；省略时按数组顺序尝试。 |
| `timeout_seconds` | `1.5` | 每次分类请求的超时秒数，须大于 0。 |
| `sources[].id` | 必填 | 唯一来源名。 |
| `sources[].api_base` | 必填 | System One 请求的完整 URL；代码直接对此地址发起 POST。 |
| `sources[].api_key_env` | 必填 | 来源密钥的环境变量名；缺失时跳过该来源。 |
| `sources[].model` | `typesafe/jev-1.13` | 传入分类请求的模型名。 |

例如仓库当前 `models.json` 中 `jev.enabled` 为 `true`，而 `models.example.json` 设为 `false`。不要把密钥明文放进 JSON；把对应变量写进 `.env` 或进程环境。

## 检查配置

```bash
# 从 models.json 解析、校验并构建模型目录；需要先配置 provider 密钥
uv run python -c 'from jev_gateway.catalog import load_catalog; print(load_catalog().names())'
uv run pytest -q
```

网关启动后可访问 `GET /v1/routing/policy` 查看生效的配置和密钥是否存在的布尔值，该接口不会返回密钥内容。路由流程、API 用法和重载操作见 [`README.md`](../README.md) 与 [`routing-design.md`](routing-design.md)。
