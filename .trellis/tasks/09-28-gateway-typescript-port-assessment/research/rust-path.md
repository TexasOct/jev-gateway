# Rust 原生网关路径评估

查询日期：2026-09-28。依据当前工作区源码、`pyproject.toml`、`uv.lock` 及同任务的 `research/gateway-inventory.md`、`research/dependency-mapping.md`。本次仅静态阅读及联网查官方文档，未编译 Rust、运行兼容测试或访问真实上游。下面的 Rust crate 都是候选，未被本项目选定或锁定；除注明的 axum 注册页外，所查 docs.rs `/latest/` 页面未据此确认精确发布版本。行号对应调研时的工作区，应在启动迁移前重取。

## 先定 provider 支持合同

现有配置用 LiteLLM 的 `provider_list` 判断合法 `type`，并允许安全约束下的任意 `params`/`param_env`；`openai` 有特别的 `api_base`/密钥要求（`jev_gateway/catalog.py:778-859`）。转发将模型拼成 `{provider_type}/{upstream_model}`，保留客户端额外参数，按路由能力修改温度和 reasoning，再交给 LiteLLM 的 `completion(**payload)`（`jev_gateway/gateway.py:106-125,218-250,1275`）。锁文件中的 LiteLLM 是 **1.102.0**（`uv.lock:991-1010`），这只能定义仓库锁定的比较基线。官方 provider 清单涵盖 OpenAI、Anthropic、Azure、Google Vertex、AWS Bedrock/SageMaker 等不同协议；有 OpenAI 兼容接口的厂商也不保证所有参数、错误、流块和历史回放相同。`async-openai` 官方 crate 文档只将官方 OpenAI API 和可配置的 OpenAI-compatible 供应商列为范围，Rig 的各 provider client 也未承诺覆盖 LiteLLM 的 provider matrix。不能把其中任何一个 SDK 命名为 LiteLLM 等价替换。

须在估时前由产品明确二选一：

1. **全 LiteLLM provider 支持且保持可配置范围**：Rust 原生方案需要冻结当前锁定 LiteLLM 的可接受 `provider_list`，逐项盘点调用种类、模型前缀、认证、`params`/`param_env`、extra body、工具、reasoning、流、错误和重试，形成逐 provider 测试矩阵；按协议组实现和验收。不经测试不能承诺同一行为。若允许暂留 Python LiteLLM 独立桥接，可暂时保留广覆盖，但这是混合运行时方案，不能称 Rust 原生；桥接自身增加部署、故障、密钥与流取消边界。仅靠 Rust OpenAI-compatible SDK 不能满足这个目标。在矩阵和调用场景未知时，全覆盖**无法给出可信的固定总人日或完工日期**。
2. **明确收窄**：例如第一版只接受测试过的 OpenAI-compatible 配置、OpenAI 和 DeepSeek 两条实际路径；配置加载时对其他 `type` 明确报错，并发布兼容性清单与迁移阻断提示。旧配置可接受的类型集合会缩小，因此它是有意破坏配置兼容的产品决定，不是 1:1 移植。即使同为 OpenAI-compatible，也须验证 DeepSeek reasoning、工具调用、stream 与原始额外参数。`jev_gateway/provider/deepseek.py:23-114`、`jev_gateway/provider/base.py:49-235,243-373` 有会话续接的专有行为。仓库示例不能代表生产 provider 配置；先核查实际配置的 type、params、param_env（不收集密钥值）。

另一条 HTTPX 链是 System One 决策服务：POST `{state, questions, model?}`、Bearer、超时、非 2xx 抛错、`answers.{key}.choice` 检查（`jev_gateway/decision_provider/system_one.py:17-47`）；它不是 LiteLLM model provider。Rust `reqwest` 可作为它的 HTTP 传输，仍须复制无效答案/失败后的本地降级顺序（`jev_gateway/decision_provider/__init__.py:40-77`）。

## 运行时替代映射

Python 的五项运行时直接依赖为 `fastapi`、`httpx`、`litellm`、`python-dotenv`、`uvicorn`（`pyproject.toml:8-15`）；`pydantic`/`starlette` 经 FastAPI 传递引入，`aiohttp`、`boto3`、`openai`、`tiktoken`、`tokenizers` 等经 LiteLLM 引入（`uv.lock:457-466,721-730,991-1010`）。删掉 LiteLLM 后不必逐一替换同名传递依赖，但其供应商协议能力不能凭依赖树消失而假装仍有。

| 原职责和仓库证据 | Rust 原生候选 | 兼容工作及风险 |
| --- | --- | --- |
| LiteLLM provider 枚举、参数转换、返回对象/流（`jev_gateway/catalog.py:15,794-797`; `jev_gateway/gateway.py:218-250,334-388,1260-1275`） | 自建 `ProviderTransport`/响应规范化接口；可用 `reqwest` 写 OpenAI-compatible wire adapter，或试验 `async-openai`；原生协议逐个调研官方 API/SDK，Rig 可作为候选库评估。 | SDK 层不承诺全部 provider；每协议验证 URL、auth、签名、参数、错误、reasoning、usage、模型回显、stream chunk 与断流。AWS/GCP 凭证链、签名和区域配置不能靠通用 Bearer HTTP 替代。锁定支持矩阵，否则不可估。 |
| FastAPI + Pydantic + Starlette（`jev_gateway/gateway.py:21-26,106-132,444-549`; `jev_gateway/dashboard.py:20-22`） | `axum` + `serde`/`serde_json::Value` + 项目自定义校验/错误映射；`validator` 只适合部分字段校验；`tower-http::ServeDir` 可供静态文件。 | `extra="allow"`、非空 model、非空 messages、默认 stream、JSON null/缺失/未知键、错误第一个字段定位及 400 OpenAI envelope 要自己复制。目录配置反而严格拒绝未知字段（`jev_gateway/catalog.py:785-797`）。静态 HTML no-store、哈希资产 immutable、安全头和 SPA 路径需显式配置（`jev_gateway/dashboard.py:120-145`）。 |
| HTTPX 的 System One POST 和 CLI health（`jev_gateway/decision_provider/system_one.py:17-47`; `jev_gateway/cli/health.py:11-22`） | `reqwest::Client` 复用连接，逐调用设置超时、检查 status、解析 JSON；stream feature 仅在对应调用需要。 | HTTPX `raise_for_status()`、timeout 单位/阶段、网络错误分类与 JSON 类型检查都需显式映射；不传出上游原始敏感错误。与 LiteLLM 的 HTTP 客户端独立。 |
| `.env` 的 override 与 CLI 文件编辑（`jev_gateway/gateway.py:176-181,981`; `jev_gateway/cli/providers.py:84-97`; `jev_gateway/cli/secrets.py:68-86`） | `dotenvy::from_path_override` 是文档化的覆盖读取候选；只读解析/临时环境验证另行设计，秘密文件用标准库同目录临时文件、sync、权限、rename。 | 官方 dotenvy 文档说明重复键取最后一个，但并未证明其变量展开、引号、转义、空值与 python-dotenv 完全一致；比对样例和覆盖顺序。多线程进程内变更环境变量要避免竞态，优先传不可变配置快照；若语义仍不一致，应自建解析兼容层。 |
| Uvicorn ASGI 服务、startup/shutdown 和日志（`jev_gateway/gateway.py:428-444,1444-1468`） | `tokio` runtime + `axum::serve`/Hyper；日志可评估 `tracing`，信号及优雅停止由应用实现。 | 绑定、访问日志格式、退出前清理、断连/部分响应、响应头和静态资产都要协议测；crate 本身不会自动复制 Uvicorn/ASGI 生命周期。 |
| SQLite、线程队列（`jev_gateway/records.py:56-145,888-930,1395-1484,1555-1569`） | `rusqlite` + 专属 OS 写线程 + `tokio::sync::mpsc` 有界通道的 `try_send` + oneshot ack；异步入口与阻塞写线程隔离。`sqlx` 仅是需另验的替代候选。 | SQLite 表/迁移、WAL/FULL、原连接所有权、队列满即拒绝、失败后停写、排队非落盘、`flush()` 栅栏、留存清理及 503/降级语义都须还原；`send().await` 会把满队列变为等待，改变现有行为。读操作在同一队列中同步等待（`jev_gateway/records.py:1507-1556`），改并行读连接会改变顺序。`spawn_blocking` 已运行任务不能直接 abort，不能代替严格关闭协议。 |
| argparse CLI（`jev_gateway/cli/main.py:29-97`; `pyproject.toml:17-19`） | `clap` derive + 项目 CLI 层；一个 binary 可承载 `jev`/`jev-gateway` 别名或两个 binary。 | 保持参数名、JSON、退出码、进程 PID/所有权 token、日志跟踪、密钥 0600 与 install/uninstall 状态；不同平台的 rename/文件权限要验（`jev_gateway/cli/process.py:20-128`; `jev_gateway/cli/secrets.py:68-86`）。 |
| Python 内存状态和线程同步（`jev_gateway/sessions.py:82-110`; `jev_gateway/provider/base.py:24-31,79-146`） | 单进程 `Arc` + 锁/分片 map、`tokio` 通知或 mutex；时间源区分 monotonic/epoch。 | TTL/容量/首轮并发 intake，跨进程续接 SQLite hydrate 的单飞、相同 assistant message hash 的 Python JSON 序列化及重复出现顺序须兼容；不能直接改成分布式状态并称 1:1。 |

`uv.lock` 中 `tiktoken` 属 LiteLLM 的依赖，本地 token 估计是 CJK 每字一、其余约四字符一再按 Python `round`，并未直接调用 tokenizer（`jev_gateway/signals.py:186-196`; `uv.lock:995-1010,2188-2195`）。Rust 换成分词库会改路由结果；原估计与 Python ties-to-even 舍入需 golden cases。`pydantic-settings` 等间接依赖也不应仅凭名称加入 Rust 图谱。

## SSE、背压和取消的明确边界

当前 `sse_chunks` 逐对象写 `data: <JSON>\n\n`，正常结束追加 `[DONE]`，响应有 `text/event-stream` 和 `Cache-Control: no-cache`（`jev_gateway/gateway.py:360-388,1405-1409`）。Rust 可用 axum `Sse` 或原始 `Body` 字节流；若 helper 改了数据字段/换行、keep-alive 或结束帧，需改用精确编码。异步上游 `reqwest::Response::bytes_stream`（需 `stream` feature）可配有界缓冲与下游 `poll` 传递背压，但本项目现在是同步 LiteLLM iterator，实际缓存、取消、日志与发送顺序必须通过差分测试确认，不能宣称字节流天然 1:1。

设计需把下游 drop/断连传到上游响应的释放或取消，并确认不再消费上游；`CancellationToken` 只通知合作任务，不自动取消 HTTP 请求。正常 EOF 才发送 `[DONE]`；已发 headers 的上游错误无法改成非流 502，需断流、隐藏异常文本并记录失败（`jev_gateway/gateway.py:1342-1381`）；上游在响应开始前失败则返回固定安全 502（`:1275-1320`）。响应捕获器拼接 content、tool_calls、function_call 并写续接（`jev_gateway/provider/base.py:243-373`），Rust 需覆盖正常 EOF、半途失败、客户端取消时 outcome/活动状态恰好清理一次的竞争条件。现代码 `ActivityStreamingResponse.__call__` 还有第二层活动清理（`jev_gateway/gateway.py:1396-1409`）；需特测 Python 基线在取消时 outcome/续接是否一定落库，不能凭 `finally` 推断每条路径都执行。

## 交付兼容和迁移阶段

现有 Docker 先用 Node 构建 Vite，再以 Python wheel 打包静态资源，容器使用非 root 用户及固定数据卷（`Dockerfile:1-42`）；release 构建/校验 wheel 和安装脚本（`.github/workflows/release.yml:18-68`），安装器验证 wheel 名称、SHA256 与 METADATA 后交给 `uv tool install`，并记录 install source（`scripts/install.sh:95-205`）。Rust 原生交付可做带静态资产的多平台 binary/容器或 `cargo install`，但后者官方只保证编译安装 binary，不解决现有 wheel 身份/哈希/标签/安装升级/卸载协议。须规划架构/OS/libc 目标、构建产物校验、权限、CLI 原路径、迁移回退与数据卷的旧 SQLite 可读性。保留 `/dashboard/` 路由及 Vite 产物不要求重写前端（`frontend/vite.config.ts:9-14`; `jev_gateway/dashboard.py:120-145`）。切换期保持原 wheel 安装器可回滚，不能让旧安装器从同一 tag 下载 Rust 文件并按 wheel 校验。

建议阶段：① 冻结 Python 行为样本及实际 provider 清单；② Rust 内核先做目录/路由/会话/配置读取、只读预览差分；③ System One 和明确支持的 provider wire/同步/SSE/取消；④ SQLite 旧库迁移、CLI、dashboard；⑤ 新发行和有限灰度，用同一假上游比对请求、响应、失败、流字节和记录，确认回滚。配置覆盖层的原子替换、失败恢复及热重载不得省（`jev_gateway/routing_overlay.py:40-145,236-270`; `jev_gateway/gateway.py:739-1062`）。存量测试可作为样本入口：`tests/test_gateway.py:729-852,1259-1526,1808-2056,2080-2442`，`tests/test_records.py:90-162,430-604`，`tests/test_sessions.py:65-147`，`tests/test_provider_adapters.py:103-133,358-411`；假 LiteLLM 测试不证明真实厂商 wire 兼容。密码/真实用户内容不写 golden 文件。

## 按模块估算（人日）

假设一名熟悉 Rust/Tokio、Python 参考实现和网关协议的工程师按 8 小时净开发日计，复用现有前端，拥有可控假上游和脱敏旧库，Rust 第一版只支持经过验收的 OpenAI-compatible/DeepSeek 范围；数值包含模块单测与评审，不含新真实厂商协议的工作。不用代码行数直线换算：HTTP 边界、并发与证据顺序较贵。仓库基线盘点约 40 个网关 Python 文件、10,893 行和 31 个 Python 测试文件、9,598 行（`research/gateway-inventory.md` 的计数定义）；主服务 1,469 行、catalog 1,900 行、records 1,622 行，提供估算拆分依据，非逐行移植计划。

| 模块 | 人日 | 估算驱动与验收 |
| --- | ---: | --- |
| 行为样本、差分夹具与配置/provider 盘点 | 8 至 14 | HTTP 错误、透传参数、响应头、流字节、会话与旧库样本；锁定测试矩阵。 |
| Catalog、配置、dotenv、覆盖层/回滚 | 10 至 18 | 约 1,900 行 catalog；严格 provider 字段、秘密解析、热重载/原子文件。 |
| 路由、信号、策略、System One、会话 | 14 至 24 | 多策略、TTL/并发、决策降级、浮点排序和 tokenizer 估计差分。 |
| 限定范围的 provider transport 与续接 | 16 至 30 | OpenAI-compatible/DeepSeek 请求/响应/工具/推理、跨 provider 历史及持久化 hydrate；不含其他原生协议。 |
| HTTP API、SSE、错误、安全、背压/取消 | 14 至 26 | `gateway.py` 多路由、校验 400、auth、流异常/断连竞态。 |
| SQLite schema/迁移、线程队列、留存 | 18 至 32 | `records.py` 1,622 行、WAL/FULL、full queue、flush、脱敏和旧库检查。 |
| Dashboard API、静态资源及游标 | 7 至 13 | HMAC 游标、活动快照、安全头与缓存，不重写 React。 |
| CLI、进程控制、密钥文件及日志 | 10 至 18 | `cli/` 约 1,053 行，命令/退出码、PID/权限/安全日志。 |
| 容器、二进制发行、安装/回退 | 7 至 13 | 前端构建复制、新资产矩阵、旧 wheel 安装路径兼容策略。 |
| 全链路差分、故障注入与迁移验收 | 16 至 28 | 假上游、取消/满队列/旧 SQLite/热重载、灰度回退；区别于各模块单测。 |
| **限定范围合计** | **120 至 216** | 顺序人日区间；可并行开发不等于等比例缩短日历。 |

全 LiteLLM 面积不能简单加一个 SDK 的人日。完成真实生产矩阵后可在上述基数之外，按每个新增**独立原生协议组**约 8 至 25 人日、同协议但特殊认证/参数/流语义的 provider 约 2 至 8 人日作条件性规划，另预留协议清单/测试账户/环境获取约 5 至 12 人日；这些是规划假设而非已审定 provider 数或固定总价，覆盖不了未知云身份、媒体端点或 LiteLLM 内部兼容规则。若要求对锁定 `provider_list` 所有可接受类型全等，先做单独发现项目，逐项形成约束后再估。作为策略性重构，可在限定范围上另加 10 至 25 人日设计清晰的传输/标准响应接口和进程内状态边界，允许改变内部线程或 schema；若改公共 API、旧库、provider 接受范围，必须单列破坏性迁移和用户批准，不能纳入“1:1”验收。与 TypeScript 路径共用的是 Python golden、provider 矩阵及验收样本；Rust 特有成本主要在同步 SQLite/异步服务器桥接、类型/序列化及跨平台 binary 分发。

## 已核查的外部资料与待核实项

均于 **2026-09-28** 打开/检索。链接只支持表中有限声明，不推断包之间的兼容性；选型时须锁版本、核许可证和 MSRV，再做原型。`axum` crates.io 搜索结果显示 0.8.9，但未核实其他候选的最新精确版本，也未核验本项目目标 Rust 版本。

- LiteLLM provider 清单：https://docs.litellm.ai/docs/providers ；范围广且按供应商有差异。
- `async-openai` 范围与兼容配置：https://docs.rs/async-openai/latest/async_openai/ ；Rig 的 provider/client 介绍：https://docs.rs/rig-core/latest/rig_core/ 。两者均未宣称 LiteLLM 全矩阵等价。
- `axum` SSE API：https://docs.rs/axum/latest/axum/response/sse/index.html ；注册页版本：https://crates.io/crates/axum 。SSE helper 支持 `Sse<Stream<Result<Event,...>>>` 与 keep-alive，具体线格式待验。
- `serde_json::Value` 与 `preserve_order` 特性：https://docs.rs/serde_json/latest/serde_json/value/enum.Value.html ；`validator` 字段校验：https://docs.rs/validator/latest/validator/ 。两者不提供 Pydantic 错误等价承诺。
- `reqwest::Client` 异步 HTTP：https://docs.rs/reqwest/latest/reqwest/struct.Client.html ；`Response::bytes_stream` 的 `stream` feature：https://docs.rs/reqwest/latest/reqwest/struct.Response.html 。具体超时/异常映射仍待协议测试。
- `dotenvy::from_path_override` 覆盖规则：https://docs.rs/dotenvy/latest/dotenvy/fn.from_path_override.html 。解析细节与 python-dotenv 差分待验。
- Tokio bounded mpsc 和 `try_send`：https://docs.rs/tokio/latest/tokio/sync/mpsc/index.html 、https://docs.rs/tokio/latest/tokio/sync/mpsc/struct.Sender.html ；`spawn_blocking` 不可中途 abort：https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html ；合作取消：https://docs.rs/tokio-util/latest/tokio_util/sync/struct.CancellationToken.html 。
- `rusqlite` SQLite binding：https://docs.rs/rusqlite/latest/rusqlite/struct.Connection.html ；`clap` 子命令：https://docs.rs/clap/latest/clap/_derive/_tutorial/index.html ；`tower-http::ServeDir` 静态文件：https://docs.rs/tower-http/latest/tower_http/services/struct.ServeDir.html 。这些库的默认行为不替代仓库的权限、缓存、WAL/flush 合同。
- Cargo binary 安装：https://doc.rust-lang.org/cargo/commands/cargo-install.html 。它没有提供现有 wheel release 身份验证及二进制更新/卸载协议。

待确认：生产 provider/协议与认证矩阵、接受范围的产品决定、各 crate 锁定版本和授权/MSRV、Rust 部署目标矩阵、旧库可读取样本、下游客户端断连时 Python 实际持久化表现、真实供应商 wire 测试预算。没有这些输入，不应给全覆盖路径报确定工期。
