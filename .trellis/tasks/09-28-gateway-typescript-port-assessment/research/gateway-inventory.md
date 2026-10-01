# 网关源码盘点：TypeScript 1:1 移植的行为边界

本页只盘点当前工作区源码和测试，没有运行服务、安装依赖或修改产品文件。当前 `jev_gateway/gateway.py`、`jev_gateway/dashboard.py` 有未提交修改，`jev_gateway/activity.py` 尚未跟踪；下列行号和计数以调研时的工作区为准，后续修改可能使其失效。计数按 Python `splitlines()` 计算，包含空行和注释，不代表有效代码行。

## 规模与模块

`jev_gateway/` 现有 40 个 `.py` 文件、10,893 行；`tests/` 有 31 个 `.py` 文件、9,598 行；`frontend/src/` 有 48 个 `.ts`/`.tsx` 文件、7,818 行（均包含当前未跟踪文件）。`frontend/src/` 计数包含测试。单文件规模和职责如下：

| 领域 | 文件与行数 | 源码锚点 | 等价移植难点 |
| --- | --- | --- | --- |
| HTTP 入口与上游转发 | `gateway.py` 1,469 | `jev_gateway/gateway.py:106-128`, `:218-250`, `:422-444`, `:1104-1148`, `:1260-1404` | Pydantic 宽松额外字段、FastAPI 错误封装、请求与上游调用的先后顺序、流结束和客户端断连后的清理。 |
| 仪表盘服务 | `dashboard.py` 555；`activity.py` 97 | `jev_gateway/dashboard.py:80-117`, `:120-145`, `:268-299`, `:370-480`; `jev_gateway/activity.py:24-93` | 进程内活动快照、内存会话与 SQLite 证据合并、带签名且限定端点/会话的游标、静态资源缓存和安全头。 |
| 模型目录与配置 | `catalog.py` 1,900；`config.py` 41；`routing_overlay.py` 271；`canvas_layout.py` 82 | `jev_gateway/catalog.py:552-665`, `:768-863`, `:1647-1900`; `jev_gateway/routing_overlay.py:40-145`, `:159-190`, `:236-270`; `jev_gateway/canvas_layout.py:19-82` | JSON 校验、策略定义和提供商参数解析、环境变量凭证、覆盖层合并、原子写入与失败回滚。 |
| 路由决策与信号 | `decision.py` 659；`signals.py` 376；`reasoning.py` 236；`sessions.py` 306 | `jev_gateway/decision.py:198-337`, `:431-479`, `:609-659`; `jev_gateway/signals.py:186-196`, `:253-376`; `jev_gateway/sessions.py:82-101`, `:141-204` | 稳定的评分/排序、推理强度、会话推导、TTL 与并发首轮共享状态，预览不能产生正式决策副作用。 |
| 策略扩展 | `strategy/` 6 文件、1,231 行 | `jev_gateway/strategy/contracts.py:24-40`, `:58-111`; `jev_gateway/strategy/registry.py:26-85`, `:90-179`; `jev_gateway/strategy/policy.py:75-260`, `:337-583`; `jev_gateway/strategy/matrix.py:23-89` | 内置 policy、decision、matrix 与自定义注册工厂的行为合同；pin、迟滞、预算、回退与矩阵答案校验。 |
| 决策提供商与对话适配 | `decision_provider/` 3 文件、156 行；`provider/` 3 文件、506 行 | `jev_gateway/decision_provider/system_one.py:14-47`; `jev_gateway/provider/base.py:49-235`, `:243-373`; `jev_gateway/provider/deepseek.py:35-114` | 决策服务失败后的降级、跨提供商 assistant 历史及 DeepSeek reasoning 回放、流式 delta/tool call 拼接和重启后续接。 |
| 证据存储 | `records.py` 1,622 | `jev_gateway/records.py:56-145`, `:352-435`, `:746-795`, `:888-930`, `:1395-1435`, `:1555-1573` | SQLite 迁移、WAL、专属写入线程与有界非阻塞队列、flush 持久化界限、留存清理、脱敏和降级路径。 |
| CLI 与日志 | `cli/` 12 文件、1,053 行；`logging/` 3 文件、330 行 | `jev_gateway/cli/main.py:29-100`, `:235-294`; `jev_gateway/cli/process.py:20-128`; `jev_gateway/cli/providers.py:34-168`; `jev_gateway/cli/secrets.py:15-86`; `jev_gateway/logging/config.py:90-257` | 命令/退出码/JSON 输出、进程所有权及信号、密钥落盘权限、日志脱敏及上游错误文本隔离。 |

其中 `config.py` 的数字转换与 API base 规范化见 `jev_gateway/config.py:19-41`。上述策略、CLI、日志子目录行数由其 `.py` 文件相加，整个目录总量也包括 `__init__.py`。

## HTTP 与 SSE 可观察合同

- `ChatCompletionRequest` 要求非空 `model`、至少一条 `messages`，默认 `stream=false`，允许未列出的额外 LiteLLM 参数；`PreviewRequest` 另有策略列表：`jev_gateway/gateway.py:106-132`。`completion_payload` 删除客户端 `model`/`stream` 后重组，并依据能力移除 `temperature`，由提供商配置补上 `api_base`/`api_key`，模型名写为 `provider_type/upstream_model`：`jev_gateway/gateway.py:218-250`。这类透传和参数省略必须对比原始 JSON，不能只比最终文本。
- 主路由：`GET /healthz`、`GET /v1/models`、`GET /v1/routing/policy`、`GET /v1/routing/strategies`、`POST /v1/routing/preview`、`GET/PUT/DELETE /v1/routing/configuration`、`POST /v1/routing/configuration/validate`、`POST /v1/routing/reload`、`GET /v1/routing/decisions/{decision_id}`、`GET /v1/routing/sessions/{session_id}`、`POST /v1/chat/completions`，定义位置依次在 `jev_gateway/gateway.py:564-630`, `:761-975`, `:1064-1105`。仪表盘子路由提供 `GET /dashboard`、活动、提供商摘要、分页会话、会话请求列表，以及 canvas layout/theme 的读写：`jev_gateway/dashboard.py:275-318`, `:370-548`。
- 可选网关密钥采用 Bearer 头及常量时间比较，错误是 OpenAI 形态且带 `WWW-Authenticate`：`jev_gateway/gateway.py:391-420`；配置写入另有 guard：`jev_gateway/gateway.py:711-725`。模型选择、session/strategy 标头和响应证据头见 `jev_gateway/gateway.py:271-315`, `:1104-1167`。
- SSE 逐块编码为 `data: <JSON>\n\n`，正常末尾为 `data: [DONE]\n\n`：`jev_gateway/gateway.py:360-388`。流响应类型是 `text/event-stream` 且 `Cache-Control: no-cache`；响应体一边消费上游一边采集 assistant 续接，结束时写 outcome 并清理活动记录，ASGI `__call__` 的 `finally` 也清理：`jev_gateway/gateway.py:1319-1404`。上游流在 headers 发送后失败时不能改成普通 502，当前代码抹掉异常细节并抛固定错误，见 `jev_gateway/gateway.py:1337-1385`；同步上游失败走 502 安全封装：`jev_gateway/gateway.py:1272-1311`。
- 请求记录在校验目标策略/模型之前写入，以保留被拒请求的证据：`jev_gateway/gateway.py:1104-1175`。监控行为须覆盖错误请求、断流与持久层不可用，不能只测 200 响应。

## 配置、状态、监控和资产

- 基线默认从 `JEV_GATEWAY_HOME/models.json` 加载，邻近 `.env` 使用 `override=True`，SQLite 相对路径相对于模型文件目录解析：`jev_gateway/gateway.py:157-197`。目录对 provider 的 `api_key_env` 从环境解析，明文 `api_key` 被拒绝：`jev_gateway/catalog.py:768-855`。目录依赖 LiteLLM 的 `provider_list`：`jev_gateway/catalog.py:15`。重载会重新读取 `.env` 与覆盖层，预检存储和策略，失败保留旧目录：`jev_gateway/gateway.py:974-1062`; `tests/test_gateway.py:2111-2442`。
- 覆盖层单独存储，严格校验，旧版本不认识的字段不能使基线失效；写入使用同目录临时文件及 `os.replace`：`jev_gateway/routing_overlay.py:40-145`, `:236-270`。布局和主题也是邻接文件、原子替换：`jev_gateway/canvas_layout.py:52-82`; `jev_gateway/dashboard.py:202-266`。HTTP 更新含验证、目录切换与失败时恢复旧文件字节：`jev_gateway/gateway.py:739-975`。
- 会话是单进程有界 TTL 内存状态，带互斥锁、预路由 intake 和复制快照：`jev_gateway/sessions.py:82-204`。长期证据在 SQLite 的 requests、decisions、outcomes、upstream_requests、config_versions、assistant_continuations 表：`jev_gateway/records.py:56-145`。数据库按 WAL/FULL 打开：`jev_gateway/records.py:888-930`；入队成功不等于持久化，`flush()` 是同步界限：`jev_gateway/records.py:1395-1435`, `:1555-1573`。内容捕获和秘密脱敏见 `jev_gateway/records.py:485-574`，请求/续接留存清理见 `:1340-1394`。
- 仪表盘会话列表把内存快照和证据拼接，游标有 HMAC、端点/会话作用域及长度校验：`jev_gateway/dashboard.py:64-117`, `:370-480`。静态资源来自 `jev_gateway/static`，HTML 禁止缓存，哈希资产可长期缓存，并设置安全头：`jev_gateway/dashboard.py:120-145`。活动状态由 `ActivityRegistry` 跟踪，而非从证据表反推：`jev_gateway/activity.py:24-93`; `jev_gateway/gateway.py:422-426`。
- 前端已有 TypeScript/Vite，`base` 为 `/dashboard/`，构建输出到 `../jev_gateway/static`：`frontend/vite.config.ts:9-14`。API 客户端的服务端调用面见 `frontend/src/api.ts:1-274`；`frontend/package.json:6-11` 提供 build、lint、test。移植范围只需保留资源 URL、打包及 API 响应形状，不要求重写界面。当前前端有未提交和未跟踪内容，盘点并未修改它们。

## CLI、依赖和交付

- CLI `jev` 包含 doctor/status、进程 start/stop/restart/logs、config、provider、install init 与 uninstall，带全局 `--home/--json/--quiet/--verbose`：`jev_gateway/cli/main.py:29-100`。`process.py` 通过 PID 和所有权 token 管理进程，`secrets.py` 临时文件加 `os.replace` 写 `.env`：`jev_gateway/cli/process.py:20-109`; `jev_gateway/cli/secrets.py:68-86`。这是 Node CLI 的进程及文件语义兼容点。
- Python 直接运行依赖为 FastAPI、httpx、LiteLLM、python-dotenv、Uvicorn；命令入口分别为 `jev-gateway` 和 `jev`，wheel 包含静态资产和模板：`pyproject.toml:8-32`。LiteLLM 除了转发还参与 provider 枚举和响应对象序列化：`jev_gateway/catalog.py:15`; `jev_gateway/gateway.py:334-387`, `:1260-1270`。Node 方案不能凭接口名称宣称现成 SDK 已 1:1 兼容，须另行调研版本、上游协议、超时及流失败语义。
- Docker 先用 Node 构建前端，再把产物复制到 Python wheel 阶段，容器入口初始化 `models.json`、`.env` 后设置 `JEV_GATEWAY_HOME`：`Dockerfile:1-42`; `scripts/container-entrypoint.sh:1-27`。发布工作流执行前端 lint/test/build、pytest、pyright、wheel 构建/校验，发布 wheel 与带 SHA256 的安装器：`.github/workflows/release.yml:16-68`; `scripts/validate-release.py:25-113`。安装器支持校验 release wheel、明确区分 git ref 与版本安装，见 `scripts/install.sh:95-202`；Node 发布不能只替换容器启动命令，还需设计旧安装路径与发行资产的兼容策略。

## 现成测试合同与下一步验证

当前 Python 测试集中在 `tests/test_gateway.py`（路由、SSE、错误、安全、监控、配置回滚和热重载）、`tests/test_records.py`（迁移、脱敏、留存、队列）、`tests/test_sessions.py`（并发、TTL、淘汰）、`tests/test_provider_adapters.py`（跨提供商推理续接）等；具体场景分别见 `tests/test_gateway.py:729-852`, `:1259-1526`, `:1808-2056`, `:2080-2442`; `tests/test_records.py:90-162`, `:430-604`; `tests/test_sessions.py:65-147`; `tests/test_provider_adapters.py:103-133`, `:358-411`。`tests/test_decision_matrix.py:90-271` 检查答案/回退，`tests/test_release_validation.py:108-127` 和 `tests/test_install_script.py:142-202` 检查发行链。前端 Vitest 的 API/监控/画布测试入口见 `frontend/src/api.test.ts:1`, `frontend/src/monitoring/MonitoringView.test.tsx:1`, `frontend/src/config/RoutingEditor.test.tsx:1`。

移植时先固化 HTTP 状态码、错误体和响应头的差分样本，再用受控假上游比对同步/流式 body 与 `data: [DONE]`、中断后 outcome/活动清理；对同一 `models.json` 比较配置快照和策略预览；用现有 SQLite 数据跑迁移/读取/留存测试，并在多请求并发、队列满和服务重启后验证会话续接。以上是依据测试与实现提出的验证方案，并非本次已经执行的测试。
