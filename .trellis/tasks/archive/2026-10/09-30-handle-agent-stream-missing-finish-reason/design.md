# 技术设计：处理 agent 流结束缺少 finish_reason

## 边界与现状

该变更位于 FastAPI SSE 响应链路，主要责任模块为 `jev_gateway/gateway.py`。当前 `sse_chunks()` 负责把上游迭代器编码为 SSE，并在迭代器正常耗尽后追加 `[DONE]`；`recorded_stream()` 负责捕获迭代失败、记录 outcome 并发出安全错误。需避免把“上游迭代器耗尽”直接等价成“响应完整”。

当前 LiteLLM 可能在自然 EOF 时合成 `finish_reason`，因此本设计可保证网关对其实际收到的流事件执行终止校验，但不能单凭 LiteLLM 规范化后的 chunk 判断上游线上字节是否曾包含终止标记。任务不引入对特定 provider 的处理；agent 本地 compact 处理属于调用方行为。

## 处理流程

1. SSE 编码层跟踪流中是否出现有效的完成终止原因。增量 chunk 中的 `finish_reason: null` 不表示完成；非空终止原因表示完成。若迭代器正常耗尽但未观察到终止原因，抛出网关自有的安全流协议异常，不生成 `[DONE]`。
2. 既有流记录层捕获该异常，使用与其他上游流异常相同的失败路径：记录 `ok=False`、有界错误类型、无原始错误消息；以固定错误信息记录安全日志。不要将该流错误再包装为向外传播的 `RuntimeError`，因为 headers 已经发送，Uvicorn 会把它记录成 `Exception in ASGI application`。生成器应正常结束，让 ASGI 发送流结束帧；未发送 `[DONE]` 和非空 `finish_reason` 是协议失败信号。
3. 有效终止原因之后，保留现有编码行为并发送 `[DONE]`。如果终止 chunk 之后上游又抛异常，仍按流异常处理，不能因已看到终止原因而覆盖真实迭代失败。
4. 部分 SSE 数据可能已发送，响应 HTTP 状态无法可靠改写为新的 JSON 502。调用方通过缺少正常 `[DONE]` 和非空 `finish_reason` 识别失败；不将错误文本作为新的 SSE completion，也不伪造完成标记。通过抑制网关内部异常的 ASGI 再抛出，避免 Uvicorn 将预期的上游流失败记录成未处理应用异常。
5. SSE 失败处理由网关负责；agent 如何基于本地 compact 处理该失败属于调用方实现，不在网关技术链路中。

## 兼容性及取舍

- OpenAI-compatible 的常见增量 chunk 中 `finish_reason` 为 null，故必须只接受非空终止原因作为完成，不能把字段存在本身当成完成。
- 正常 stop、length、tool_calls 等非空终止原因均视为完成，不限定具体终止值，以兼容协议扩展。
- LiteLLM 合成终止原因这一事实意味着本变更检测的是网关可观察到的流协议，不提供原始上游 EOF 的强证明。若后续需要验证原始 provider 字节，需单独设计绕过/扩展 transport 的方案。
- 已处理的上游流错误以正常 HTTP 200 响应结束，但不含 `[DONE]`；不能保证客户端获得传输层异常。调用方必须检查终止原因或 `[DONE]` 才能识别该不完整响应。

## 测试设计

- 测试含有普通 delta 后正常 EOF、全程没有非空 finish_reason：流消费失败，无 `[DONE]`，outcome 为失败。
- 测试 delta 中 `finish_reason: null` 后再正常 stop：正常输出和 `[DONE]` 不变，记录成功。
- 测试 tool_calls、length 等非空结束原因：成功完成。
- 测试在已有部分 chunk 后抛 `MidStreamFallbackError` 或普通异常：无 `[DONE]`，安全记录失败，不向 ASGI/Uvicorn 再抛网关包装异常，且原始异常内容不外泄。
- 验证网关通用流失败行为；agent 本地 compact 逻辑不属于网关测试范围。
- 如当前 ASGI 测试传输无法暴露迭代异常，使用直接消费响应 body iterator 的测试辅助方式验证，而不降低契约断言。

## 回滚

变更集中在 SSE 终止校验及测试。若出现不兼容，可回滚该校验逻辑，保留现有异常流失败处理；无需数据库迁移或配置迁移。
