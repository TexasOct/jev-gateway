# HTTP API 与 provider 边界移植估算

调研范围：当前工作区的 HTTP 入口、请求验证与错误、安全、SSE、聊天上游传输、System One 决策服务传输、DeepSeek 推理和跨 provider assistant 续接。依据静态源码、已有测试及同任务的 `gateway-inventory.md`、`dependency-mapping.md`、`rust-path.md`；没有编译候选实现、访问真实上游或运行差分测试。行号以本次工作区为准。候选依赖未安装或锁版；外部资料只证明注明的能力，不能证明与本项目或 LiteLLM 等价。

## 估算的 provider 范围

`models.json:272-283` 配置了 `deepseek` (`https://api.deepseek.com/v1`) 与 `openai` (`https://claude.texasoct.tech/v1`) 两种 LiteLLM type，未在这两项声明 `params`/`param_env`。后者是自定义 OpenAI-compatible 地址，不能称作对 OpenAI 公共 API 的实测。既有只读事故调研记录了这一地址的 `gpt-6-luna` 流式成功与超时、`gpt-6-sol`/`gpt-6-astra` 成功，以及两个 `deepseek-flash` 成功 outcome；这是有限运行证据，未保存上游完整 wire/工具参数，也不能证明所有模型/参数已验证（`.trellis/tasks/archive/2026-09/09-27-upstream-stream-timeout/research/runtime-evidence.md:20-40,48-54`）。仓库的 DeepSeek 推理及 SSE 测试主要模拟 LiteLLM，另有一个调用 LiteLLM 内部转换器的测试（`tests/test_gateway.py:1808-1838`; `tests/test_provider_adapters.py:81-100,117-130`）。

下表基数只按这两类配置路径及现有测试明确覆盖的参数做受控验收，不把任意 LiteLLM provider、云原生认证、多模态和未见于实际配置的 `params` 算作已完成兼容。对于 `tools`、`response_format`、`reasoning_effort`、`max_completion_tokens`、额外 JSON 字段，先比对当前测试所覆盖的入口和转发，再用假上游/获授权真实端点核对支持性；不存在生产 wire 样本的组合标为待验证（`jev_gateway/gateway.py:106-125,218-268,1129-1154`; `tests/test_gateway.py:2849-2934`）。不能从一次成功 outcome 推断上述参数都被实际使用。

## 现有合同及候选

| 内部子项 | TypeScript/Node.js 候选与必须显式实现的兼容工作 | Rust 候选与必须显式实现的兼容工作 | 源码与验收依据 |
| --- | --- | --- | --- |
| HTTP 路由及响应 | Hono + `@hono/node-server`，或 Fastify；选择其一并实现现有路径/方法、状态码、查询参数规则、`X-JEV-*` 响应头及 `echo_requested_model`。Fastify 的 JSON Schema/Ajv、序列化默认值不可直接当成 FastAPI。 | `axum` + `serde_json::Value`、自定义响应/错误层；路由和响应头按样本比对。静态/dashboard 页面服务及配置业务逻辑属其他领域，此处只估调用边界集成，不重复其实现。 | `jev_gateway/gateway.py:564-630,761-975,1064-1105,1327-1328,1434-1438`; `tests/test_gateway.py:2708-2780` |
| 请求验证及错误 | 显式保留聊天 JSON 未知字段（可试 Zod `looseObject`，或独立 validator）；区分缺失/null、空字符串、非空 messages、默认 `stream=false`，仿 Pydantic 首个错误的 `param` 与 400 body。未知模型 404，非法 strategy 400，路径 404 统一 envelope；JSON 格式错误先形成拒绝证据，再回 400。不能用框架默认 422/错误文本。 | `serde_json::Value` 保留附加字段，手写校验或辅助 validator；重现 JSON 类型、缺失/null、首个字段定位及 OpenAI 四字段错误封装。不要用严格结构体反序列化吞掉透传参数。 | `jev_gateway/gateway.py:106-132,449-549,551-555,1104-1180`; `tests/test_gateway.py:676-714,2042-2093` |
| 安全与错误边界 | 全 Bearer header 常量时间比对；无密钥时读操作开放、配置写禁止；保留 `WWW-Authenticate`，安全 502、上游错误类型白名单和日志/证据脱敏。Node 密码比较要自行处理长度不等再比较，不能直接用普通字符串相等。 | 使用常量时间字节比较且处理不同长度；同样复制 auth/write guard、安全错误和脱敏。避免把 `Debug`/error chain 原样输出到 HTTP/日志。 | `jev_gateway/gateway.py:391-420,711-725,1250-1321,1358-1379`; `tests/test_gateway.py:729-849,2093-2110`; `jev_gateway/catalog.py:778-849` |
| SSE 与生命周期 | Web Streams/Node response 或 Hono `streamSSE` 候选；若 helper 改动帧格式，改用原始字节写入。每个 chunk 是 `data: <JSON>\n\n`，正常 EOF 才发 `[DONE]`。证明背压、客户端取消、上游迭代失败、headers 已发时不能再改 502，活动及 outcome 清理恰好一次；不得预设 SDK 自动取消上游。 | `axum::response::sse` 或原始 `Body` + `reqwest` body stream；同样检验帧字节、drop/取消、背压和异常路径。`reqwest` 的 `bytes_stream` 要启用 `stream` feature；`axum::Sse` 不保证本项目的逐字节格式。 | `jev_gateway/gateway.py:371-388,1274-1276,1337-1432`; `tests/test_gateway.py:1808-1838,1928-1955,1979-2001` |
| 聊天 provider transport | 定义本项目的 transport/归一化边界；对 `openai` type 的自定义 base URL 可试 `openai` 官方 Node SDK或直接 `fetch`，对 DeepSeek 可试兼容端点，但必须抓取出站 body/headers 和返回 chunk 对照 LiteLLM。显式处理 SDK 默认重试、超时、额外字段、代理路径、usage/null、模型回显和安全错误；不用 SDK 的 provider 清单代替 LiteLLM。 | `reqwest` 自建 OpenAI-compatible adapter，`async-openai` 仅作候选。显式配置连接/总时长/逐次读取超时与重试，并逐字段映射请求和响应。DeepSeek 声称提供兼容接口，不等于本项目 LiteLLM payload/推理语义自动等价。 | `jev_gateway/catalog.py:794-859,1774-1780`; `jev_gateway/gateway.py:218-250,334-345,1241-1276,1434-1438`; `tests/test_gateway.py:237-268,2708-2780` |
| 推理与跨 provider 续接 | 维持 `reasoning_effort` 的决策/透传/删除顺序；对 OpenAI-compatible/DeepSeek 的 `reasoning_content` 做明确映射。使用与 Python 相同的字段选择、排序/紧凑 UTF-8 JSON 与 SHA-256 key；匹配重复 assistant 消息的最新出现，拼接流中的 content/tool_calls/function_call。DeepSeek 原 trace 回放，已知异源历史放单个空格，未知历史保持缺失。 | `serde_json` 序列化并非 Python `sort_keys=True, ensure_ascii=False, separators` 的自动等价；为 key 写兼容编码器与 golden hash。其余续接、流 capture 和 DeepSeek 处理同左。持久化表结构、写入队列及通用会话管理成本归存储/会话领域，此处只计 continuation 的读写接口接入与 payload 语义。 | `jev_gateway/provider/base.py:49-71,160-232,243-348`; `jev_gateway/provider/deepseek.py:23-71,92-114`; `tests/test_provider_adapters.py:56-147,358-408`; `jev_gateway/gateway.py:253-268` |
| System One 决策上游 HTTP | Node `fetch` + AbortSignal，主动检查非 2xx、秒转毫秒、校验 `{answers:{key:{choice}}}`，保留无效答案、网络失败和无 key 时的逐 provider 降级。与聊天 LiteLLM transport 分开。 | `reqwest::Client`、逐调用 deadline、`error_for_status`/类型校验；保持 failover 顺序，不得把网络异常或响应 JSON 当成有效分类答案。 | `jev_gateway/decision_provider/system_one.py:17-47`; `jev_gateway/decision_provider/__init__.py:40-77`; `tests/test_decision_provider.py:21-104` |

请求 intake、outcome 与 continuation 的调用顺序属该领域的接口验收，SQLite schema/WAL/队列/迁移归存储估算；CLI 健康检查、秘钥文件、安装器、前端/dashboard UI 也不在此表。配置 overlay 的写文件/回滚归配置领域；这里只核对 HTTP 的鉴权、状态码、响应和调用时序。请求在未知模型/策略之前记录（`jev_gateway/gateway.py:1135-1157`），validation handler 在 400 前记录无效 body（`:469-549`），移植方须向存储层提供这两个钩子。

## 人日区间

一名熟悉目标语言及 HTTP/流协议的工程师，按 8 小时净开发日；已有 Python 服务可做参考、可控假上游、两个配置类型的测试凭证与存储/路由接口已就绪。数字含各子项局部测试、review 与修正，不含真实生产 provider 矩阵调查、新云原生协议、存储/CLI/发布和别的领域全链路验收；按顺序人日相加，不能直接换算日历工期。下面是规划判断，不是实测效率或报价。

| 子项 | TypeScript/Node.js | Rust | 计量边界 |
| --- | ---: | ---: | --- |
| HTTP 路由、头与序列化 | 4 至 7 | 5 至 9 | 搭建入口、响应差分；不实现配置/策略业务 |
| 验证、错误 envelope 与无效请求钩子 | 4 至 7 | 5 至 9 | 未知键、400/404、首错字段、JSON 失败 |
| 鉴权、安全错误与脱敏接线 | 3 至 6 | 4 至 7 | 不计完整证据库或全局日志系统 |
| SSE 编码、背压、取消及清理 | 7 至 13 | 9 至 16 | 正常/半途失败/断连竞态 |
| 限定范围聊天 transport/归一化 | 10 至 19 | 14 至 25 | OpenAI-compatible 自定义地址与 DeepSeek，逐参数比对 |
| 推理、assistant capture 与跨 provider 续接 | 7 至 13 | 9 至 16 | 包括同消息 hash、流式工具片段、重启读取接口；不计存储实现 |
| System One 上游薄适配 | 2 至 4 | 3 至 5 | 独立 HTTP client、超时/非 2xx/答案校验/降级 |
| 本领域协议差分、故障注入与真实端点有限验收 | 5 至 9 | 7 至 11 | 跨子项 golden/取消/密钥泄漏检查，不重复局部单测 |
| **本领域合计** | **42 至 78** | **56 至 98** | 仅上述限定范围；与 `rust-path.md` 全网关估算不是可相加的新总数 |

Rust `rust-path.md` 的全网关表把 provider/续接与 HTTP/SSE 分成两个较宽模块，并另列 8 至 14 天的全域行为样本、16 至 28 天的全链路验收。本表重分了本领域的兼容工作及其局部差分，不能把两个表逐行叠加；总体汇总时需把共用 golden 和集成测试去重。TypeScript 依赖映射见 `dependency-mapping.md`，Rust 整体边界见 `rust-path.md`，本表不将其中的 SQLite、配置解析、CLI 或交付数字复制到本领域。

## 验收样本与风险

1. 用相同匿名 JSON 发送缺失 model、空 model、空 messages、无 user turn、非法 JSON、未知额外参数、null/缺失选项、未知模型/策略、query `strategy`；保存 status、四字段错误体、`param`、是否记录 intake，禁止保存密钥和用户原文。参考 `tests/test_gateway.py:676-714,2042-2093` 与 `jev_gateway/gateway.py:469-555,1104-1180`。
2. 使用受控假上游分别返回非流 dict/含 usage、流式 content/tool_call/function_call/reasoning delta、首 chunk 前抛错、已发 chunk 后抛错、下游第一块发送失败与客户端取消；比较请求 body/headers、响应头/模型回显、逐块 JSON/SSE `[DONE]`、活动和 outcome。`tests/test_gateway.py:729-849,1808-1838,1928-1955,2708-2780` 是 Python 参考，不是厂商 wire 证明。客户端断连时 Python 是否始终完成续接持久化还要单独实测，不能由 `finally` 推断。
3. 同 session 回放 DeepSeek 到 DeepSeek、OpenAI-compatible 到 DeepSeek、未知 assistant、重复同文不同 reasoning、工具调用拆片及重启读取；比较 payload 与消息 key 的 Python golden。`tests/test_provider_adapters.py:56-147,358-408`，`jev_gateway/provider/base.py:49-71,200-232`。重启场景需存储领域提供同一接口的 fixture，本表不实现数据库。
4. 对已获授权的实际配置端点取最小脱敏样本：普通/流、reasoning、工具、429/5xx、超时，分别记录请求与响应字段存在性、首字节/末字节、重试次数、取消后的连接关闭。不能把 `openai` provider id 当作 OpenAI 公共 API，也不要以成功 outcome 声称 DeepSeek reasoning wire 已验。先核实代理策略与使用条款；不用生产密钥或内容写 golden。当前 timeout 事故只有 outcome 时间，没有字节时序（`.trellis/tasks/archive/2026-09/09-27-upstream-stream-timeout/research/runtime-evidence.md:16-28,48-54`）。

风险集中在 SDK 隐含重试/超时改变上游请求次数、未知参数被验证器剔除、流结束与取消的竞态、Python/JS/Rust JSON 编码差异使续接 key 不匹配，以及 provider 原始异常经框架日志泄漏。TypeScript SDK README 记载默认可重试两次且默认 10 分钟 timeout；`reqwest` 当前文档记载默认没有总超时和 read timeout，而 read timeout 是逐次读取重置。这些默认行为均须显式设定并与锁定的 LiteLLM 路径差分，不能以本次查阅直接断言 Python 的实际生效值。安全测试已有不向 HTTP、日志和 SQLite 泄漏上游异常文本的例子（`tests/test_gateway.py:729-849`）。

## 完整 LiteLLM provider 面：单列未知增量

当前 `catalog.py` 用 LiteLLM `provider_list` 接受 type，又支持任意合规 `params`/`param_env`（`jev_gateway/catalog.py:794-859`）；其潜在配置面远大于 `models.json` 两项。LiteLLM 官方 provider 列表有云原生、实验室、兼容端点等不同协议。`openai` Node SDK、`async-openai` 或一个 OpenAI-compatible HTTP adapter 都没有全量等价声明。若要求原配置可接受的所有 provider/type/参数及行为 1:1，**增量人日和总工期均未知**，不能用上表的固定百分点扩展。保留 Python LiteLLM 作为桥接服务可以另作方案，但须单列部署、密钥传递、跨进程流取消和故障成本，而且不再是纯 TS/Rust 移植。

发现步骤：① 用不含密钥值的配置/运行证据汇总实际 `type`、base URL 类别、模型、`params` 键、`param_env` 键、调用特性（流/工具/推理/媒体）及流量；② 固定比较基线为本仓库锁定 LiteLLM 版本 `uv.lock:991-1010`，冻结其可接受 type，按兼容协议、原生签名/凭证链、响应/流差异分组；③ 为每个实际使用的协议组取得授权测试账户和假上游记录，检验认证、路径、参数、错误、重试、SSE、推理回放；④ 逐组报增量与不支持项，由产品决定缩小支持面、分期实现或临时桥接。没有这些资料之前，所谓“全面覆盖”没有可审核的分母。

## 外部资料核验范围

查阅官方页面（本次查阅；未锁候选版本、未验证许可/目标运行时/上游互通）：[LiteLLM provider 清单](https://docs.litellm.ai/docs/providers)；[DeepSeek API 首页](https://api-docs.deepseek.com/)仅称其格式兼容 OpenAI/Anthropic，未证明推理回放细节；[OpenAI Node SDK README](https://github.com/openai/openai-node/blob/master/README.md)记载流式迭代、默认重试和超时，base URL/extra body 在目标 SDK 版本还须核对；[Hono Node adapter](https://hono.dev/docs/getting-started/nodejs)及[SSE helper](https://hono.dev/docs/helpers/streaming)说明 Node 运行及 `stream.aborted`，不保证本项目的原始 SSE 字节；[Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)记载 JSON Schema/Ajv 和 serializer；[Node globals](https://nodejs.org/api/globals.html)记载 fetch 基于 undici、`AbortSignal.timeout` 毫秒单位；[axum SSE](https://docs.rs/axum/latest/axum/response/sse/index.html)、[reqwest response](https://docs.rs/reqwest/latest/reqwest/struct.Response.html)及[reqwest ClientBuilder](https://docs.rs/reqwest/latest/reqwest/struct.ClientBuilder.html)分别证实 SSE API、`bytes_stream` 需 `stream` feature、timeout 配置语义；[async-openai](https://docs.rs/async-openai/latest/async_openai/)声明主要范围为官方 OpenAI API，同时可配置兼容端点。Zod 的具体 `looseObject` API、本项目 SDK 目标版本及其 DeepSeek reasoning/extra body 支持、各 crate 版本/MSRV/许可，**均未在本次核实**，不得据此定版或声称兼容。
