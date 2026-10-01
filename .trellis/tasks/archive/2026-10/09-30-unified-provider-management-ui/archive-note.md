# 合并归档说明

用户要求将本规划任务并入正在实施的 `09-30-unified-settings-provider-config`，随后归档来源任务。接收任务继续处理 Settings/Provider 页面整合，并负责核对本任务列出的 Provider 管理目标、已实现范围与剩余缺口。来源任务按 `merged` 关闭，`acceptance_complete=false`；CLI 的 `completed` 状态是归档状态，不表示所有需求已实现或验收通过。

## 接收位置与映射

逐项验收映射保存在 [接收任务的合并记录](../../../09-30-unified-settings-provider-config/research/provider-management-merge.md)。旧 PRD、调研、验收标准和未决决策保留在本归档目录。

合并范围包括 Provider 信息架构和创建/编辑、启用/禁用、凭据配置与验证状态、常用配置快捷方式、成功/字段错误/验证失败/缺少凭据反馈、安全边界，以及原任务要求的设计规划和用户审阅门槛。接收任务逐项核实当前代码及归档 Provider 配置任务树的证据；不支持的行为标记为延期或未完成。不得因来源任务归档而推断启停或主动连接测试 API 已存在，也不得默认增加删除、OAuth 或其他能力。

保留约束：凭据不回显、不放入浏览器偏好；Theme 保持独立存储和 API；Provider 写入继续使用既有授权边界；发现列表与已配置/可路由模型分离，导入需要显式确认。来源 task 的早期“没有 dashboard CRUD API”等调研描述已过时，接收任务应以当前实现和归档验收材料重新核对。

## 归档状态与证据边界

原任务是 planning 状态、没有独立实施证据。归档不代表该任务自身验收通过。其他 Provider 配置树已有 mock-backed 的实现和验收证据，但不证明旧规划中每个功能都已覆盖。官方品牌 artwork 记录为 1/3；模型/凭据验证没有使用真实账户或线上上游。

本次只改任务计划、合并映射和归档记录；没有重跑产品测试，没有更改产品代码。来源任务的其他当前验收缺口需在接收任务中验证或明确 deferred。用户要求使用 `--no-commit`；直接在共享 `main` 工作区，没有 PR 或独立任务提交记录，因此归档时沿用 `--skip-branch-validation`，不修改原分支元数据，不提交或推送。

执行归档前的有效安全快照保存在 `/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-provider-settings-merge-safe-qphh4vhd/`，包含任务目录、会话资料及 Git index/状态。最初由 sandbox 创建的临时快照未能在后续 native bash 中读取，因此重新使用 native 文件操作建立快照后才归档。来源任务最早的资料仍可在此前 `/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-task-archive-user-qp2lfag1/tasks/09-30-unified-provider-management-ui/` 核对；本任务原来空的上下文清单已加入合并映射和现有 Provider 契约。