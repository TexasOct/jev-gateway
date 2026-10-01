# PRD: 处理 agent 侧流结束缺少 finish_reason

## 目标

让 JEV 在流结束缺少 `finish_reason` 时将不完整响应标记为失败，并避免 Uvicorn 记录网关自行包装后抛出的 ASGI 异常。该 agent 场景的恢复由调用方 agent 使用本地 compact 处理。

## 背景

用户报告 agent 侧反复出现：

```text
Error: Stream ended without finish_reason
Error: Retry failed after 3 attempts: Stream ended without finish_reason
```

仓库已有上游流错误处理与流式响应测试。初步调查确认：`jev_gateway/gateway.py` 的 `sse_chunks()` 在迭代器正常耗尽时直接发送 `[DONE]`，没有验证终止原因；流迭代抛异常时，`recorded_stream()` 记录失败并中断流，不发送 `[DONE]`。已安装的 LiteLLM 在正常耗尽时可能合成 `finish_reason`，因此网关接收到的终止原因不一定能证明上游发送过终止标记。此前 JEV chat 路由没有同一请求的 chat 重试。新提供的日志显示该失败由 LiteLLM `MidStreamFallbackError` 在流迭代期间触发；当时网关记录 `routing stream failed` 后将异常包装成 `RuntimeError` 抛回 ASGI，因而 Uvicorn 又记录 `Exception in ASGI application`。原始上游错误原因尚未从现有日志中确定。早前 Ctrl-C traceback 中的 `KeyboardInterrupt` 和 `CancelledError` 属于服务关闭过程，不应与该请求流失败混为一谈。

## 需求

- 区分网关所见的正常耗尽、流迭代抛异常和 agent 侧解析失败；现有仓库未包含 agent 实现，本任务不以外部堆栈为前置条件。
- 对缺少终止原因或上游中途异常的流做一致处理：不发送正常终止事件，将请求记录为失败，并避免将内部异常作为未处理 ASGI 异常抛给 Uvicorn。调用方必须能够从缺少 `[DONE]` / 终止原因识别失败。
- 不为此 agent 场景添加网关自动重试、续接或响应拼接；调用方可自行使用本地 compact 处理失败。
- 失败响应不发送正常 `[DONE]` 或非空终止原因，调用方可据此识别失败并使用自己的恢复策略。
- 保留已发送内容，并确保异常结束时响应、日志和记录行为可诊断且遵守现有错误处理约定。
- 覆盖异常终止、正常终止及流已开始向客户端发送后的行为；agent 重试耗尽属于外部调用方行为，不在网关验收范围内。

## 验收标准

- [ ] 回归测试覆盖底层流在没有 `finish_reason` 时正常耗尽的情况，并验证客户端可观察到的中断行为。
- [ ] 测试证明正常完成的流行为未改变。
- [ ] 测试验证缺少终止原因的流会被中断，不发送 `[DONE]`，且不会被记录为成功。
- [ ] 测试验证流已向客户端发送任意 SSE 数据后发生迭代异常时，不发送正常终止信号；请求记录为失败，ASGI 层不再收到网关自行包装后抛出的未处理异常。
- [ ] 失败流不含正常 `[DONE]` 或非空终止原因，即使 HTTP 200 正常结束，调用方仍可据此识别失败。
- [ ] 日志和持久化记录符合项目既有错误处理与敏感信息约束。

## 范围外

- 不在本任务中修改 agent/上游服务自身的实现或网络稳定性。
- 不加入对特定模型或 provider 的专用行为，除非研究证明是必须的兼容处理。
- 不修改 agent 实现；agent 本地 compact 恢复属于调用方范围。

## 已确认的产品行为

对于本 agent 场景，由调用方 agent 使用本地 compact 处理。网关不针对该场景添加自动重试、续接或响应拼接；正常流终止校验和通用流异常安全处理继续遵循既有契约。
