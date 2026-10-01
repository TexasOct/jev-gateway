# README 多语言重构与 AGPL-3.0 协议落地

## Goal

让一个第一次看到 `TexasOct/jev-gateway` 的人，在浏览器里读 README 的前两屏就能回答三个问题：这是什么、值不值得用、多久能跑起来。同时给仓库补上 AGPL-3.0 协议，禁止他人把它做成闭源 SaaS。

## Background

仓库现状（已通过检查确认）：

- 远端 `git@github.com:TexasOct/jev-gateway.git`，分支 `main`。
- 没有 `LICENSE` 文件，`git log --all -- LICENSE` 无历史记录。当前法律状态是「保留所有权利」，他人无权使用、修改或分发。
- `README.md` 448 行，纯英文。顶层章节依次为 Provider and model identity、Configuration and secrets、Gateway runtime、Routing strategies、Routing evidence storage、Session dashboard、Run、Reload、Verification。
- `docs/local-install.md` 与 `docs/models-config.md` 是中文，`docs/routing-design.md` 是英文。
- `docs/routing-strategy-map.svg` 和 `docs/routing-strategy-map.png` 已入库，但没有任何文档引用它们。
- `pyproject.toml` 无 `license` 字段，`authors` 为空，`version = "0.1.0"`，`requires-python = ">=3.10"`。
- 仓库没有 `.github/`，没有 `CONTRIBUTING.md`，没有 `CHANGELOG.md`。
- `models.json` 与 `.env` 被 `.gitignore` 排除，`models.example.json` 与 `.env.example` 是公开模板。

已发现的 README 缺陷：

| 编号 | 缺陷 | 证据 |
| --- | --- | --- |
| D1 | 开篇直接进入 `providers`/`models`/`policy` 三层结构，没有一句话说明它解决什么问题 | `README.md:7` |
| D2 | 启动步骤在文档第 390 行，前 370 行全是配置细节 | `README.md:390` |
| D3 | 策略图已入库却无人引用 | `docs/routing-strategy-map.svg`、`docs/routing-strategy-map.png` |
| D4 | 密钥变量名与公开模板不一致：README 写 `JEV_DEEPSEEK_API_KEY` / `JEV_OPENAI_API_KEY`，`.env.example` 与 `models.example.json` 写 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | `README.md:44`、`.env.example:6`、`models.example.json` |
| D5 | 没有目录、没有端点速查表、没有协议章节 | `README.md` 全文 |

## Decisions

- ToC 取「面向使用者的 C 端产品风格」：开篇先给定位与价值，配策略图，再给最短上手路径。深度配置与实现细节继续留在 `docs/` 下的现有文档。
- 语言为英文与简体中文两份。`README.md` 作默认英文入口，`README.zh-CN.md` 作中文版，两份文档顶部互相链接。
- 协议选 GNU Affero General Public License v3.0（AGPL-3.0），要求通过网络向用户提供服务的修改者，在提供修改版本时以同一协议公开对应源代码。

## Requirements

- R1 确定并落地开源协议，选择必须能阻止他人基于本仓库提供闭源 SaaS。
- R2 README 成为多语言入口文档，至少覆盖中文与英文，语言之间可互相跳转。
- R3 README 开头部分按 ToC 项目风格组织，读者在前两屏内得到定位、价值与快速上手路径。
- R4 现有技术细节不丢失，深度内容下沉到 `docs/`，README 保留导航与最短可行路径。
- R5 修正 D3 与 D4 两处缺陷。
- R6 补齐协议相关的元数据：`LICENSE`、`pyproject.toml` 的 `license` 与 `authors` 字段、README 的协议章节。

## Acceptance Criteria

- [x] AC1 仓库根目录存在 `LICENSE`，内容为 AGPL-3.0 完整文本，GitHub 能识别为 AGPL-3.0。
- [x] AC2 `pyproject.toml` 声明 `license = "AGPL-3.0-or-later"`，且 `uv build` 后 wheel 的元数据包含该协议标识。
- [x] AC3 README 各语言版本均存在，且每份文档顶部都有指向其他语言版本的链接，链接可达。
- [x] AC4 README 首屏包含一句话定位、核心能力概览、以及最小启动步骤的跳转入口。
- [x] AC5 README 中出现的每个密钥变量名，都能在 `.env.example` 或 `models.example.json` 中找到同名条目。
- [x] AC6 `docs/routing-strategy-map.svg` 在 README 中被引用并可渲染。
- [x] AC7 `docs/` 下原有的三篇文档内容未被删减；README 削减的技术细节在各语言版本中均有对应的落点（README 内或 `docs/` 链接）。
- [x] AC8 README 的协议章节声明 AGPL-3.0，并说明它对他人的实际约束。
- [x] AC9 `uv run pytest -q` 与 `uv build` 仍通过。

## Out of Scope

- 不改动 `jev_gateway/` 下的运行时代码。
- 不新增 `.github/` CI、`CONTRIBUTING.md`、`CHANGELOG.md`。
- 不翻译 `docs/` 下的三篇专题文档。
- 不发布到 PyPI。

