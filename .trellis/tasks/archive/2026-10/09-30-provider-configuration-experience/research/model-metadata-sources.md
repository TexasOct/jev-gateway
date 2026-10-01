# 模型价格与能力在线数据源

## 范围与结论

用户已确认新模型导入前补齐或显式确认必要元数据，并要求寻找可在线查询的数据源；另允许为方便实现优化模型存储结构。本文件提供来源证据与接入建议，任务保持 planning。

可采用组合来源：实际服务商的结构化元数据优先，Models.dev 补充跨厂商信息，LiteLLM 静态表作为备用。OpenRouter 数据优先用于实际经 OpenRouter 服务的模型；自定义代理不能直接套用原厂或 OpenRouter 价格。在线查询返回公开数据的当前版本，不保证实时账户账单、区域报价或协商价格。

本轮读取官方文档和公共数据，仅对无认证的 OpenRouter 公共元数据接口执行了一次 GET。没有读取实际 `.env`/`models.json`、发送用户凭证、调用生成接口或修改产品代码。后续自动化测试仍使用 fixtures 和 mocked HTTP，不调用真实上游。

## 数据源与适用范围

| 来源 | 可用信息 | 更新方式与限制 | 建议用途 |
| --- | --- | --- | --- |
| [Models.dev README](https://github.com/anomalyco/models.dev) / [api.json](https://models.dev/api.json) | provider 对应的模型规格、USD/百万 token 价格、缓存/条件项和服务信息 | 社区贡献；有针对已支持适配器的每小时同步任务，不能保证每项数据每小时更新 | 跨厂商预填，字段仍须确认；不能把品牌名当 provider 匹配依据 |
| [Models.dev models.json](https://models.dev/models.json) / [catalog.json](https://models.dev/catalog.json) | 前者为 provider-agnostic 模型事实；后者组合模型与提供方信息 | 模型事实与实际服务报价分开；`model-schema.json` 是模型 ID 枚举，不是元数据记录 schema | 用于规格关联，不把模型级数据变成账户价格 |
| [OpenRouter Models API](https://openrouter.ai/docs/guides/overview/models) | `pricing`、`context_length`、`top_provider`、输入/输出模态、`supported_parameters`，可有缓存价格及条件价格 | 公共响应有缓存；服务商路由与条件变化可影响实际价格/能力 | 实际 OpenRouter provider 的在线查询；其他 provider 只可作为明确标记的参考 |
| [LiteLLM cost map](https://docs.litellm.ai/docs/provider_registration/add_model_pricing) / [公开 JSON](https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json) | per-token cost、上下文/输出限制、`supports_*`、别名与服务商标识，可有长上下文/缓存等价格 | 通过 PR 更新；公开 main 和安装包快照并非同步保证 | 精确匹配后的备用建议，离线失败降级 |
| [Anthropic Models API](https://platform.claude.com/docs/en/api/models/list) | 可空 `capabilities`、`max_input_tokens`、`max_tokens`；具体 capability 由官方类型定义 | 字段可能为空；模型发布时间不是数据更新时间；没有价格字段 | Anthropic 原生发现中获取已有规格，其价格需其他已核实来源或人工填写 |
| [Gemini Models API](https://ai.google.dev/api/models) | `inputTokenLimit`、`outputTokenLimit`、`thinking`、`temperature`、`maxTemperature`、生成方法 | 没有价格字段；`generateContent` 不直接证明 tools/vision/JSON 支持 | 后续注册 Gemini 适配器时使用，不因此把所有 LiteLLM 类型标记为可发现 |
| [DeepSeek 模型列表](https://api-docs.deepseek.com/zh-cn/api/list-models/) / [官方价格文档](https://api-docs.deepseek.com/quick_start/pricing) | 当前中文列表文档除 ID/归属外，还声明可选展示名称、总上下文、输出上限、模态、effort 和协议能力；价格文档区分缓存命中/未命中与时段 | 列表文档没有价格字段；价格页是网页文档，包含条件价格，未在本轮核实机器可读报价 API | 优先读取实际响应中明确存在的规格；价格页作核对来源，避免把 HTML 抓取作为默认协议 |

Models.dev [LICENSE](https://raw.githubusercontent.com/anomalyco/models.dev/dev/LICENSE) 为 MIT，copyright (c) 2025 models.dev；复制其数据或大段内容时保留版权与许可声明。该许可证没有 freshness 保证，也不授予各供应商 logo 的商标使用权。

## Models.dev 的源 schema 与更新核验

本轮记录 schema/generator 的固定提交为 [`f4f37ea6a4315ebdb733a49c35499aa93fd35840`](https://github.com/anomalyco/models.dev/commit/f4f37ea6a4315ebdb733a49c35499aa93fd35840)，由只读研究与父会话对关键源文件的独立获取核对。公开 API 的部署版本不自动视为该提交，查询时另记录实际检索时间和可取得的响应版本。

- 真正的数据 schema 位于 [packages/core/src/schema.ts](https://github.com/anomalyco/models.dev/blob/f4f37ea6a4315ebdb733a49c35499aa93fd35840/packages/core/src/schema.ts)。模型规格的 capability 可缺省；provider offering 的 `attachment`、`reasoning`、`tool_call`、`open_weights` 必需，`structured_output` 与 `temperature` 仍可缺省。schema 不将缺失 capability 默认成 false。
- `cost` 可缺省；存在时 input/output 为非负数，reasoning、cache_read/cache_write、input_audio/output_audio 可选。价格单位为 USD/百万 token；[OpenRouter adapter](https://github.com/anomalyco/models.dev/blob/f4f37ea6a4315ebdb733a49c35499aa93fd35840/packages/core/src/sync/providers/openrouter.ts) 对 per-token 源价格执行百万倍换算。不能再给 Models.dev 结果乘一次 `1_000_000`。
- `cost.tiers[]` 含 `tier.type: context` 与 `tier.size`，重复阈值被拒绝。schema 未定义所有计费条件或阈值包含关系；遇到不完整语义需展示并确认。[generate.ts](https://github.com/anomalyco/models.dev/blob/f4f37ea6a4315ebdb733a49c35499aa93fd35840/packages/core/src/generate.ts) 对单个阈值 >=200000 的 tier 另导出 `context_over_200k`，即使阈值更高。使用 `cost.tiers` 的实际 size，不从兼容字段名称认定恰好 200000。
- 规格 limit 可缺省，存在时 context 必需而 input/output 可选；provider offering 要求 context/output。数值 0 可通过其 schema，JEV 不能据此认证有效窗口。`reasoning_options` 表示 toggle、effort 或 token budget，reasoning 为 true 时要求该选项；不能仅靠 bool 推断 JEV 的 effort ladder。
- Canonical 模型与 provider-serving 模型分别按自己的路径产生 ID；`base_model` 显式关联二者，导出可有 `canonical_model_id`。未关联 alias 不保证能找到唯一规格。JEV 保持自己的 provider-qualified ID，外部 canonical ID 只用于来源关联。
- 数据适配器仍可能推导 bool：OpenRouter 的 capabilities 来自 `supported_parameters` 成员判断。因此源导出的 false 也不必然是提供方明确拒绝支持；表单展示来源声明，并保留用户确认要求。
- [sync-models.yml](https://github.com/anomalyco/models.dev/blob/f4f37ea6a4315ebdb733a49c35499aa93fd35840/.github/workflows/sync-models.yml) 的 cron 为 `17 * * * *`，动态枚举已支持适配器，按 provider 创建/更新 PR，仅 safe classification 通过时启用自动合并。该调度不证明所有 provider 都被覆盖、每次同步成功或价格立即更新。
- `last_updated` 不能视为核验时间：OpenRouter adapter 对未拆分的记录使用 upstream model.created，其他记录可继承/保留手工日期。UI 应将其标为来源声明日期；另显示 fetched_at，实际数据核验时间未知时保留 unknown。

## OpenRouter 的实查证据

请求：`GET https://openrouter.ai/api/v1/models`，未发送 Authorization 或 API key。本轮返回 `200`，`data` 中有 464 项，抽样文本生成项包含 `pricing`、`architecture`、`top_provider` 和 `supported_parameters`；未发送聊天请求。

缓存头为 `public, max-age=120, stale-while-revalidate=3600, stale-if-error=3600`，没有 ETag。该观察仅描述本轮响应，不承诺未来同样无认证、同样数量或同样缓存规则。接口 reference 标注 Bearer 为 required，而公开 GET 实查可用；适配器必须保留认证变化的失败路径，不能把一次成功当作永久匿名访问保证。

官方 Models guide 明确 `pricing` 是 top provider 的价格，原始价格单位为 USD per token/request/unit。查询过滤参数中的 $/M tokens 不能当作原始响应单位。`pricing.overrides` 表示条件例外，包括上下文阈值和时段；未覆盖的价格字段继承基本值，多条匹配时后条按字段优先。

本轮抽样 pricing 字段包含 `prompt`、`completion`、`web_search`、`input_cache_read`、`input_cache_write`、`overrides`。JEV 当前仅有输入/输出每百万 token 价格，不能把这一对数字显示为所有费用的完整报价。

## LiteLLM 本地备用的源码证据

只读取安装文件，未执行 `import litellm`。本地安装版本 `1.102.0`，备用表为 `.venv/lib/python3.14/site-packages/litellm/model_prices_and_context_window_backup.json`；版本来自相邻 `litellm-1.102.0.dist-info/METADATA:3`。

- `litellm/__init__.py:422` 定义默认远端成本表 URL，`:557` 在导入时调用加载器；`litellm_core_utils/get_model_cost_map.py:601`、`:626` 说明默认远端获取和本地回退。查询服务不能为了读本地快照而新增无控制的 import-time 网络访问。
- `utils.py:5862`、`:5866` 的普通模型信息 helper 可将缺失 token price 默认成 0；`:2643` 的 `supports_*` 会通过默认/提供方回退产生 bool。新模型导入不能把这些 helper 的结果当成完整来源证据。
- 备用方案直接定位 distribution 中的数据资源并读取 JSON，路径不硬编码到 `.venv` 或特定 Python 版本。缺失字段保留 unknown，记录 snapshot 来源；不能宣称其与远端 main 同步。

## 规范化规则

1. 匹配顺序为提供方/服务渠道与 upstream ID 的精确匹配，其次是显式维护的别名映射。名称相似、同品牌或去掉后缀不够。匹配到模型规格不等于匹配到当前 endpoint 的售价或能力。
2. JEV `ModelCost` 单位为 USD/百万 token（`jev_gateway/catalog.py:102`；`docs/models-config.md:52`）。OpenRouter/LiteLLM 原始 per-token 价格乘 `1_000_000`；Models.dev 已是每百万 token，保留原单位。解析使用有限非负数，缺失、null、非法数字和单位不明都保持 unknown；0 需真实零价声明或用户明确确认。
3. `tools`、`vision`、`json_mode`、`reasoning`、`temperature` 和 `reasoning_effort` 分别处理。`supports_response_schema`、`response_format` 或结构化输出不能未经协议核对直接认证为 JEV 的 JSON mode；code execution 也不等于通用工具调用。输入含 image 可作为 vision 的来源证据，缺少字段不能默认为 false。
4. Anthropic 的 [ModelCapabilities 官方类型](https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/src/anthropic/types/model_capabilities.py) 包含 `image_input`、`structured_outputs`、`thinking`、`effort` 等，但没有普通 tools/temperature 独立字段。[EffortCapability](https://raw.githubusercontent.com/anthropics/anthropic-sdk-python/main/src/anthropic/types/effort_capability.py) 中 high/low/max/medium 有独立 support，xhigh 可空；保留上游词汇，按当前 JEV ladder 校验，不按级别名称替换或推断。
5. 上下文含义需要区分：总 input+output window、max input 和 max output 不是同一个字段。DeepSeek 当前中文参考把 `context_window` 定义为输入输出合计，Anthropic 的 `max_input_tokens` 为输入上限。只知道输入上限时不能冒充已核实的总窗口。
6. 不从 benchmark 自动产生 JEV `quality`，不从数据源生成路由标签、priority 或策略 membership；它们仍由用户/既有规则控制。System One decision endpoint 也不因源目录中出现 decision 类型而获得 LLM 发现或新协议支持。
7. 来源冲突保留候选和字段路径，显示来源与适用范围，由用户确认；不平均价格、不拼出一个没有任何来源背书的能力组合。确认后的值与在线建议分离，刷新不覆盖编辑或活动目录。

## 更新与安全建议

- 在导入/查询界面按需读取最新版公开元数据，支持主动刷新。`fetched_at` 描述本次读取，源明确提供的发布时间/更新时间分别保留；未提供实际数据更新时间时标记 unavailable。缓存命中和过期回退须可区分。
- 公共数据库使用固定的来源 registry 和服务端 HTTP client，可批量获取后本地匹配。不给第三方数据库发送用户的 key、gateway token、私有 endpoint、请求内容或模型调用。
- 使用 timeout、响应体/条目数边界与 conditional HTTP（仅源支持 ETag/Last-Modified 时）。尊重 Cache-Control；缓存是建议数据，不能参与每次聊天路由或成为启动/请求可用性的依赖。
- 失败保留当前确认值并允许手工补齐；标识源失败/无匹配/数据缺失/冲突，不能回落为“免费且全部能力支持”。源地址、认证、响应形状变化均要有 mocked 测试。
- API 返回允许字段和 safe source references，拒绝响应中可执行 HTML/SVG 或带凭据 URL。使用既有错误 envelope，不返回原始异常/上游正文。

## 存储结构优化建议

将模型的四种信息分别建模：provider-independent 规格、实际 provider serving 限制、可含缓存/条件项的价格，以及用户确认后用于路由的值。先通过内部规范化类型与新增可选 metadata 字段完成这一分离；是否进一步改成 ID-keyed 文档由最终技术设计评审决定，暂不为了去重引入数据库或第二份运行时配置。

每个查询字段应能表示 value/unknown/conflict，附 source ID、source model/provider ID、原字段路径、单位、fetched_at 和可选 source_updated_at。确认记录描述选择来源或人工输入及确认时点；只保留必要的安全摘录，不存整个上游 payload。三态属于管理和导入候选，只有通过确认与 catalog validation 的具体值才进入运行时。

旧 `models[]`、现有能力/价格默认值和稳定 `provider/upstream_model` 保持读取兼容。迁移只能在显式保存后发生，保留 tags、priority、quality、策略引用和 overlay 优先级；有格式版本时拒绝混合/未知格式，失败恢复旧文件与活动目录。来源刷新不直接迁移文档。

## 后续验证

来源解析测试需覆盖空/缺失字段、null 与 false 区别、单位换算、零价、条件价格、提供方不匹配、别名歧义、模态/JSON/tools 语义、数据冲突、缓存过期/304/401/429、并发刷新和用户编辑保护。存储测试需覆盖旧格式读取、迁移等价、坏版本、overlay、条件写和回滚。完整 schema、缓存具体数值及迁移协议仍归最终技术设计，本轮不宣称已实现或通过产品验收。
