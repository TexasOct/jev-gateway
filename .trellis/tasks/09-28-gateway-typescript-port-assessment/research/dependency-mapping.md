# Python 依赖与 TypeScript/Node 替代研究

查询日期：2026-09-28。范围是当前工作区 `jev_gateway`、`pyproject.toml` 与 `uv.lock` 的静态阅读；没有安装、发请求到上游、运行兼容测试或修改产品代码。下文的版本指本仓库锁定版本，不声称是外部最新版本。Node 候选仅用于评估，未进入项目依赖。

## 直接依赖及实际使用

`pyproject.toml:9-15` 声明 5 个运行时直接依赖；`pyproject.toml:33-36` 另声明一个开发依赖 `pytest>=8.0`。`uv.lock:787-814` 的根包依赖条目与之吻合。解析 `uv.lock` 的 `[[package]]` 得 68 个包，包含根包与开发依赖，不能当作 68 个运行时依赖。以下版本来自锁文件，约束来自项目清单。

| Python 依赖 | 约束；锁版本；代码实际使用 | TypeScript/Node 候选与保留边界 | 风险 / 优先级 |
| --- | --- | --- | --- |
| `litellm` | `>=1.82.4`；`1.102.0`（`uv.lock:991-1010`）。`provider_list` 校验 provider type（`jev_gateway/catalog.py:15,778-798`）；请求内引入 `completion`，生成 provider 前缀及 transport kwargs，再调用同步 `completion(**payload)`（`jev_gateway/gateway.py:218-250,1239-1275`）；设置日志抑制（`jev_gateway/logging/config.py:255-257`）。 | 优先做独立 provider transport/normalize 接口，对当前配置 provider 做分协议适配；OpenAI 兼容端点可试官方 `openai` Node SDK 或 AI SDK 的 OpenAI Compatible provider；原生非 OpenAI 协议用相应 SDK/自建 adapter。若追求原有完整 provider 面，评估暂留 Python LiteLLM 作为隔离的上游桥接服务。两种路径都需要契约测试；不能把任一 TS 包等同于 LiteLLM。 | **P0，最高风险**：provider 枚举、参数映射、错误类型、流块、原生协议、认证、reasoning 续接和模型名回显都参与外部行为。 |
| `fastapi` | `>=0.115`；`0.141.1`（`uv.lock:457-466`）。`FastAPI`、路由、Header、异常处理、JSON/SSE 响应（`jev_gateway/gateway.py:21-24,444-470,1104-1110,1393-1404`）；dashboard 的 `APIRouter`、`Body`、`Query`、文件响应（`jev_gateway/dashboard.py:20-22`）。 | Hono + Node adapter、Fastify 或 Node HTTP 均可做路由层；优先用能够显式控制 HTTP 状态、header、SSE、静态资产与退出生命周期的方案。Hono 官方有 Node adapter、SSE 和验证示例，Fastify 官方基于 JSON Schema/Ajv 验证。框架选择之后还需自己复制本项目的错误与记录行为。 | **P1**：不能将默认 422/404/500 响应或流关闭行为当作兼容；需重放请求。 |
| `httpx` | `>=0.27`；`0.28.1`（`uv.lock:721-730`）。System One 决策同步 POST、`raise_for_status()`、JSON 解析（`jev_gateway/decision_provider/system_one.py:17-46`），捕获 `httpx.HTTPError` 后换源（`jev_gateway/decision_provider/__init__.py:64-76`）；CLI 健康检查 GET（`jev_gateway/cli/health.py:11-22`）。 | Node 内建 `fetch` + AbortSignal/显式响应状态检查与 JSON 解析可覆盖这里可见的请求；若复杂传输配置出现，再比较 HTTP 客户端。仅在确认错误/超时边界后替换。 | **P1**：`fetch` 的非 2xx 处理、超时/中止异常、连接错误及 JSON 类型检验须显式复刻；不要假设 `fetch` 会执行 `raise_for_status()`。 |
| `python-dotenv` | `>=1.0`；`1.2.3`（`uv.lock:1654-1660`）。网关按模型文件旁 `.env` 加载，且 `override=True`（`jev_gateway/gateway.py:176-181`）；CLI 同样加载和读取 `dotenv_values`（`jev_gateway/cli/config_ops.py:53-54`、`jev_gateway/cli/providers.py:84-97,139-145`）。秘密文件的写入/权限操作另由本地代码实现（`jev_gateway/cli/secrets.py:38-85`）。 | Node 内建环境文件能力或 `dotenv` 候选；应按实际版本文档核实解析规则，并由应用实现“指定文件覆盖现有环境”的兼容逻辑与只读解析。密钥原子写入/0600 权限仍需自研并测文件系统差异。 | **P1**：加载顺序和覆盖优先级影响路由密钥，CLI 的临时环境哨兵校验不能遗漏。内建环境文件 API 的跨 Node 版本行为待验证。 |
| `uvicorn` | `>=0.30`；`0.53.0`（`uv.lock:2379-2386`）。入口绑定 host/port、日志级别、访问日志和格式（`jev_gateway/gateway.py:1444-1463`）；生命周期清空活动流（`jev_gateway/gateway.py:428-444`）。 | Node HTTP 服务（如 Hono Node adapter/Fastify）加明确 startup/shutdown 与日志配置；并维护 CLI 入口和静态资源打包。 | **P2**：日志格式、连接断开、优雅退出需要按进程测试。 |
| `pytest`（开发） | `>=8.0`；`9.1.1`（`pyproject.toml:33-36`、`uv.lock:1624-1635`）。`tests/test_gateway.py`、`tests/test_decision_provider.py` 等 Python 测试使用。 | Node 原生 test runner 或 Vitest；现有前端已经使用 Vitest（`frontend/package.json:6-11,39-42`），但不能自动运行 Python 契约。迁移期并行保留 Python 测试作差异参照。 | **P2**：旧测试中的 monkeypatch/ASGI 行为须改写成协议级测试。 |

所有 5 个声明的运行时依赖均有直接 import 或入口调用，没有发现未使用的声明项。另有直接 import、未直接声明的 `pydantic`（`jev_gateway/gateway.py:25`）和 `starlette`（`jev_gateway/gateway.py:26`、`jev_gateway/dashboard.py:22`）；目前由 FastAPI 传递带入（`uv.lock:461-466`），这是打包边界风险。`tiktoken` 不在项目直接依赖，也没有在 `jev_gateway` 中 import；它是 LiteLLM 的直接传递依赖（`uv.lock:995-1010,2188-2195`）。本地计数是 CJK 字符计一、其余字符约四比一并使用 Python `round`（`jev_gateway/signals.py:186-192`）；换成 tokenizer 会改变信号、路由和记录，连 JS 的 `Math.round` 与 Python 舍入规则也需对照测试。

### 关键传递依赖的边界

`uv.lock:995-1010` 显示 LiteLLM 直接依赖 `aiohttp`、`boto3`、`httpx`、`openai`、`pydantic`、`pydantic-settings`、`tiktoken`、`tokenizers` 等 14 项；`uv.lock:461-466` 显示 FastAPI 依赖 Pydantic/Starlette；`uv.lock:725-730` 显示 HTTPX 依赖 AnyIO/HTTPcore 等。它们是 Python 实现的依赖图，不等于 Node 版都要逐个选同名库。若删去 LiteLLM，仅在明确需要相应供应商传输、tokenizer、schema 能力时引入 Node 包。`boto3` 所代表的 AWS 传输能力若在生产配置使用，不能因为 `models.json` 当前示例只列 deepseek/openai（`models.json:272-284`）就宣布无需支持；先盘点真实 provider type 与 `params`/`param_env`。

## 不能机械替换的语义

1. **provider type 与调用参数**：catalog 的 `type` 是 LiteLLM `provider_list` 成员，不是任意 base URL；`params` 与 `param_env` 有关键字段黑名单、环境变量解析及保密约束，`openai` 需要 `api_base` 与 key（`jev_gateway/catalog.py:778-859`）。请求保留额外字段，先由 provider adapter 改写历史，再剔除不支持的温度、应用 reasoning，最后用 `{type}/{upstream_model}`、`api_base`、`api_key` 调用（`jev_gateway/gateway.py:106-125,218-250`）。直接换 SDK 的模型列表、传参和错误处理无法保证相同。第一阶段做 provider 支持矩阵和逐 provider golden requests/response 测试；完整 LiteLLM provider 面如须保留，桥接 Python 或另行估算各协议成本。
2. **DeepSeek 与跨 provider 会话**：通用捕获器累计流中 content/tool_calls/function_call（`jev_gateway/provider/base.py:261-285`）；DeepSeek 读取 `reasoning_content`/`provider_specific_fields` 并针对已知跨 provider assistant 插入空格占位（`jev_gateway/provider/deepseek.py:23-71`）。这直接针对 LiteLLM DeepSeek 转换行为，回归测试调用其内部 `_fill_reasoning_content`（`tests/test_provider_adapters.py:81-100`）。Node 替代者如何处理 reasoning 内容、历史消息、流块要用真实协议验证，不能仅把 `reasoning_content` 字段照抄。
3. **决策 provider 是另一条上游链**：策略只依赖 `DecisionMaker` 的结构化选择契约（`jev_gateway/strategy/contracts.py:24-38`），catalog 目前只接受已注册 `system_one` 协议（`jev_gateway/catalog.py:1492-1516`、`jev_gateway/decision_provider/__init__.py:18-23`）。System One 的 POST `{state,questions,model?}` 和 `{answers:{key:{choice}}}` 严格检查见 `jev_gateway/decision_provider/system_one.py:17-47`。缺 key 跳过、首选 provider 排序、错误/无效答案顺序降级见 `jev_gateway/decision_provider/__init__.py:40-77`；分类器按本地 label 白名单验证，矩阵根据本地规则选择而非接受上游给定模型（`jev_gateway/strategy/classifier.py:24-63`、`jev_gateway/strategy/matrix.py:46-86`）。这里优先用薄的 Node HTTP adapter + 类型守卫，自研几十行协议映射比引入通用 LLM SDK 更贴近现有边界；但 timeout 与失败顺序须测试。
4. **FastAPI/Pydantic/Starlette**：Pydantic 的 `extra="allow"`、`model` 非空、`messages` 长度及可选字段影响入口校验（`jev_gateway/gateway.py:106-125`）。验证错误自定义映射成 HTTP 400 的 OpenAI 风格 envelope，且会记录错误原文/结构（`jev_gateway/gateway.py:469-549`）；404/HTTPException 也有全局 envelope（`jev_gateway/gateway.py:449-467`）。Zod 对象默认丢掉未知字段，候选应显式保留未知键并分别配置 catalog 的严格字段白名单，JSON Schema/Ajv 的强制类型转换也须校准。Python `model_dump(exclude_none=True, serialize_as_any=True)` 与 LiteLLM dict 回退（`jev_gateway/gateway.py:334-345`）不等于 `JSON.stringify` 的 `undefined`/`null` 行为；响应快照要覆盖缺失、null、usage 对象。
5. **HTTP 与流**：`sse_chunks` 把同步 LiteLLM iterator 包成精确 `data: JSON\n\n`，末尾 `[DONE]`（`jev_gateway/gateway.py:360-388`）；流失败时日志脱敏、记录 outcome、finish capture，已发送 header 的失败不能变成正常 502，外层 `StreamingResponse` 的 `finally` 补做活动清理（`jev_gateway/gateway.py:1337-1404`）。非流失败则 502 且不泄漏上游异常文本（`jev_gateway/gateway.py:1275-1320`）；非流结果可回显请求模型但记录原始上游模型（`jev_gateway/gateway.py:1408-1436`）。Node 的 AsyncIterable/Web Streams 必须明确背压、取消、半途异常、完成清理与记录时机。Hono 的 SSE helper 可用于发送事件，但要确认不会改变字节格式/事件字段；如果会，应使用更低层响应。
6. **HTTPX timeout / Node fetch**：`httpx.post(..., timeout=timeout_seconds)` 后调用 `raise_for_status()`（`jev_gateway/decision_provider/system_one.py:28-35`）；Node `AbortSignal.timeout` 使用毫秒，需从秒转换并主动判非 2xx。Node 官方文档确认全局 fetch 基于 undici、`AbortSignal.timeout(delay)` 的 delay 单位为毫秒；两者的实际错误分类、整体/分段超时语义对等性待验证。健康检查把 HTTP/JSON 失败收敛为 `reachable:false`（`jev_gateway/cli/health.py:15-22`）。
7. **配置环境与文件安全**：`load_dotenv(..., override=True)` 既在网关启动也在 CLI 使用（`jev_gateway/gateway.py:176-181`、`jev_gateway/cli/config_ops.py:53-54`），CLI 添加 provider 会临时构造环境进行校验（`jev_gateway/cli/providers.py:84-97`）；密钥写入采用临时文件、fsync、权限与替换（`jev_gateway/cli/secrets.py:68-85`）。不能把框架自带的 `.env` 读取或 `process.env` 的默认值当作完整等价。

## 候选路径与优先级

- **P0：上游协议边界先验收。** 列出生产使用的 provider types/参数，再以 `openai` Node SDK、AI SDK OpenAI Compatible provider 对 OpenAI 兼容端点分别做小规模验证；DeepSeek 的 reasoning、跨供应商历史、工具调用、stream、错误和超时各做样本。需要原生 Anthropic/AWS/Vertex 等时逐一选官方 SDK/transport，并对 `provider_list` 可配置集合给出明确缩减、桥接或增量实现的决定。LiteLLM 官方文档覆盖大量供应商、provider 指定和同步 stream；OpenAI Node SDK 官方文档有 `baseURL`/`fetch`/异步流示例；AI SDK 文档有 provider registry 与 OpenAI-compatible provider，但这些资料没有保证 1:1 替代。
- **P1：决策协议和 HTTP 契约。** `fetch` + `AbortSignal` 实现 System One 的薄层 adapter，外加本地 failover/type guards；选 Hono + Zod（显式 looseObject）或 Fastify + JSON Schema，并固化入口 400/404、错误 envelope、未识别字段、序列化以及 SSE 完成/断开行为。
- **P2：进程、CLI 与打包。** 明确 Node 最低版本和 dotenv 解析/覆盖策略，复核静态资源、密钥权限、健康检查、生命周期与日志。此处只提出候选，不表示已通过 Node 版本、授权、安全或压测评估。

验证样本可先从 `tests/test_gateway.py:237,523,729-813,1808-1838,1877,1928,2571-2589`、`tests/test_provider_adapters.py:81-123`、`tests/test_decision_provider.py:63-104`、`tests/test_catalog.py:112-124,181-232` 建立 Python 参考结果。现有 gateway 流测试用 monkeypatch 注入假 LiteLLM（`tests/test_gateway.py:1808-1821`）；它证明本地 SSE 合成，不证明真实供应商 wire 兼容。需要额外经受控测试密钥/假服务做双方 HTTP 请求、流、拒绝、取消和重试差异测试，生产配置及密钥不进入研究文件。

## 在线权威资料（查询于 2026-09-28）

以下链接用于确认候选能力，没有声称最新版本；若将来选包需在目标 Node 版本重新核验 API 与许可证。

- LiteLLM provider 清单及模型调用方式：https://docs.litellm.ai/docs/providers ；同步流接口：https://docs.litellm.ai/docs/completion/stream 。文档显示 provider 覆盖广、`stream=True` 产生可迭代流，未建立与任何 TS SDK 的等价性。
- OpenAI 官方 Node SDK：https://github.com/openai/openai-node 。README 记载可设置 `baseURL`/custom `fetch`，流用异步迭代；对自定义上游额外字段和 DeepSeek reasoning 的兼容仍待验证。
- Vercel AI SDK 官方 provider 管理：https://ai-sdk.dev/docs/ai-sdk-core/provider-management ；OpenAI 兼容供应商：https://ai-sdk.dev/providers/openai-compatible-providers 。支持 provider registry 和兼容端点配置；对全部 LiteLLM provider/参数/报错并无 1:1 承诺。
- Hono Node adapter：https://hono.dev/docs/getting-started/nodejs ；SSE：https://hono.dev/docs/helpers/streaming ；验证：https://hono.dev/docs/guides/validation 。验证页面未承诺与 Pydantic 相同的 unknown-field/错误映射。
- Fastify 验证和序列化：https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/ 。官方描述 JSON Schema/Ajv 与 fast-json-stringify，并提示 Ajv 错误结构与其他验证器之间需适配。
- Zod object 文档（搜索结果显示默认剔除额外键，`z.looseObject` 保留）：https://zod.dev/api?id=objects 。此页抓取遇到 2 MB 限制，**具体所选版本 API 与语义待验证**；不要据此锁定实现。
- Node 全局 fetch 与 `AbortSignal.timeout`：https://nodejs.org/api/globals.html 。官方记载 fetch 基于 undici，超时 delay 单位为毫秒；不构成与 HTTPX 异常/超时完全相同的证据。

待决问题：目标 Node 最低版本；生产需要的 LiteLLM provider 集合与特殊 `params`/`param_env`；能否阶段性保留 LiteLLM 桥接；候选 SDK 的目标版本/API、授权和实际协议行为。解决这些前不应把 provider 替换工作量当作确定数字。
