# JEV Gateway

[English](README.md) | **简体中文**

![AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue) ![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue)

JEV Gateway 是一个兼容 OpenAI 对话接口的模型路由网关，按配置的成本、质量和能力规则在多个提供方之间选择模型。客户端指定策略即可，无需写死模型；会话既可以固定模型，也可以逐轮重新选择。

[快速开始](#快速开始) · [模型标识](#模型标识) · [路由策略](#路由策略) · [HTTP API](#http-api) · [文档](#文档) · [许可](#许可) · [开发](#开发)

## 它能做什么

- 提供 `POST /v1/chat/completions`；客户端配置网关地址及目录模型名或策略名后即可接入。
- 可按任务类型、规模与严格程度分类，再从配置的模型池中选择。
- 可选用配置的决策提供方回答带类型的单选题，不可用时采用本地评分或配置的回退规则。
- 支持会话固定模型和逐轮选择；随仓库提供的 `task_aware` 策略使用 `fresh` 模式。
- 为每条路由推导 `reasoning_effort` 档位，并收敛到该路由实际接受的取值。
- 将请求、决策、结果和提供方续写状态写入 SQLite，记录失败不影响正常请求。
- 提供实时会话面板和路由检查接口。

![从请求到路由的流程](docs/routing-strategy-map.svg)

## 快速开始

需要 Python 3.10+、[`uv`](https://docs.astral.sh/uv/)，以及所配置上游模型的访问权限。

```bash
git clone https://github.com/TexasOct/jev-gateway.git
cd jev-gateway
uv sync --all-groups
```

初始化运行目录。脚本只复制一次公开模板，之后不会覆盖已有文件：

```bash
./scripts/install-local.sh --editable
```

编辑 `$HOME/.jev-gateway/` 下的两个文件：

```bash
${EDITOR:-vi} "$HOME/.jev-gateway/models.json"  # 提供方、模型、策略
${EDITOR:-vi} "$HOME/.jev-gateway/.env"         # models.json 声明引用的密钥
```

把示例地址和模型名替换为你的提供方实际支持的值。模板声明了两个提供方，对应的 `.env` 需要：

```dotenv
DEEPSEEK_API_KEY=replace-with-deepseek-key
OPENAI_API_KEY=replace-with-openai-key
```

启动网关：

```bash
~/.local/bin/jev-gateway-local
```

在另一个终端发出第一个请求：

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model": "task_aware", "messages": [{"role": "user", "content": "总结一下这份设计。"}]}'
```

模板默认关闭外部决策，启用 `decision` 前 `task_aware` 使用配置的回退规则。兼容端点的 `decision.providers[].protocol` 设为 `system_one`；仅在端点需要时填写 `model`。
`GET /healthz` 可以确认进程已启动。长期运行、容器与 wheel 安装方式见
[`docs/local-install.md`](docs/local-install.md)。

## 模型标识

目录中的模型用包含提供方的完整 ID 索引，即 `<provider>/<upstream_model>`。`providers` 统一定义连接设置，每个模型引用一个提供方，再补充能力、上限、成本和路由标签：

```json
{
  "providers": [
    {"id": "deepseek", "type": "deepseek", "api_base": "https://api.deepseek.com/v1", "api_key_env": "DEEPSEEK_API_KEY"}
  ],
  "models": [
    {"provider": "deepseek", "upstream_model": "deepseek-flash", "tags": ["task_aware/draft"], "context_window": 1000000}
  ]
}
```

这个模型的 ID 是 `deepseek/deepseek-flash`。手动指定模型时不能只写上游模型名，因为不同提供方可能使用同名模型。完整字段说明见 [`docs/models-config.md`](docs/models-config.md)。

## 路由策略

每个具名策略同时也是一个虚拟模型名。把策略名放进请求体的 `model` 字段即可，默认策略是 `task_aware`。

```json
{"model": "quality", "messages": [{"role": "user", "content": "评审一下这份设计。"}]}
```

每个策略从顶层 `policy` 块继承设置，并可按需覆盖 `selection`、`mode`、`labels` 与推理规则。内置模式有 `sticky`、`cached`、`escalate`、`adaptive` 和 `fresh`；可显式选择 `policy`、`jev` 和 `jev_matrix` 这三种内置策略类型（后两者是决策型策略的兼容名称）。写入 `openai/gpt-5.6-sol` 这样的完整目录模型 ID，则直接选择该模型。省略 `kind` 时使用 `auto` 分派，详见设计文档。

只有请求体的 `model` 字段能选择策略：`?strategy=` 会返回 `400`，请求头 `X-JEV-Strategy` 不参与选择。设计与配置细节见 [`docs/routing-design.md`](docs/routing-design.md)。

## HTTP API

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/healthz` | 存活状态与配置快照。 |
| `GET` | `/dashboard` | 实时会话面板。 |
| `GET` | `/v1/models` | 策略名与目录模型 ID。 |
| `GET` | `/v1/routing/policy` | 当前策略快照。 |
| `GET` | `/v1/routing/strategies` | 已注册的策略及其策略配置。 |
| `POST` | `/v1/routing/preview` | 只预览路由结果，不实际转发。 |
| `POST` | `/v1/routing/reload` | 重新读取目录文件。 |
| `GET` | `/v1/routing/decisions/{decision_id}` | 单条保留的决策。 |
| `GET` | `/v1/routing/sessions` | 实时会话列表。 |
| `GET` | `/v1/routing/sessions/{session_id}` | 单个实时会话。 |
| `GET` | `/v1/routing/sessions/{session_id}/requests` | 某个会话保留的请求。 |
| `GET` | `/v1/routing/providers/summary` | 提供方保留的活动统计。 |
| `POST` | `/v1/chat/completions` | OpenAI 兼容的对话补全。 |

成功的对话响应会带上 `X-JEV-Route`、`X-JEV-Provider`、`X-JEV-Model`、`X-JEV-Route-Label`、`X-JEV-Task-Type`、`X-JEV-Mode`、`X-JEV-Reason`、`X-JEV-Strategy`、`X-JEV-Decision-Id`，并在适用时附带请求、会话、切换、推理与切换受阻原因的响应头。端点契约、鉴权、错误码与 reload 语义见 [`docs/http-api.md`](docs/http-api.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [`docs/local-install.md`](docs/local-install.md) | 本地、容器与 wheel 安装。 |
| [`docs/models-config.md`](docs/models-config.md) | `models.json` 的全部字段。 |
| [`docs/routing-design.md`](docs/routing-design.md) | 路由契约、策略、会话与证据。 |
| [`docs/http-api.md`](docs/http-api.md) | 端点、响应头、错误与 reload。 |

## 许可

本项目以 [GNU Affero 通用公共许可证第 3 版或更新版本](LICENSE)（`AGPL-3.0-or-later`）授权。你可以在其条款下使用、修改和分发本项目。第 13 条补充了网络条款：如果你把修改版作为网络服务运行，就必须以同一协议向该服务的用户提供对应的源代码。协议允许商业托管，但受协议约束的修改版必须向这些用户提供对应源代码。

## 开发

```bash
uv run pytest -q
uvx pyright
uv build
```

打包产物名为 `jev-gateway`，并提供 `jev-gateway` 命令行入口。
