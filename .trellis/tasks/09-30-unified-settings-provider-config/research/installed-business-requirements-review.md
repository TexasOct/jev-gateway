# Installed business requirements review

Reviewer `19d75b80-1837-4db` independently inspected the requirements, execution
program, safe results, original SSE and SQLite. The review is read-only and
includes an independent comparison of all 54 wheel/source/installed files.
It certifies the installed candidate's required business contracts; public
publication and the actual operator reset remain pending.

留存数据库和原始 SSE 支持五个核心流契约：每个成功回合都有一条正确来源的新捕获，重装前的所有原始元组也仍在。空 `length` 流保留了 2048 个 reasoning tokens、一个 `[DONE]` 和成功 outcome。补充 JSON 实际是 20 项通过、0 项失败；原始报告仍是 306 通过、2 失败。

PASS：当前必需的安装业务契约和普通重装保留要求已有充分证据，可以继续已授权的发布流程。本结论仅覆盖 wheel `57e49d26d089d3bbe4b06f2e7b03d0344a11a04e881ed4549f84beb4da4f6914` 的本次安装业务范围；公开发布、公开下载安装及实际 operator reset 仍待验收。

| 验收项 | 实际证据 | 判断 |
| --- | --- | --- |
| 空安装 setup、provider save、真实 discovery、确认 import | 执行程序与留存结果对应通过，provider 在模型导入前成功保存 | 满足 |
| 配置编辑、global default、策略分配、reload | baseline 编辑经 reload 激活；有效 overlay 经编辑/reload 后产生指定标签的新会话 | 满足 |
| 三策略真实成功流 | 各有非空可见输出、`stop`、一个 `[DONE]`，无 error event；正确全局模型和 `default` 标签 | 满足 |
| 重装后的默认标签续聊 | 实际发送先前 assistant；重启后成功结束，保留正确 route、label、defaulted 和新捕获 | 满足 |
| 普通重装保留 | 配置、凭据和有效 overlay 的初始字节保留；原始五类业务记录各 3 条及 7 个 config-version 元组，在三个检查阶段均保留 | 满足 |
| 公开 release／实际 reset | 原始结果明确标为未认证 | 未验证，属于后续验收 |

契约来自 [PRD](../prd.md) 和 [实施计划](../implement.md)，执行证据见
[原始报告](./final-installed-business.md) 及其指向的留存结果。

续聊捕获失败属于验证谓词错误，未发现产品缺陷。私有
`business.py::evidence()` 对整段 session 要求 `len(matched) == 1`。实际 assistant
内容重复，因此旧回合和新回合合法共用内容 key。`records.py` 使用普通 INSERT
追加；`provider/base.py` 每次生成新的 `created_at`。独立查询确认，五个非空成功
响应在各自 request/outcome 窗口内均恰有一条正确来源的新捕获，旧记录保留。

2048-token 可见输出断言仍然失败，但不阻断本次必需业务契约。原始 SSE 确认可见
字符为 0、reasoning 字符为 8657，全部 2048 completion tokens 被报告为 reasoning
tokens；`length`、`[DONE]`、EOF 和 native outcome/usage 均正常。PRD 要求真实成功
流终止与默认标签续聊，没有要求这项刻意长输出探针必须得到非空 `length` 响应。
五个核心成功流已满足该要求。[预算分析](./real-budget-analysis.md) 提供类似上游
边界及 serializer replay 证据；它使用较早 wheel，不能单独证明本次 2048 调用的
直接上游表现，也不能保证所有预算都有可见输出。

没有发现由这两个失败引出的冻结代码返工项。原始报告继续保留
FAIL、306 通过／2 失败，发布说明应引用本次契约评审并完整披露空 `length` 边界。
公开资产、精确发布 commit 的平台检查、公开安装和实际 reset 仍须按计划完成后
才能宣告整项任务验收通过。
