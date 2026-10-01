# 实施计划

## 顺序

1. 阅读 `jev_gateway/gateway.py` 的 SSE 编码和 recorded stream 生命周期，以及 `tests/test_gateway.py` 对流成功、异常和 outcome 的断言。
2. 在 SSE 编码路径增加终止原因跟踪：允许中间 chunk 的 null 值；只有在正常迭代结束且未见非空终止原因时产生受控的协议异常；异常路径不得输出 `[DONE]`。
3. 接入既有安全流失败处理，确保异常被记录为失败且无原始错误内容写入记录、日志或响应；不把已处理的流失败再作为异常抛至 Uvicorn，避免 `Exception in ASGI application` 噪声。
4. 增加正常 stop/null delta、无终止原因 EOF、`MidStreamFallbackError` 和普通迭代异常、tool_calls/length 终止原因测试；检查 ASGI 发出的 body 终止帧、失败记录和安全日志。网关不添加 agent 场景专用重试，由调用方 agent 本地 compact 处理。
5. 更新 backend error-handling spec，记录缺少终止原因 EOF 的失败契约及流异常不得重抛至 Uvicorn。

## 验证命令

- `uv run pytest -q tests/test_gateway.py`
- `uv run pytest -q`
- `uvx pyright`

## 风险与回滚点

- LiteLLM 可能在适配层合成终止原因。验证范围是网关接收到的归一化流事件，不声称检测原始 provider 字节流截断。
- 流错误发生时 HTTP headers 可能已发送，不能改为普通 JSON 错误响应；调用方应以缺少 `[DONE]`/终止原因判定。网关处理后不向 ASGI 再抛异常，避免 Uvicorn 记录未处理应用异常。
- 任何错误分支不得追加 `[DONE]`。
- 若正常 LiteLLM/现有 fixture 确实不产生合法终止原因，先核实协议及实际测试流，不得简单放宽为 EOF 成功。
- 回滚只需移除终止原因校验与新增契约测试，不涉及数据迁移。
