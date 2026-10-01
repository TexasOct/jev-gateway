# JEV 当前基线：Agent 自动 compact 兼容性

记录时间：任务创建时的工作区快照。工作区存在大量其他未提交修改，行号及行为应在结论定稿前重新核对。本文件仅调查，不更改产品代码。

## 请求前可见信息

- `jev_gateway/gateway.py:593-619`：`GET /v1/models` 返回策略名及 catalog model 名称的 OpenAI 模型列表条目（id、object、created、owned_by），没有上下文窗口或输出上限。
- `jev_gateway/catalog.py:157-159,172-179,189-204`：物理模型 profile 有可选 `context_window`、`max_output_tokens`；没有填容量时，`fits_context` 会把它视为无限制。因此不能仅因可配置上限就推断全部路由目标有可靠容量数据。
- `jev_gateway/gateway.py:1211-1276`：`POST /v1/chat/completions` 按请求中的 model 解析策略、记录请求，再调用路由决策；客户端发送前无法从此响应知道当前会选到哪个物理模型。
- 当前 `gateway.py` 未找到 `POST /v1/responses` 路由。需要逐客户端验证其是否可选用 chat completions 或其他协议，不能把自定义 base_url 等同于兼容。
- 补充对照调研结果：Codex 当前主线 custom provider 仅接 Responses，Claude Code 需要 Anthropic Messages，Gemini CLI 使用 Gemini 原生协议。这三者不计入 JEV 当前接口的直连覆盖率；旧版 Codex chat 支持不能作为当前版证据。

## 请求后可见信息

- `jev_gateway/gateway.py:231-263`：出站 payload 用 profile 提供的 provider/model 覆盖请求的 model。
- `jev_gateway/gateway.py:284-291`：路由决策会写进 `X-JEV-Model` 等响应头。是否有客户端读取该非标准头并反馈给压缩逻辑，需要逐项核实。
- `jev_gateway/gateway.py:1434,1543-1558`：若 `echo_requested_model` 开启，非流式响应中的 `model` 被回显为请求值；原上游响应的 `model` 单独记录。流式 chunks 在 `sse_chunks()` (`gateway.py:384-402`) 中也可覆盖 `model`。因此默认响应中的 model 不承诺指明当前物理模型。
- `jev_gateway/gateway.py:1543-1558`：非流式响应读取 `usage` 并写入 outcome；需要进一步核实流式 usage 透传、代理适配和所有 Agent 对 usage 的计数口径，不可推断当前能提供精确累计上下文。

## 已知相关任务和边界

- `.trellis/tasks/archive/2026-10/09-30-handle-agent-stream-missing-finish-reason/prd.md` 涉及流终止不完整与调用方本地 compact 处理，是流式异常兼容性参考；该任务不能代替客户端容量契约研究。
- 先前的 Pi virtual model、Codex 客户端保守容量配置是候选方案，不是本任务预设结论。要特别辨别客户端是否在请求前读取容量，是否在切换路由后自动更换上限。
- 调研最终须分清可接入性、自动 compact 能力和 JEV 动态路由下的安全性；其中任一项不能从另外一项推断。
