# 发布 0.1.1 并验收公开安装版本

## Goal

推送已合并的 main，发布稳定版 v0.1.1，并证明实际公开安装版本满足既有功能验收与发布契约。用户已明确授权自主实施、验证，以及必要时删除并重新发布 v0.1.1 tag。

## Background

- 本地 main 为 c29c304bea3f33fcc9e696db3d8104a75ab27d61，包含已验收的 Key 独立连接页和策略画布。
- 远端 main 为 eeb798f18e260ec84475944c627cc05126ab5d83；v0.1.1 tag 和 Release 尚不存在，latest 为 v0.1.0。
- pyproject.toml、jev_gateway/__init__.py 和 uv.lock 仍记录 0.1.0。
- 工作区两份既有 journal 修改属于其他已交付工作，必须保留。

## Requirements

- R1：版本元数据一致，发布源码包含两项已验收功能；main、tag、CI head 和公开产物的关系可核验。
- R2：针对最终发布源码完成前端、后端、类型、构建、锁文件、安装器语法和打包验证。生成的静态资源只进入安装包。
- R3：Ubuntu 与 macOS 对同一份构建 wheel 完成安装验收后，工作流才发布四个指定资产。
- R4：核验稳定版/latest 状态、pinned 与 latest 下载、SHA256、wheel 元数据、入口、模板、license 和包文件内容。
- R5：实际下载的公开 wheel 与公开安装器均完成安装、运行、重装和卸载保存验收；从仓库外使用安装后的命令。
- R6：安装后的公开 dashboard 满足 Key 页 AC1–AC6、画布 AC1–AC9，并保持其他已连接页面兼容。浏览器使用合成 API 场景，真实安装 API 检查使用独立运行目录。
- R7：普通默认路径升级保留配置、凭据、overlay、历史记录和原始服务状态。不得重置配置、迁移已废弃字段或调用真实模型上游。
- R8：保存脱敏的逐项验收、独立评审和发布说明，完成任务归档；保留其他工作区与未提交内容。

## Acceptance criteria

- [ ] AC1：最终版本为 0.1.1，main 已推送，v0.1.1 与发布 CI 指向预期源码。
- [x] AC2：最终源码的 lint、unit、browser、pytest、Pyright、构建时效、lock、shell、wheel/sdist 和 release validator 全部通过。
- [ ] AC3：四个 CI jobs 均成功；两平台的安装证据对应同一 wheel SHA256。
- [ ] AC4：公开 Release 为稳定/latest，恰有四个指定资产；下载、sidecar、GitHub digest、安装器 tag 和全部打包文件核验通过。
- [ ] AC5：公开 wheel smoke 与公开安装器验收实际退出 0，success 为 true；包含带空格路径、独立 uv 环境、生命周期、API 写入与重装/卸载保存。
- [ ] AC6：完整浏览器回归对公开 wheel 提供的静态页面通过，覆盖 Key 页和画布既有验收；证据明确合成 API 与真实本地 API 的范围。
- [ ] AC7：默认安装文件、原有记录元组与服务状态保留；数据库完整，凭据权限正确；无真实生成请求及残留验收进程。
- [ ] AC8：最终报告逐项引用可复核证据，独立评审通过，报告已推送，任务归档，原有 journal 内容保留。

## Boundaries

产品改动限于发布版本元数据及验收发现的必要修复。既有路由语义、布局 schema、鉴权协议和配置写入保护保持既有验收契约。v0.1.0 保留为回滚版本。报告不得提交凭据、操作者配置内容或历史记录正文。
