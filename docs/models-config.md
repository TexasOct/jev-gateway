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
| `policy` | 顶层路由策略，注册为名为 `default` 的策略；没有 `strategies` 时必须提供有效的 `labels` 或兼容格式 `tier_models`。如果 `strategies.default` 指向一个显式定义的策略，可省略。 |
| `strategies` | 可选；具名策略及默认策略名称。 |
| `gateway` | 可选；监听、入站鉴权、会话及内存决策日志设置。 |
| `storage` | 可选；SQLite 请求和决策记录。 |
| `jev` | 可选；外部 System One 任务等级分类器。 |
| `signals` | 可选；所有策略的信号提取默认设置。 |

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
| `models[].capabilities.reasoning` | 布尔值；默认 `false` | 推理能力标记，推理升级时可用于筛选。 |
| `models[].capabilities.reasoning_effort` | 字符串数组；默认 `[]` | 该路由接受的 `reasoning_effort` 取值；`[]` 表示未声明，网关不会为它推导任何档位。 |
| `models[].capabilities.temperature` | 布尔值；默认 `true` | 是否支持 temperature；向上游转发时用于处理该参数。 |
| `models[].cost.input_per_million` | 数值；默认 `0` | 每百万输入 token 的美元单价，用于估算请求与会话成本。 |
| `models[].cost.output_per_million` | 数值；默认 `0` | 每百万输出 token 的美元单价。 |

模型的唯一 ID 由 `<provider>/<upstream_model>` 自动生成。例如 `deepseek` + `deepseek-flash` 对应 `deepseek/deepseek-flash`。`type` 只控制 LiteLLM 上游适配器，不改变这个 ID。手动指定请求 `model` 时使用完整 ID。自动分流由 `models[].tags` 建池；一个模型可以同时属于多个策略和标签。不要在模型里写 `id`、`api_base`、`api_key` 或 `api_key_env`；连接信息由 provider 提供，明文 `api_key` 也不能写在 provider 中。`capabilities` 不接受表中以外的字段。

## `policy` 和 `strategies`

`policy` 与每个 `strategies.<名称>` 使用同一字段结构。每个策略有自己的 `labels`，按 JSON 声明顺序排列。第一项 `score` 必须为 `0`，后续阈值严格递增且落在 `[0, 1]`。本地评分选择分数不高于当前分数的最后一个标签；命中 `scoring.markers` 时直接选最后一个标签。每项的 `description` 供 JEV 分类使用，`reasoning_effort` 可选。模型池默认来自 `<策略名>/<标签名>`：默认策略名是 `task_aware`，其他策略直接使用配置名。匹配是完整字符串精确匹配。标签可用 `tag` 改成其他精确标签。具名策略未声明 `labels` 时继承顶层集合，声明后整体替换，不合并不同命名体系。候选仍会经过约束筛选和策略排序；必要时可能扩大至整个模型目录。

```json
"labels": {
  "quick": {"score": 0, "description": "短请求", "reasoning_effort": "low"},
  "deep": {"score": 0.65, "description": "架构或审计", "reasoning_effort": "high"}
}

"models": [
  {"provider": "deepseek", "upstream_model": "deepseek-flash", "tags": ["task_aware/quick"]},
  {"provider": "openai", "upstream_model": "gpt-5.6-sol", "tags": ["task_aware/deep"]}
]
```

`labels` 与 `tier_models` 不能在同一策略同时声明。旧 `tier_models` 可读取，转换成 `simple`、`standard`、`complex`（阈值分别为 `0`、`0.35`、`0.65`）。旧格式具名策略仍可按层覆盖旧格式顶层策略。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `mode` | `sticky` | `sticky` 保持首轮模型，只有 `pin.break_on` 指定的原因才允许解除；`cached` 使用相同的硬约束切换规则，但 JEV 仅在会话首轮分类；`escalate` 与 `adaptive` 在后续轮次按条件切换，其中 `adaptive` 还可在稳定后降级；`fresh` 每轮重新选择。 |
| `selection` | `balanced` | `cheapest_adequate` 优先估算成本低者；`quality_first` 优先 `quality` 高者；`balanced` 按归一化成本与质量综合排序。平局参考 `priority`。 |
| `labels.<名称>` | 无有效省略值 | 任意数量、任意名称的标签；声明顺序就是升降顺序。每项提供 `score`，可提供 `description`、`reasoning_effort` 和 `tag`。没有 `tag` 时使用 `<策略名>/<标签名>`。兼容配置仍可用 `models` 直接列模型，但不能和 `tag` 同时出现。 |
| `scoring` | 见下文 | 请求复杂度信号与阈值。 |
| `escalation` | 见下文 | 后续轮次升级或降级触发条件。 |
| `hysteresis` | 见下文 | 防止频繁切换的限制。 |
| `pin.break_on` | `["capability_gap", "context_pressure", "output_limit"]` | `sticky` 模式允许打破固定模型的原因列表；例如还可填入 `upstream_failures`。 |
| `budget.max_cost_per_session_usd` | `null` | 会话成本上限；`null` 不按成本触发降级。 |
| `budget.context_pressure_ratio` | `0.75` | 当前模型上下文使用量超过窗口的该比例时，触发上下文压力检查。 |
| `reasoning` | 见下文 | 选定模型之后如何决定思考档位。 |

紧凑格式中，`strategies` 的每个同级键都是策略名和 OpenAI API 的虚拟模型名。`strategies.task_aware` 必须存在，并且是默认虚拟模型；例如 `model: "quality"` 选择 `strategies.quality`，`model: "task_aware"` 选择默认策略。provider 限定的具体模型 ID 仍表示手动指定。可以同时定义任意多个策略，每个策略只写与顶层策略不同的字段，并可声明自己的完整标签集合。每项还可选填 `description` 和 `kind`。请求只能通过 JSON body 的 `model` 字段选择策略；`?strategy=` 会返回 `400 unsupported_parameter`，`X-JEV-Strategy` 请求头不参与选择。已废除的 `auto`、`jev-auto` 仍是保留名称，不能配置为策略名；请求它们会返回 `404 model_not_found`。策略名也不得与具体模型 ID 重名。旧的 `default`/`definitions` 包装格式仍可读取，但默认项省略时使用 `task_aware`。

### `scoring` 与 `signals`

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `signals.patterns_enabled` | 未指定（沿用各策略评分默认值） | 所有策略的评分类 pattern 检测默认开关；策略自己的 `scoring.patterns_enabled` 可以覆盖。仓库当前配置明确设为 `false`，表示不让本地文本影响等级。 |
| `signals.intent_patterns_enabled` | 未指定（沿用 `patterns_enabled`） | 所有策略的“用户意图”检测默认开关：是否请求推理、是否在纠错。策略自己的 `scoring.intent_patterns_enabled` 可以覆盖。 |
| `scoring.patterns_enabled` | `true`（没有顶层覆盖时） | 控制本地文本关键词及正则检测中**参与评分**的部分：markers、多步骤、长输出与代码块；不关闭从请求结构识别工具、图片、JSON、长度与轮次的信号，也不关闭外部 JEV 分类器。 |
| `scoring.intent_patterns_enabled` | 未指定（沿用 `patterns_enabled`） | 单独控制「推理请求」与「用户纠错」两个检测器。两者被升级触发条件和 `policy.reasoning` 读取，因此可以在关闭评分 pattern 时单独开启。取值 `true` / `false` / `null`，`null` 表示跟随 `patterns_enabled`。这两个检测器不会改写等级：它们的评分权重仍受 `patterns_enabled` 约束。 |
| `scoring.markers` | 内置复杂任务词表 | 文本关键词数组；命中时赋予 marker 分值，且路由标签直接提升到当前策略最后一项。 |
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
| `scoring.standard_threshold` | `0.35` | 仅用于兼容信号中的旧三档字段；策略使用 `labels.*.score`。 |
| `scoring.complex_threshold` | `0.65` | 仅用于兼容信号中的旧三档字段，不得低于 `standard_threshold`。 |

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

`sticky` 和 `cached` 模式下，升级原因还必须出现在 `pin.break_on`，才可能解除固定模型。`cached` 会把 JEV 分类限制在同一会话的首轮，后续复用会话阶层与模型。`fresh` 模式每轮重新排序，不走上述会话升级流程。

### `reasoning`

思考档位分成两层。**哪条路由接受哪些档位**是上游事实，写在 `models[].capabilities.reasoning_effort`；**这次跑在哪一档**是决策，由 `policy.reasoning` 在策略选好模型之后决定，并向所选模型声明的梯度收敛。同一份策略因此在两条路由上会得到各自合法的档位。未声明梯度的模型不参与推导：网关既不填也不改，请求原样透传。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `reasoning.mode` | `override` | `override` 完全采用推导值；`cap` 只降不升，客户端请求低于推导值时保留客户端的；`fill` 仅在客户端未提供时填入；`preserve` 保留客户端取值，但会把它收敛到路由认得的档位；`off` 完全不读不写该字段。 |
| `reasoning.effort_by_label` | `{}` | 按最终路由标签给出的目标档位；标签内的 `reasoning_effort` 优先于此映射。旧 `effort_by_tier` 仍可读取。 |
| `reasoning.on_reasoning_request` | `high` | 文本触发推理请求检测（与 `scoring.reasoning_weight` 同一组正则）时的目标档位；设为 `null` 关闭该触发。需 pattern 检测开启才会命中。 |
| `reasoning.on_user_correction` | `high` | 检测到用户纠错时的目标档位；设为 `null` 关闭。同样需 pattern 检测开启。 |
| `reasoning.fallback` | `medium` | 前几条都不适用时的档位。 |

推导顺序为 `on_user_correction` → `on_reasoning_request` → `labels.*.reasoning_effort` → `effort_by_label[标签]` → 兼容的 `effort_by_tier[标签]` → `fallback`，取第一个适用者，再向所选模型的梯度收敛：档位以 `none, minimal, low, medium, high, xhigh, max` 为序，先向上再向下取最近的可接受值。`mode`、各档位与 `effort_by_label` 的键都会在加载时校验，写错拼写或写一个不存在的等级都会直接报错。

这里的“等级”是路由最终采用的等级，也就是响应头 `X-JEV-Task-Type` 和决策记录 `label`（以及兼容的 `tier`）里的值，不是本地评分算出的 `signals.tier`。两者会不一致：JEV 分类器和 `task_aware` 这类策略在策略内部就改掉了等级，会话固定模式又会沿用会话已有的等级。用最终等级可以保证告知客户端的等级与思考档位不会互相矛盾。

因此，`on_reasoning_request` 与 `on_user_correction` 读的是「用户意图」检测器，它由 `signals.intent_patterns_enabled`（或策略内的 `scoring.intent_patterns_enabled`）单独控制，默认跟随 `patterns_enabled`。本仓库把评分 pattern 关闭、把意图检测开启：`patterns_enabled: false` 保证本地文本不影响等级，`intent_patterns_enabled: true` 让这两个触发仍然有效。意图检测器不会改变等级，它们的评分权重仍受 `patterns_enabled` 约束。

不同路由接受的枚举不同，梯度必须按上游实测填写，不能照抄：

```bash
curl -s "$API_BASE/chat/completions" -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"...","messages":[{"role":"user","content":"ok"}],"max_completion_tokens":16,"reasoning_effort":"minimal"}'
```

返回 `502` 时，错误信息里会列出上游真正接受的枚举。例如本仓库实测的 OpenAI 兼容路由对 `minimal` 返回 `litellm.UnsupportedParamsError`，DeepSeek 路由则七个档位全接受，因此两者的梯度不同。

档位会写进决策记录（`reasoning_effort`、`reasoning_effort_source`），并出现在响应头 `X-JEV-Reasoning-Effort` 和 `X-JEV-Reasoning-Source` 中。`X-JEV-Reasoning-Source` 取值为 `client`、`clamped_client`、`derived`、`capped` 或 `invalid_client`；字段未被网关改动时（`off` 模式，或所选路由未声明梯度）两个响应头都不出现。`POST /v1/routing/preview` 按同一规则给出档位。

`capabilities.reasoning` 与 `capabilities.reasoning_effort` 回答两个不同的问题：前者用于筛选需要推理的请求，后者只描述该路由认得的档位。想在不被当作“推理模型”的便宜路由上压低思考开销时，只填 `reasoning_effort`（例如 `["none"]`）即可。

### `jev_matrix`：如何定义规则

`kind: "jev_matrix"` 的策略把配置放在 `strategies.<名称>.options` 里，只接受 `questions`、`rules`、`fallback` 三个键，多写一个键会在加载时报错。它把 System One 的回答当作策略选择，而不是模型名：每个问题是一道单选题，`rules` 按顺序把答案映射成 `label` 和/或 `selection`。

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `options.questions` | 无有效省略值 | 非空对象；键是问题名，值是发给 JEV 的选择题。 |
| `options.rules` | `[]` | 有序规则数组；按顺序检查，取第一条命中的规则。 |
| `options.fallback` | `{}` | 拿不到可用答案时使用的选择。 |

每道问题的结构：

| 字段 | 含义 |
| --- | --- |
| `questions.<名称>.type` | 必须是 `"choice"`，目前只支持单选。 |
| `questions.<名称>.instructions` | 非空字符串，告诉 JEV 该按什么标准作答。 |
| `questions.<名称>.criteria` | 至少两项的 `标签: 描述` 对象；标签是规则里可引用的答案，描述是给 JEV 的判据。 |

一条规则由 `when` 和 `select` 组成，两个键都必须存在，也多不出来：

```json
{
  "kind": "jev_matrix",
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

匹配从第一条规则开始，命中即停止，`reason` 按顺序记为 `rule_1`、`rule_2`。`when` 里没提到的问题不参与判断。所有规则都不命中时 `reason` 为 `default`，选择回落到本地信号等级和策略原本的 `selection`。`fallback` 只在拿不到可用答案时生效：JEV 未启用或调用失败，或者回答缺少任一问题、给了 `criteria` 之外的标签，整组答案作废并记为 `fallback`。

`select.label` 设置本次策略标签，`select.tier` 只是它的输入兼容别名；两者都不会改写本地兼容信号里的 `tier`、`base_tier` 或 `score_tier`。`select.selection` 只替换这个策略本次的排序方式。所选标签的模型池仍会经过能力、上下文窗口和输出上限筛选。决策记录与 `X-JEV-Reason` 以 `jev_matrix:<来源>:<rule_N|default|fallback>` 开头，后面接实际选择原因，来源取命中的 `jev.sources[].id` 或 `local`。

`mode: "cached"` 只在会话首轮提问，后续轮次直接复用会话已存的标签与模型；手动指定模型的请求不提问，直接走策略原本的选择逻辑。`options` 在加载时校验：问题必须是非空的 `choice` 对象且至少两个 `criteria`，规则必须是恰好含 `when` 和 `select` 的对象，`when` 的键必须是已声明的问题、值必须是该问题的标签，`select.label`（或兼容的 `select.tier`）必须属于当前策略，`selection` 必须是已支持的排序方式。任一项写错都会在加载时直接报错。

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
| `capture_content` | `true` | 是否保存请求内容；关闭后保存摘要及信号统计，不保存完整提示文本。 |
| `max_requests` | `null` | 最多保留的请求数；`null` 不剪裁，非负整数启用清理。 |
| `busy_timeout_ms` | `5000` | SQLite 忙等待时间，须为非负整数。 |
| `queue_size` | `4096` | 异步写入队列容量，至少为 1；满队列会拒绝新请求。 |

启用后请求、决策、上游结果与配置快照写入 SQLite。写入先进入队列，进程异常退出前尚未提交的数据可能丢失。

## `jev`

`jev` 指独立的外部路由标签分类器，不是 `providers` 中负责聊天补全的模型。分类器从当前策略声明的标签中选择一项，再由策略通过对应的 scoped tag 建立模型池。启用时至少配置一个来源；失败时按来源顺序尝试下一个，全部失败则把本地分数映射到当前策略标签。

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
