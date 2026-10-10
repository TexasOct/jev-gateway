# Contracts 与 Canvas 并行推进

用户要求先提交当前全部仓库改动，再并发启动两个subagent和worktree。本次提交是继续业务工作的检查点；Contracts、Canvas、Parent33、生命周期、安装和0.1.3发布仍保留未完成状态。暂缓的shadcn计划一起保存，未恢复其实施。

两个worktree均从这次检查点创建，每个subagent只修改自己的worktree。主目录为`/Users/texas/Workspace/jev-gateway`。忽略的历史research和runtime证据继续在主目录只读查阅，不强制加入Git，不把旧目录或现有runtime当作新执行环境。

| 工作线 | 分支 | 独立worktree | 第一阶段交付 |
| --- | --- | --- | --- |
| Contracts | `work/contracts-business-closure` | `/Users/texas/Workspace/jev-gateway-contracts-business` | 保留58行原谓词，映射已有Models/Suppliers与后端证据，识别当前真实缺口。对已证明的当前后端缺陷做最小修复，交付原行映射、实际变更和定点验证计划。 |
| Canvas | `work/canvas-business-closure` | `/Users/texas/Workspace/jev-gateway-canvas-business` | 保留C01至C25，优先处理较新clipping/overlap及gesture/stale/history/写入归属缺口。先定位当前真实owner，交付最小修复或准确缺失证明、原行映射与交互验证计划。 |

Contracts写入范围为后端model/config/metadata/routing owner、相关测试、公共契约文档及其子任务验收记录。Canvas写入范围为routing Canvas、必要的AppShell几何/焦点边界、相关前端测试和其子任务验收记录。遇到对方owner或已完成Models/Suppliers/Settings行为受影响时，在交付中指出具体跨域影响，不直接扩展范围。

每个代理先读取原任务prd/design/implement、context manifests、原验收计划、现有规范及父级范围复核。源码结论、已执行结果、缺失证据与运行准入分别记录。实现代理不能签发独立业务验收PASS，也不能归档任务、发布或合入主分支；父级在交付后核对实际补丁。

原126两次撤销及no third、受保护进程、历史冻结输入、旧断言和所有尚未获准执行的控制保持原约束。新的worktree不提供native身份、监督或第三次执行许可。涉及测试、collection、build、browser、network、安装及native进程的命令，先交付具体隔离和所有权计划，满足原有准入后才执行。不得扩大acquisition、sealing或Broker工具实现来代替业务工作。

检查点提交前执行Git工作区和暂存区whitespace检查，保留提交前index及patch备份。既有源码绑定的测试结果保留历史范围；本次提交不声称补齐完整验收。启动回执和实际checkpoint SHA写入忽略的父级runtime记录，主工作区保持可核对。
