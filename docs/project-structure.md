# 项目结构与架构导航

本文介绍 JEV Gateway 的主要代码边界、请求流向和开发入口。它是代码导航，不替代配置、API 和路由行为的详细契约；具体行为以对应专题文档及实现为准。

## 仓库布局

```text
jev-gateway/
├── jev_gateway/              # Python 网关服务与管理 CLI
│   ├── cli/                  # 命令行、安装状态、进程与服务管理
│   ├── strategy/             # 策略类型、注册、策略选择与路由
│   ├── provider/             # 提供方抽象和内置 provider 实现
│   ├── provider_adapters/    # 上游协议/传输适配
│   ├── logging/              # 配置与目录日志相关功能
│   ├── templates/            # 配置、环境变量和凭证示例
│   └── static/               # 管理面板构建产物
├── frontend/                 # Vite + React 管理面板源码
├── tests/                    # Python 单元、集成及回归测试
├── scripts/                  # 构建、安装、卸载和发布校验工具
├── docs/                     # 用户、运维、API、配置及设计文档
├── .github/workflows/        # CI、发布与公开安装验收工作流
├── models.json               # 仓库内的模型/路由配置样例
├── pyproject.toml            # Python 包元数据、依赖和 CLI 入口
├── Dockerfile / compose.yaml # 容器构建与运行定义
├── README.md                 # 英文入口
└── README.zh-CN.md           # 简体中文入口
```

## 架构边界

### Python 网关与领域模块

`jev_gateway/` 是服务端主体。顶层模块按职责拆分配置、模型目录、凭证、请求事实、决策/诊断、路由证据、会话、管理操作和网关 HTTP 服务等能力。入口与边界可从 `gateway.py`、`catalog.py`、`config.py`、`decision.py` 及 `records.py` 开始阅读。

`strategy/` 负责策略契约、注册和具体路由逻辑；`provider/` 定义提供方基础能力及内置实现，`provider_adapters/` 处理对应的上游适配。两者共同把路由选择与具体供应商传输隔离。增加策略或供应商时，应先检查这些现有抽象及相关测试，避免把选择逻辑塞进 HTTP 层。

`cli/` 提供用户管理配置、安装状态、服务进程和凭证等命令。命令行与 HTTP 服务共享网关配置和运行时能力，但命令行入口职责不同于请求处理路径。

### 管理面板

`frontend/` 包含控制台前端源码和 npm 工具链。`scripts/build-frontend.sh` 构建前端并将产物放入 `jev_gateway/static/`，由 Python 服务在 `/dashboard` 提供。`static/` 是生成产物，不是面板源码；改动前端后要重新构建并检查产物状态。Docker 和 Release 构建也会先生成面板资源。

### 数据与状态

模型及策略的主要输入来自模型目录/配置文件；凭证独立保存，不应通过面板 API 回显。运行过程中的请求、路由决策及会话记录由记录/存储模块管理。排查配置或持久化问题时，分别追踪配置加载、运行时激活和状态记录路径，不要仅凭某个 JSON 文件推断正在运行的状态。

## 核心请求路径

```text
OpenAI-compatible client
  → HTTP gateway / chat-completions handler
  → 请求解析与配置/目录读取
  → 策略注册与路由决策（strategy、decision、policy）
  → provider / provider adapter 转发上游请求
  → 返回兼容响应及路由元数据
  → 记录请求、决策、结果与会话状态
```

管理路径则由 CLI 或控制台发起：CLI 在 `jev_gateway/cli/`；浏览器控制台通过 `frontend/` 调用服务端管理 API。管理变更通常经过校验和配置事务后才应用，相关 API 契约见 [`http-api.md`](http-api.md)，凭证边界见 [`credentials.md`](credentials.md)。

## 常用开发与验证入口

```bash
uv sync --all-groups
npm --prefix frontend install
scripts/build-frontend.sh
uv run pytest -q
uvx pyright
npm --prefix frontend run lint
npm --prefix frontend run test
uv build
```

只改 Python 服务时，优先运行相关 pytest，再按变更范围运行类型检查；涉及前端时还要执行前端 lint/test 与 bundle 构建检查。完整发布流程见 [`releasing.md`](releasing.md)，本地构建说明见仓库根目录 README 的 Development 部分。

## 深入阅读

- [`routing-design.md`](routing-design.md)：路由策略、决策与会话设计。
- [`models-config.md`](models-config.md)：模型、提供方和策略配置字段。
- [`http-api.md`](http-api.md)：HTTP 接口、错误与响应契约。
- [`cli.md`](cli.md)：CLI 命令与服务生命周期。
- [`admin-experience.md`](admin-experience.md)：控制台工作流。
- [`local-install.md`](local-install.md) 与 [`releasing.md`](releasing.md)：安装和发布。
