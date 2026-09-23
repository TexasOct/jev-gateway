# Design: README 多语言重构与 AGPL-3.0 协议落地

## Scope of this document

技术设计只覆盖三件事：多语言文档的落盘布局、README 的内容切分规则、协议与打包元数据的改法。不涉及 `jev_gateway/` 运行时。

## 1. 多语言文档布局

采用 GitHub 原生约定，不引入 `docs/i18n/` 目录：

```text
README.md              # 英文，默认入口，也是内容的唯一权威来源
README.zh-CN.md        # 简体中文版
```

理由：GitHub 会把 `README.<lang>.md` 识别为同一项目的语言版本，`docs/i18n/` 需要自己维护跳转且不被平台识别。语言后缀用 `zh-CN` 而不是 `zh`，与 GitHub 的 locale 命名一致。

语言切换条固定放在标题下方第一行，两份文档互为镜像：

```markdown
**English** | [简体中文](README.zh-CN.md)
```

漂移控制：英文版是权威版本。内容改动先落英文版，中文版跟随。两份文档不各自引入独有章节，除语言切换条和翻译行文外，标题层级与章节顺序保持一一对应，便于人工比对。

## 2. README 内容切分

### 保留在 README 的部分

| 章节 | 内容 | 目标长度 |
| --- | --- | --- |
| 定位 | 一段话说清这是什么、解决什么问题 | 2 到 4 句 |
| 徽章 | 协议、Python 版本 | 1 行 |
| 核心能力 | 5 到 7 条，每条一句 | 半屏 |
| 架构图 | 引用 `docs/routing-strategy-map.svg` | 1 张图 |
| 快速开始 | 安装、初始化、配置、启动、发第一个请求 | 一屏 |
| 模型标识 | `<provider>/<upstream_model>` 规则加最小 JSON 片段 | 半屏 |
| 策略概览 | 策略名即虚拟模型名，附一个请求示例 | 半屏 |
| 端点速查 | 方法加路径的表格 | 半屏 |
| 文档索引 | 指向 `docs/` 各篇的表格 | 1 个小表 |
| 协议 | AGPL-3.0 声明与约束说明 | 1 段 |
| 开发 | `uv run pytest -q`、`uv build` | 3 行 |

预计总量 120 到 160 行。

### 移出 README 的部分

| 原内容 | 去向 | 现状 |
| --- | --- | --- |
| `providers`/`models`/`policy` 长 JSON 示例与字段含义 | `docs/models-config.md` | 已覆盖 |
| `type`、`api_base`、`param_env`、Azure 与 Vertex 参数 | `docs/models-config.md` | 已覆盖 |
| 密钥解析规则、`api_key` 字面量被拒 | `docs/models-config.md` | 部分覆盖，需补「进程不读取固定 `JEV_API_BASE`/`JEV_API_KEY`/`JEV_ROUTES`/`JEV_MODELS_FILE`」这一条 |
| `gateway` 运行时设置逐项说明 | `docs/models-config.md#gateway` | 已覆盖 |
| 策略 `mode`、`kind`、`tags`、自定义策略注册 | `docs/routing-design.md` | 已覆盖 |
| `storage` 逐项说明与写入语义 | `docs/models-config.md#storage`、`docs/routing-design.md` | 已覆盖 |
| 会话面板行为细节 | `docs/routing-design.md#session-dashboard` | 已覆盖 |
| 端点列表与 `X-JEV-*` 响应头 | 新增 `docs/http-api.md` | 缺失，需新建 |
| reload 语义 | `docs/http-api.md`、`docs/local-install.md` | 部分覆盖 |

### 新增 `docs/http-api.md`

这是本次唯一新增的文档。当前端点清单和 `X-JEV-*` 响应头只存在于 README，删掉 README 那段会让它们失传。

用英文写，与同为英文的 `docs/routing-design.md` 保持一致。API 参考紧贴代码契约，英文也是仓库代码注释、日志和错误的既有语言。`docs/local-install.md` 与 `docs/models-config.md` 保持中文，本次不翻译。

内容包含：

- 端点表：`GET /healthz`、`GET /dashboard`、`GET /v1/models`、`GET /v1/routing/policy`、`GET /v1/routing/strategies`、`POST /v1/routing/preview`、`GET /v1/routing/decisions/{decision_id}`、`GET /v1/routing/sessions`、`GET /v1/routing/sessions/{session_id}`、`GET /v1/routing/sessions/{session_id}/requests`、`POST /v1/chat/completions`。
- 入站鉴权：`gateway.api_key_env` 与 `Authorization: Bearer`。
- 响应头表：`X-JEV-Route`、`X-JEV-Provider`、`X-JEV-Model`、`X-JEV-Route-Label`、`X-JEV-Task-Type`、`X-JEV-Reason`、`X-JEV-Strategy`、`X-JEV-Request-Id`、`X-JEV-Session-Id`、`X-JEV-Decision-Id`、`X-JEV-Reasoning-Effort`、`X-JEV-Reasoning-Source`。
- 策略选择接口：只有请求体 `model` 字段有效，`?strategy=` 返回 `400 unsupported_parameter`，`X-JEV-Strategy` 请求头不参与选择。
- reload 端点与其 `restart_required` 行为。

新增文档进入 README 的文档索引表。

## 3. 协议

### 选择与取舍

| 候选 | 能否阻止闭源 SaaS | 结论 |
| --- | --- | --- |
| MIT / Apache-2.0 | 不能 | 排除，与 R1 冲突 |
| GPL-3.0 | 不能，网络服务不触发分发义务 | 排除 |
| BSL 1.1 | 能，但非 OSI 认可的开源协议 | 排除，与「开源协议」表述冲突 |
| **AGPL-3.0** | 能，第 13 条要求网络交互用户可获得对应源代码 | 采用 |

代价：AGPL-3.0 会让部分企业法务直接拒绝引入，也会挡住把本项目嵌进闭源产品的用法。这是 R1 的直接结果，接受。

版本取 `AGPL-3.0-or-later`（即许可证正文所写的 "either version 3 of the License, or (at your option) any later version"），与 FSF 的默认建议一致，也给未来的 AGPL-4.0 留出升级空间。如果希望锁定 v3，改成 `AGPL-3.0-only` 并调整 README 措辞即可。

### 落盘动作

- 新增根目录 `LICENSE`，内容为 AGPL-3.0 完整正文，从 `https://www.gnu.org/licenses/agpl-3.0.txt` 获取，不手写。
- 根目录 `NOTICE` 不需要，AGPL-3.0 未强制。
- `pyproject.toml` 补 PEP 639 的 SPDX 表达式 `license = "AGPL-3.0-or-later"`，并填 `authors = [{ name = "TexasOct" }]`。
- 不使用 `License :: OSI Approved :: ...` 这类 Trove classifier。PEP 639 已将其废弃，setuptools 77 起禁止与 SPDX `license` 字段同时出现。

### 构建风险

`build-system.requires` 写的是 `setuptools>=68`，而 SPDX 字符串形式的 `license` 需要 setuptools 77 及以上。`uv build` 使用隔离构建环境，会解析到最新 setuptools，预期通过。这点必须在实现阶段用 `uv build` 加 wheel 元数据检查实测确认，不能假定。

如果实测失败，回退方案是按 setuptools 68 到 76 支持的写法声明协议，同时保证 wheel 元数据里仍能看到 AGPL 标识。

## 4. 验收映射

| 验收项 | 由什么保证 |
| --- | --- |
| AC1 | 根目录 `LICENSE` 全文取自 gnu.org |
| AC2 | `uv build` 后解包 wheel，读 `METADATA` 的 `License-Expression` |
| AC3 | 两份 README 顶部互链，人工点击核对 |
| AC4 | README 首屏含定位、能力、快速开始入口 |
| AC5 | 用脚本比对各 README 中出现的 `*_API_KEY` 与 `.env.example`、`models.example.json` |
| AC6 | README 引用 `docs/routing-strategy-map.svg` |
| AC7 | `docs/` 三篇原文的标题与段落数改动前后一致；被移出 README 的条目在 `docs/` 中有落点 |
| AC8 | README 协议章节声明 AGPL-3.0 并说明网络服务义务 |
| AC9 | `uv run pytest -q`、`uv build` 通过 |
