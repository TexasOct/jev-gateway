# 配置存储与模型发现：后端现状调研

## 范围与工作状态

本轮只研究后端，为现有 planning 任务提供证据。`python3 ./.trellis/scripts/task.py current --source` 返回 `Current task: (none)` / `Source: none`；按调用方指定，将成果写入本任务 research 目录，不创建、启动或修改既有任务。不读取 `.env`、实际 `models.json` 或密钥值，不发送上游请求，不修改产品代码。下列证据来自源码、测试、文档；测试命令是后续验证建议，本轮未运行测试。

## 结论与能力边界

- 已有统一静态 catalog：`models.json` 包含 LLM providers、models、strategies、decision、gateway 等配置；secret 通过环境变量名引用。路由运行时编辑另存 `routing-overrides.json`，两者语义不同。证据：`docs/models-config.md:11`、`jev_gateway/catalog.py:1542`、`.trellis/spec/backend/dashboard-routing-config.md:508`。
- 已有 CLI 预设 openai、anthropic、deepseek，以及 custom；可同时添加 provider 和手填模型、登录/退出密钥、删除 provider。未找到独立的已有 provider 模型导入操作，也未找到 HTTP catalog/provider/secret CRUD。证据：`jev_gateway/cli/providers.py:14`、`:34`、`:111`、`:152`；`jev_gateway/cli/main.py:55`、`:218`。
- 已有自定义 LLM provider 身份和 LiteLLM transport 类型；decision provider 独立配置，但当前仅支持 `system_one` 协议。配置自定义实例不等于支持任意新协议。证据：`jev_gateway/catalog.py:110`、`:732`、`:1256`；`jev_gateway/strategy/decision_provider/__init__.py:18`。
- `/v1/models` 是本地策略与已配置模型清单，不是上游发现。源码路由扫描未发现 discovery/import 端点。证据：`jev_gateway/gateway.py:580`、`:583`、`docs/http-api.md:34`。
- 供应商品牌目录、官方 logo 来源、搜索预设及 discovery 适配注册表未在当前后端配置接口中发现。现有三个 CLI PRESETS 可作为已有起点，但不是完整品牌目录。前端设计和外部产品研究不在本轮范围。

## Catalog Schema、身份与协议

`providers[].id` 是用户配置实例身份；`providers[].type` 是 LiteLLM adapter 名称，必须存在于 `litellm.provider_list`。同一协议可以对应多个独立 provider 实例。运行时分别存为 `ProviderProfile.name/type`。证据：`docs/models-config.md:33`、`:34`、`jev_gateway/catalog.py:110`、`:731`。

模型配置以 `provider` 引用实例，`upstream_model` 保存上游原始名称；具体路由 ID 固定生成 `<provider>/<upstream_model>`，不由 transport type 改写。禁止把 endpoint、api_key 或 api_key_env 放在模型条目上。裸模型名称不可作为已有具体模型查询契约。证据：`jev_gateway/catalog.py:800`、`:804`、`:835`；`docs/models-config.md:55`；`tests/test_catalog.py:92`。

Provider 字段白名单和 credential 约束：拒绝 JSON literal `api_key`、未知字段、reserved completion params；secret-like params/headers 必须用 `param_env`，`api_key_env` 只解析指定环境变量，缺失或空值导致 validation 失败。OpenAI type 当前要求 api_base 和 api_key_env。证据：`jev_gateway/catalog.py:705`、`:715`、`:722`、`:741`、`:756`、`:783`。

Model 字段包含 tags、priority、quality、context_window、max_output_tokens、capabilities、cost；未知字段拒绝。tags 必须是无重复非空 scoped strings，不能首尾 `/` 或包含 `//`。解析默认 priority 为 `index * 10`、quality 为 0.5、价格为 0，窗口限制可为空。capabilities 默认 tools/vision/json_mode/temperature 为 true，reasoning 为 false、reasoning_effort 为空。证据：`jev_gateway/catalog.py:86`、`:102`、`:811`、`:843`、`:858`、`:880`。这些默认值不代表经过能力核验，发现导入直接依赖默认值会高估能力或低估价格。

Catalog 当前要求非空 providers、非空 models、显式 strategies，验证链要求 task_aware。只保存尚未发现模型的全新空配置，需要评估是否与该契约冲突。证据：`jev_gateway/catalog.py:1542` 至 `:1587`。

## 存储、配置 API 与密钥生命周期

HTTP 已有 GET/validate/PUT/DELETE `/v1/routing/configuration` 和 POST `/v1/routing/reload`。GET 返回 write availability、baseline/overlay 状态、config_hash、questions/rules/fallback/labels/models/warnings。validate 构建完整候选，不交换运行时。证据：`jev_gateway/gateway.py:761`、`:833`、`:855`、`:874`、`:922`、`:973`。

Overlay 白名单仅 version/strategy/questions/rules/fallback/models；model override 仅 tags/priority。禁止 provider、decision、gateway、storage 和 credential 字段，不能用该接口创建模型。PUT 原子写 overlay，reload 失败恢复之前 overlay bytes、catalog/source；DELETE 同样回滚。证据：`jev_gateway/routing_overlay.py:34`、`:114`、`:236`；`jev_gateway/gateway.py:886`、`:922`；`.trellis/spec/backend/dashboard-routing-config.md:82`。测试要求 baseline models.json 字节不变：`tests/test_gateway.py:1958`、`:1963`、`:1978`。

Gateway 配置了 key 时使用 constant-time Bearer 比较；配置写入还强制要求 gateway.api_key_env，否则 403 config_writes_disabled。已有 auth gate 不应因新 catalog/secret/discovery 接口而放宽。证据：`jev_gateway/gateway.py:390`、`:711`。reload_lock 保护配置相关操作；reload 校验 strategy registry 和 storage 变化，可能返回 invalid_configuration、restart_required 或 storage_unavailable。证据：`jev_gateway/gateway.py:426`、`:980`、`:1036`；`jev_gateway/decision.py:431`。

CLI 原子 catalog 写入为 validate、同目录 temporary file、fsync、backup、os.replace；没有跨 catalog/.env 的事务。add_provider 先 upsert_env 后写 catalog；catalog 写失败可能留下 secret。它为新 key reference 验证临时 sentinel，并临时替换全局 os.environ；HTTP 并发复用前需移除这种进程级环境改写。证据：`jev_gateway/cli/config_ops.py:29`；`jev_gateway/cli/providers.py:82` 至 `:108`。

CLI login/logout 只改 `.env`，logout 不撤销上游 key、也不移除 shell export；login 返回 reload_required。启动/reload 从 models 文件邻近 `.env` 以 override=True 加载。删除 env 行后已加载的进程变量是否清除，需要专门验证，不能假设 logout 后立即失效。证据：`jev_gateway/cli/providers.py:111`、`:124`；`jev_gateway/cli/config_ops.py:48`；`jev_gateway/gateway.py:180`、`:980`。

secret 写入只接受 stdin/env/prompt，拒绝空值、换行和 NUL，文件与备份要求 0600。输出仅 key name/presence；provider params 对外以配置标记替代，不能直接返回原始 dict。证据：`jev_gateway/cli/secrets.py:15`、`:38`、`:80`；`jev_gateway/cli/config_ops.py:57`、`:61`、`:80`；`jev_gateway/cli/providers.py:132`；`.trellis/spec/backend/cli-lifecycle.md:50`。共享 api_key_env 的 provider 删除/改名时要保留引用者，不能将 key 删除与 provider 删除默认绑定。

## LLM 与 Decision 扩展点

LLM completion_payload 从 model profile 注入 provider params、api_base、api_key；传给 LiteLLM 的 model 为 `<provider_type>/<upstream_model>`，外部 catalog ID 与 transport ID 是两个不同用途的字符串。实际调用为 completion(**payload)。证据：`jev_gateway/gateway.py:218`、`:240`、`:248`、`:1239`、`:1274`。

`jev_gateway/provider` 当前是 history adapter（deepseek 或 generic），没有 discovery 责任。新增发现适配需要独立的协议能力边界，不能把已有 history adapter 当作模型列表 API 的实现。证据：`jev_gateway/provider/__init__.py:8`、`:13`。

decision schema 是 `{enabled, default_provider, timeout_seconds, providers}`，provider 字段是 id/protocol/api_base/api_key_env/可选 model。protocol registry 目前仅 system_one。default provider 优先，其余按顺序 failover；调用时读取 env，缺 key 或 transport/response 错误跳过。System One 对完整 api_base POST `{state, questions}`，可带 model 和 Bearer header。证据：`jev_gateway/catalog.py:287`、`:1256` 至 `:1314`；`jev_gateway/strategy/decision_provider/__init__.py:49`、`:57`、`:74`；`jev_gateway/strategy/decision_provider/system_one.py:25`、`:28`。

Decision 服务的 model 参数不等于 LLM catalog model。其 URL 当前是完整 endpoint；不能对它拼接 `/models`。新增协议需要 schema registry、adapter 和 typed answer normalization/failover 测试，不应仅新增 preset。相关规范：`.trellis/spec/backend/decision-providers.md:5`、`:36`、`:49`。

## 发现结果与策略契约

矩阵 select 只允许 label、legacy tier、selection；label 必须存在于 policy，selection 属于 cheapest_adequate/quality_first/balanced。标签先用明确 models 列表，否则用 scoped tag 匹配；不能 models/tag 混用，也不能指向不存在或无匹配模型的标签。证据：`jev_gateway/strategy/matrix.py:122`、`:131`、`:137`；`jev_gateway/catalog.py:615`；`jev_gateway/strategy/policy.py:322`。

候选排序依赖每百万 token 成本、quality 和 priority，balanced 还做成本/质量归一化；模型限制和能力是适配判断的重要输入。证据：`jev_gateway/catalog.py:173`；`jev_gateway/strategy/policy.py:392` 至 `:413`。手动模型路由与缓存 continuation 跳过 decision call：`jev_gateway/strategy/matrix.py:48`。

发现到的 upstream ID 必须保持原字符串，绑定 provider 身份后才生成 qualified ID。只有经过 catalog validation 并导入的模型可以进入现有选择器；未导入结果应明确隔离。任务已有要求：父任务 PRD 的 AC3 / AC4。

通用 GET models 通常只能提供身份/归属等 listing 信息。不能从名称、创建时间或 owned_by 可靠推断 tools、vision、JSON、reasoning/effort、temperature、上下文和输出上限、token 价格、quality、priority、路由标签、当前账户权限或实际可调用性。某些 provider 提供附加 metadata 时，应保留来源、时间和 known/unknown 状态，不能把未提供字段自动当 false 或 true。列得出模型也不保证 completion 协议、region、deployment 或权限正确。这里是契约分析，本轮没有验证任何真实 provider 响应。

## GET Models 的认证与 URL 风险

当前 normalize_api_base 仅 rstrip('/')；没有 scheme、host、private IP、localhost、path 或 redirect 校验。Decision URL 只做 required text。证据：`jev_gateway/config.py:19`；`jev_gateway/catalog.py:771`、`:1292`。这些是当前配置验证边界；项目尚无 discovery，下面风险针对拟新增网络请求。

- Provider type 不能统一等同 OpenAI GET `<base>/models`：native provider 可能使用 x-api-key、版本头、region/project/deployment、SDK credentials 或签名，而非 Bearer。completion 的 params/param_env 不能全部复制到 discovery headers/query。
- base 可能已有 `/v1`、路径前缀或完整 endpoint。通用 urljoin(base, '/models') 会丢前缀，直接拼接可能重复路径。应由 transport/discovery adapter 定义路径与认证。
- 服务器对用户配置 URL 请求会涉及 SSRF、DNS rebinding、内网和云 metadata。需要明确 localhost/私网是否支持及其授权边界；本轮不替用户决定该产品支持范围。
- 默认禁止自动跨 origin redirect 携带 credential，避免把 api_key 放 URL/query。对 scheme、URL userinfo、fragment、embedded token 和日志输出做限制；TLS 校验不能为兼容性默认关闭。
- discovery 应有独立 timeout、响应体大小/模型数/分页上限、取消与速率限制。远端分页链接也必须重新校验 origin，不能直接跟随任意 URL。
- 上游错误正文、请求 headers、原始 URL query 可能含 secret。返回分类错误和可排查 ID，遵守现有 credential-safe error 规范，不回传原始异常/正文。

## 建议 API 契约（供设计评审）

以下是后端契约建议，尚未选定 URL 或导入交互方式。

1. 将 catalog mutation/validation、secret resolution/write、runtime activation 提炼为 CLI/HTTP 共用服务；保留 baseline 与 routing overlay 的职责。统一存储底座不要求把两个文档机械合并。
2. Provider catalog read 只返回 id、kind（llm/decision）、transport/protocol、非 secret settings、credential reference/presence、revision。preset 是填表模板，保存后的 provider 仍通过同一 schema；品牌 id 与用户实例 id 分开。
3. Discovery command 以已有 provider id 和 expected revision 请求，服务端解析 credential；响应含 provider_id、protocol、fetched_at、discovery_supported、items 的 upstream_model/qualified_id/imported 状态、可验证 metadata 与 provenance/warnings。不得返回 credential 或可执行的原始 upstream payload。
4. Import command 以 provider_id、expected revision、模型条目与明确 routing metadata 写入完整候选；处理重复 qualified ID、provider 被删除/改协议、stale discovery、overlay 旧引用和不完整字段。返回 validation errors/diff、新 revision、activation/reload 状态。发现本身不修改 catalog。
5. Secret update 单独 write-only，区分 keep/set/clear，空字符串不能兼作 keep；在 gateway key 和现有写权限之外评估管理权限与 CSRF/CORS。不得用 GET 接收 secret。
6. Catalog/env/overlay/runtime 变化要给出失败恢复契约，跨进程文件写还需锁或 revision compare-and-swap；现有 threading reload_lock 不提供 CLI 与 gateway 跨进程互斥。

用户随后确认采用搜索/勾选后显式导入，支持全选；自动导入全部不在选定流程内。之后确认新模型导入前补齐/显式确认必要能力和价格元数据，并要求研究在线数据源、允许优化模型存储。发现 TTL、离线缓存和网络请求限制在后续技术设计中给出，不增加隐式目录写入或改变旧配置默认语义。

## 测试与 Spec 约束

主要规范：`backend/dashboard-routing-config.md:82`、`:508`（overlay/安全/存储）；`backend/decision-providers.md:5`、`:49`（协议/无真实外部调用）；`backend/cli-lifecycle.md:50`（secret）；`backend/quality-guidelines.md:96`（fake LiteLLM）；另需加载 `backend/error-handling.md`、`backend/logging-guidelines.md` 的脱敏规则。以上路径均相对 `.trellis/spec/`。

已有测试证据：`tests/test_catalog.py:92`、`:325`、`:475`；`tests/test_cli_providers.py:25`；`tests/test_cli_review_regressions.py:29`、`:95`；`tests/test_gateway.py:1949`、`:1983`、`:2039`、`:2094`、`:2425`、`:2437`；`tests/test_decision_provider.py:23`、`:60`、`:121`。

后续新增 mock 测试应覆盖：不同协议认证与路径、unsupported discovery、分页/超时/体积限制、重定向和内网策略、恶意模型名/重复 ID、未知 metadata、发现不产生写入、导入冲突、revision 并发、跨文件失败回滚、secret 更新后 reload/logout、共享 env reference、不泄漏 keys/params/errors、现有 overlay 与 selector 行为不变。测试不得调用真实 provider。

```bash
uv run pytest -q tests/test_catalog.py tests/test_cli_providers.py tests/test_cli_review_regressions.py tests/test_routing_overlay.py tests/test_decision_provider.py tests/test_strategy_package.py
uv run pytest -q tests/test_gateway.py -k "configuration or reload or upstream_error or model_list"
uv run pytest -q
uvx pyright
uv build
```

全量命令来源：`README.md:203` 至 `:205`；CLI entry points：`pyproject.toml:17`。

## 根目录 DESIGN.md 可提炼的事实

研究时未找到根目录 `DESIGN.md`，本研究 agent 未创建或修改它；父会话随后已创建源码设计基线。后续可从本文件提炼配置服务边界、credential 生命周期、provider instance/brand/transport 区分、baseline+overlay 合成、discovery/import 分离、qualified IDs、协议 adapter 与 runtime activation 契约。运行时为 FastAPI create_app 与 RoutingEngine，启动构建 MemorySessionStore/record store：`jev_gateway/gateway.py:176`、`:422`。不应将前端布局、品牌 logo 来源或用户未决定的导入默认行为写成已确认设计。

## 尚待验证的技术风险

- 保存未配 key 或零模型 provider 的管理态与当前严格运行时 catalog validation 如何共存。
- CLI/HTTP 共用事务、revision、跨进程锁，以及 catalog/env 写入失败的恢复策略。
- overlay tags/priority 对新导入 baseline metadata 的优先级；删除/改名模型对显式 policy models 和缓存 continuation 的影响。
- logout 后进程环境残留、多个 provider 共享 key、decision call-time env 与 LLM catalog-resolved key 的刷新差异。
- 发现协议覆盖范围，provider params/param_env 中哪些是 discovery 必需而安全的配置。
- localhost/私网支持边界、TLS/redirect/DNS 策略和 remote admin 的授权。
- metadata unknown 状态是否需要 schema 演进，以及旧默认 true capabilities/zero prices 的兼容处理。
- `config_hash` 是否足以作管理 revision（当前 GET 暴露 hash 不等于已提供 conditional-write 契约）。
