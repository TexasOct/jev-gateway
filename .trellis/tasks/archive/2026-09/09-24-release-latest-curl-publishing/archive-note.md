# 归档说明

2026-09-30 按用户要求归档历史父任务。先归档 `09-26-release-hosted-curl-installer` 子任务，再关闭此记录；保留历史 children 列表。不新建任务、不提交 Git。

Release 资产安装契约、版本选择、离线校验及发布流水线已进入仓库。子任务保存具体安装器实现记录，README、`docs/local-install.md` 和 `docs/releasing.md` 保存当前用法。

本轮安装脚本及发布校验测试随相关后端测试运行，合计 268 项通过。没有创建 tag、发布 Release、连接线上安装入口或在真实用户目录安装。归档表示关闭历史实现任务，不代表线上发布验收完成；保留原清单和研究材料。

任务记录为 `branch=main`、`base_branch=main`，无 PR 地址；对应实现位于 `main` 的 `6be46a6`、`76cd9b6` 等提交中。使用 `--no-commit --skip-branch-validation`，不声称发生了 PR 合并。
