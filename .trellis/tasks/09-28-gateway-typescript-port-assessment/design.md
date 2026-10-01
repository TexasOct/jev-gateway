# TypeScript/Node.js 与 Rust 迁移评估设计

## 目标与边界

以当前 Python 工作区为可观察行为基线，分别评估 TypeScript/Node.js 与 Rust 原生后端重写的兼容范围、依赖替代、风险及工程量。本次交付研究文档和方案比较，不修改产品实现，不启动迁移。TypeScript 以 Node.js 为运行时基线；主估算限于项目实际使用并通过验证的 provider/参数，完整 LiteLLM provider 覆盖作为独立增量，不计入有限范围主估算。

保留现有 React/Vite TypeScript 前端和 `/dashboard/` 资源路径，不把 UI 重写计入后端移植。1:1 指对外 HTTP、配置、CLI、路由决策、持久化和运行行为兼容，语言、框架及内部线程模型可变；改变 provider 接受面、公共接口或旧数据库格式属于另行批准的行为变更。

## 调研分层

1. 行为基线：盘点源码、测试、配置、部署，建立模块/协议/状态数据流图并记录文件行证据。
2. 分域研究：HTTP/SSE/provider；catalog/路由/策略/配置；SQLite/activity/dashboard；CLI/日志/构建/发行/回滚。各域均比较 Node 与 Rust 替代边界，并估算本域开发及局部测试。
3. 依赖替换：映射 Python 直接依赖及关键传递依赖，区分可由标准库覆盖、需特定 crate/package、自研兼容层、暂留 Python bridge；不从名称相近推断等价。
4. 估算对账：采用同一工程师与人日假设；分别列领域工时、共享 Python golden/差分夹具、语言专项集成、跨域全链路验证。识别并消除子报告间重复计费，无法去重的区间标为未决，不机械相加。
5. 风险与迁移建议：列阻塞输入、先后依赖、阶段验收和回滚条件，区分有限 provider 路径与全量 provider 路径。

## 核心兼容边界

- Provider：先从脱敏部署配置与运行证据冻结 type、参数、认证与调用特性；主估算仅覆盖实际使用且验证的范围。LiteLLM `provider_list` 静态接受集合和实际实现所有 provider 协议是两回事。全量支持须盘点协议、取得测试条件后单列估算。
- HTTP/SSE：校验错误、状态码、头、未识别字段透传、JSON 序列化、SSE 字节格式、`[DONE]`、背压、取消、错误和清理顺序须差分。
- Routing/config/session：对同一输入比较模型/策略选择、排序、舍入、reasoning、preview 副作用、overlay reload/失败回滚、环境变量覆盖和 TTL 并发。
- Persistence/dashboard：在脱敏旧 SQLite 副本上验证 schema 迁移、WAL/FULL、FIFO 有界写队列、flush、留存/脱敏、游标签名及 API/缓存/安全头。
- CLI/release：比较参数/JSON/退出码、PID 所有权、密钥权限、进程信号、安装身份校验、资产和版本升级、容器与回滚。

## 估算约定

以一名熟悉现有 Python 行为及目标语言的工程师、8 小时净工程日估算。模块估算需注明其是否含局部单测/评审；Python golden 样本只计一次并可供两个候选路线复用。各路线总量由模块实现、共享基线准备、候选路线集成/发行及全链路差分组成。对跨域测试和同一工作包若无法明确剥离，展示范围而不重复累加。日历工期不按人日机械换算，需另考虑并行程度、真实上游测试窗口和发布/回滚串行门槛。

估算为静态研究，不是基准测试或承诺工期。未知 provider 数、目标平台、Node/Rust 最低版本、旧库样本和灰度标准必须标注为待决输入。

## 已识别风险

- `activity.py` 与当前相邻调用/测试存在合同分歧，须先定基线。
- 当前真实 provider 范围证据有限；自定义 OpenAI-compatible 地址及 DeepSeek 测试不能代表所有参数/模型/工具/推理场景。
- 客户端断连后的 Python 上游取消和 outcome/continuation 持久化顺序不能仅从 `finally` 推断。
- JS/Rust 与 Python 在 JSON 编码、浮点舍入、Unicode、dotenv 和异常分类上有语义差异。
- SQLite 队列满即拒绝、同队列读顺序和 flush 栅栏是兼容合同，普通异步任务队列可能改变它们。
- 新二进制发行不能沿用仅验证 wheel 的旧安装器；必须保留旧版回滚路径。
