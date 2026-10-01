# 路由与配置移植估算（Node.js / Rust）

调研范围是当前工作区的静态源码、测试和本任务已有的 `gateway-inventory.md`、`dependency-mapping.md`、`rust-path.md`；未运行服务、测试或真实上游调用。行号按本次工作区读取所得，后续修改须重取。人日是单名熟悉原 Python 行为和目标语言的工程师、每天 8 小时净工作量的规划区间，已含领域单测、差分样本和代码评审，不是已验证工期。Node.js 作为 TypeScript 运行时基线，Rust 路径按原生进程估算。文中候选依赖尚未锁版本或验许可证。

## 范围与计价边界

本表只计算 `models.json` 目录解析和路由配置、`.env` 载入、路由 overlay、canvas layout/theme 文件、配置热重载与回滚、signals/reasoning/decision、策略及 System One 决策链、进程内 session TTL/并发。配置中的 `storage` 字段校验及热重载时调用存储预检计在配置接口对接中，SQLite schema、队列、旧库迁移和持久化续接实现不计。System One 仅计决策请求及答案归一化；`/v1/chat/completions` 的 LiteLLM 请求/响应 transport、SSE、HTTP 框架路由和 CLI 配置写入/密钥文件也不计。总网关估算合并时，不要再次计入这里的逻辑及领域测试。

`models.json:272-284` 当前可见的聊天 provider type 是 `deepseek` 和 `openai`；`models.json:12-30` 的 `decision.providers` 则是两个 `system_one` 决策端点。这个工作区文件只能证明仓库当前示例/本地配置，不能证明生产已验证的 provider 范围。源码实际对聊天 provider 使用 LiteLLM 的完整 `provider_list` 作类型合法性判断，并容许受限制的 `params`、`param_env`，包含 Azure/Vertex 形态的解析测试（`jev_gateway/catalog.py:15,778-859`; `tests/test_catalog.py:181-229`）。因此有两个不同的兼容合同：

- 限定配置合同：冻结实际部署的 provider type、参数名、认证方式和模型组合（只记录名称与行为，不收集密钥值），对确认已验证的集合逐个差分。这是下表的估算前提；聊天 provider 协议适配费用另归 transport。
- 原有静态校验合同：任何锁定 LiteLLM 版本的 `provider_list` 成员仍能通过目录的 `type` 检查，并按现有 `params`/`param_env` 约束解析。若仅用新适配器注册表中的少数类型校验，配置兼容面会缩小；若保留完整名单的静态接受能力，运行调用又可能失败。全名单合法性与全名单实际可调用性都须明确产品决策，不能把名单校验视为实现所有 provider。完整名单、参数和协议组数目未在本次查定，不能给全量 provider 传输报固定人日。`rust-path.md` 对新协议组的条件估算属于 transport 范围，此处不累加。

## 分项人日

区间端点是各项顺序人日之和；共同的 Python golden 配置和样本可以复用，不代表两个目标实现可以共享代码。未计真实上游账户获取、未知 provider 原生协议、前端改造及端到端迁移验收。

| 内部子项 | TypeScript / Node.js | Rust | 工作及验收依据 |
| --- | ---: | ---: | --- |
| 目录模型、策略/标签和 provider 静态约束 | 3 至 5 | 4 至 7 | 解析 `providers`/`models`、策略紧凑格式和旧格式、跨引用、默认 `task_aware`，产出脱敏快照；严格拒绝多余字段并保持模型 ID、排序、默认值（`jev_gateway/catalog.py:552-639,778-979,1647-1752,1798-1898`）。只为限定 provider 集合实现可执行校验；全 `provider_list` 的静态名单兼容另列决策。 |
| `.env` 载入与配置凭证解析 | 1 至 2 | 1 至 3 | 从 `models.json` 邻近文件加载，覆盖已有环境值，解析 `api_key_env`/`param_env` 并保密；在重载时重复载入（`jev_gateway/gateway.py:157-181,974-984`; `jev_gateway/catalog.py:768-859`）。不计 CLI 对 `.env` 的编辑。 |
| Overlay 合并、预检、热重载及失败回滚 | 3 至 6 | 4 至 6 | 基线深拷贝、严格 schema、规则整表替换、模型 tag/priority 覆盖、无效旧 overlay 回退基线；先预检目录/策略及存储设置，然后文件替换、激活或恢复旧字节与旧目录（`jev_gateway/routing_overlay.py:40-145,159-189,236-271`; `jev_gateway/gateway.py:739-753,875-1062`）。不计存储 reconfigure 内部实现。 |
| Canvas layout / theme 文件与校验 | 1 至 2 | 1 至 2 | layout 的节点 ID、坐标、256 节点/65536 字节界限、错误文件默认值；theme 十六进制 seed、缺失/坏文件默认值及两个文件原子写入（`jev_gateway/canvas_layout.py:12-82`; `jev_gateway/dashboard.py:202-265`）。不计 HTTP handler/前端。 |
| Signals 与评分 | 2 至 4 | 3 至 5 | 结构/正则/意图开关、字符和 token 估算、score/tier/evidence；含 Unicode 与舍入差分（`jev_gateway/signals.py:10-119,124-245,266-352`）。 |
| Reasoning effort 与决策编排 | 1 至 3 | 2 至 3 | 路由选完后按实际 label、model ladder 和 client 值处理 `off/preserve/fill/cap/override`；预览与正式决策的副作用区分及决策 evidence 形状（`jev_gateway/reasoning.py:47-216`; `jev_gateway/decision.py:198-266,268-337,531-565`）。不计写入 SQLite 的实现和 provider 请求字段序列化。 |
| 策略注册、Policy/Decision/Matrix 选择 | 4 至 7 | 4 至 7 | 命名策略、工厂注册、manual/cached 绕过、pin/迟滞/升级/候选过滤/回退、matrix 有序规则与本地 label 选择（`jev_gateway/strategy/registry.py:23-143`; `jev_gateway/strategy/policy.py:75-229,230-445,448-582`; `jev_gateway/strategy/matrix.py:23-86`）。 |
| System One 决策链 | 2 至 4 | 2 至 4 | 独立于聊天 provider 的 POST、Bearer、可选 model、超时/非 2xx/坏答案降级、首选 provider 排序、按策略校验答案（`jev_gateway/catalog.py:1475-1533`; `jev_gateway/decision_provider/system_one.py:17-47`; `jev_gateway/decision_provider/__init__.py:40-77`; `jev_gateway/strategy/classifier.py:14-81`）。 |
| 内存 session TTL、首轮并发与有界淘汰 | 3 至 5 | 3 至 5 | 派生 ID、pending intake、快照隔离、原子更新、按 `updated_at` TTL/逐出、reload 的容量与 TTL 变更（`jev_gateway/sessions.py:82-306`; `jev_gateway/gateway.py:145-154`; `jev_gateway/decision.py:221-229,609-659`）。不计磁盘续接 hydrate。 |
| **本研究子集合计** | **20 至 38** | **24 至 42** | Rust 两个大项与已有 `rust-path.md` 的 catalog/config 10 至 18、routing/session 14 至 24 完全对齐；它们是已有 Rust 全网关 120 至 216 人日里的拆分，不能额外相加。 |

若必须保留锁定 LiteLLM 全 `provider_list` 的**静态类型检查**，先把锁版本名单导出、冻结并核对别名/新增/移除及快照测试；初步另留 Node.js 1 至 3、Rust 1 至 3 人日用于配置名单契约，不包含该名单对应的调用能力或新协议测试。名单实际规模及从 LiteLLM 提取的可重复性待核实，故此为条件预算而非对全 provider 覆盖的报价。新增原生 provider 协议和特殊认证的增量须归 transport 专题，以生产矩阵重新估算。跨目标共用的 Python golden 获取成本应在整案“行为样本”项只计一次；本表的差分工作限本领域。

## 替代依赖和语义差异

| 现有边界 | TypeScript / Node.js 候选 | Rust 候选 | 不可机械替换之处 |
| --- | --- | --- | --- |
| Python 标准库 JSON、dataclass、`MappingProxyType` 与目录解析（`jev_gateway/catalog.py:5-13,552-639`） | `JSON.parse` 加显式类型守卫；可考虑 Zod 或 JSON Schema 校验，但要分别实现目录的严格多余字段拒绝及其 Python 错误路径。 | `serde`/`serde_json::Value` 加显式校验；按需使用类型化结构；不能让 serde 默认字段处理决定旧合同。 | `type(value) is int` 排除布尔值；JS number 默认双精度，还须单独拒绝非整数/超安全整数。映射遍历、浮点排序、空值与错误信息要用 golden；不因复用校验库改变接受面。 |
| `.env` 的 `load_dotenv(path, override=True)`（`jev_gateway/gateway.py:176-181,981`） | `util.parseEnv` 解析后显式合并到配置快照/所需环境；Node CLI `--env-file` 在冲突时保留已有环境，不能直接代替 override。库 `dotenv` 也是候选，但版本与 override/插值语义待测。 | `dotenvy::from_path_override` 官方文档明确覆盖现有变量；尽量把解析结果交给配置快照，不让并发请求读取时改变进程环境。 | Python `.env` 的展开、重复键、引号和空值规则要对比。现在 Python reload 在预检前就修改进程环境，即使目录拒绝也未恢复环境（`gateway.py:981-996`）；迁移不可擅自宣称失败会回滚 `.env`。若选择消除该副作用，应记为行为变更并单独批准。 |
| Overlay/theme/layout 文件及锁（`jev_gateway/routing_overlay.py:236-271`; `jev_gateway/canvas_layout.py:65-82`; `jev_gateway/dashboard.py:239-265`; `jev_gateway/gateway.py:875-1062`） | `node:fs` 同目录临时文件 + rename、应用级写锁和不可变目录快照。 | `std::fs` 临时文件 + rename，Tokio 入口用同步互斥的短临界区或异步锁，禁止持锁跨无界外部等待。 | Node 单线程事件循环不自动保证跨 `await` 的配置更新原子性；Rust `Arc` 下不能先原位修改共享目录。保留原文件字节回滚、旧 overlay 非致命、layout/theme 不触发策略 reload。不同 OS 的原子替换保证需在部署目标验证。 |
| Signals/effort/策略（`jev_gateway/signals.py:186-192,266-352`; `jev_gateway/reasoning.py:126-172`; `jev_gateway/strategy/policy.py:139-445`） | 原正则逐条对照，按 Unicode code point 计 Python `len` 所对应的字符而非直接用 JS `String.length`；自行实现 Python ties-to-even 舍入。 | Rust `chars()` 适用于一般 Unicode 标量计数，仍须验证 CJK 正则覆盖与 Python `re`；实现等价舍入。 | Python `round` 负载中的 `other/4` 以 ties-to-even 收敛，而 `Math.round` 对 `.5` 朝正无穷；换 tokenizer 会改变路由。策略的候选排序和阈值边界还要固定分数/证据顺序。 |
| System One 使用 HTTPX（`jev_gateway/decision_provider/system_one.py:17-47`） | Node `fetch` + AbortSignal、手工检查非 2xx、超时秒转毫秒、严格校验 JSON 与答案；不要和聊天 provider SDK 混为一个 client。 | `reqwest::Client` + 明确 timeout/status 校验、`serde_json` 类型守卫。 | HTTPX 的 `raise_for_status`、超时分类、解析失败所触发的有序 failover 均要复刻；`fetch` 本身不会对非 2xx 抛异常。无密钥跳过且在调用当时读取 `api_key_env`，不能把上次 reload 时的密钥固化为 System One 的全部行为。 |
| Python 进程内 `threading.RLock` + monotonic TTL（`jev_gateway/sessions.py:82-99,125-181,231-262`） | 单进程 Map 与短同步 mutate 临界段；若跨 Worker Thread 或 cluster，另建消息所有者，不把进程级 session 冒充共享状态；`performance.now()` 毫秒单调计时。 | `Arc<Mutex<...>>`/分片 map + `std::time::Instant`，显式区分 epoch 记录时间和 TTL 的单调时钟。 | pending intake 第一次时间的 min、容量淘汰的平局顺序、`>` 而非 `>=` 的过期边界、`copy()` 清空 adapter state、两个首轮同 ID 只创建一个 canonical state，均须差分。 |

Node `util.parseEnv` 能返回解析对象，但与 python-dotenv 对复杂插值的等价性未证实；Rust crate 也同理。以这些库作为候选不表示已经完成选型。

## 推荐的兼容样本

先用脱敏固定目录和受控 System One 假端点从 Python 生成预期输出；参数化同一输入运行两种新实现。不要在 golden 中放 `.env` 值、生产 URL 或用户正文。

1. 目录边界：有效 `deepseek`/`openai` 两项、model ID 与 provider type 分离、缺 key、重复 ID、未知键、禁止明文 `api_key`、`params`/`param_env` 重叠、保密快照；再用测试里的 `azure` 和 `vertex_ai` 静态目录明确检验“可解析”和“实际可调用”的区别（`tests/test_catalog.py:92-129,181-238`; `jev_gateway/catalog.py:778-859`）。策略紧凑格式/默认名/旧格式对照 `jev_gateway/catalog.py:1647-1752,1798-1888`。
2. `.env`：进程环境与文件同名键、缺失/空白 key、`param_env`、重载时覆盖、无效目录后旧活动目录是否仍在；对照 `tests/test_gateway.py:145-177,2305-2442`。环境副作用单独测，不将旧活动 catalog 的保持误读为环境回滚。
3. Overlay：空/坏/旧版本文件、未知策略/模型、规则整表替换、标签继承、baseline 字节不变、验证无副作用、PUT/DELETE 失败恢复原字节、重载后应用；对照 `tests/test_routing_overlay.py:26-159`、`tests/test_gateway.py:2129-2299`。layout 的 Unicode ID、65536 字节、错误文件默认值看 `tests/test_canvas_layout.py:18-56`；theme 的写/重置/损坏及写权限看 `tests/test_gateway.py:918-1077`。
4. 信号/推理：无 pattern 权重仍报告 intent，CJK/emoji、非 CJK 长度造成 `.5` 舍入、score 阈值、客户端非法 effort、无 ladder、`cap`/`override` 和 pin 后 tier；对照 `tests/test_signals.py:12-171`、`tests/test_reasoning.py:48-333`。预览不增加正式决策和 session 事件；比较 `decision.as_dict()` 而不比较随机 ID。
5. 决策/策略：System One 可选 `model`、优先顺序、首端点 5xx/超时/坏 JSON/无效 choice 再尝试下一个、全部失败的本地 fallback，manual 及 cached 绕过；对照 `tests/test_decision_provider.py:19-125`、`tests/test_decision_strategy.py:66-210`、`tests/test_decision_matrix.py:72-262`、`tests/test_decision.py:19-320`、`tests/test_custom_labels.py:25-269`。对 `task_aware` 的预留最高档和规则顺序再取 `tests/test_task_aware_matrix.py:27-260`。
6. 会话：假时钟恰好 TTL 与超过 TTL、两条相同 ID 首轮并发、pending intake 先于路由后合并、淘汰同时间顺序、缩小 max_sessions/TTL reload；对照 `tests/test_sessions.py:72-299`、`tests/test_gateway.py:327-382,2578-2594`。Node 异步 handler/Rust Tokio 任务都要用并发屏障，不仅用串行单测。

这些是待执行的迁移验收样本，不表示本次已跑测试。受控假决策端点可覆盖本领域 HTTP 请求形状；聊天 provider 的真实 upstream wire、SSE/取消、SQLite 和 CLI 合同由其他研究项负责。

## 外部资料和待核实项

已通过官方或语言权威文档核对的有限事实：Node 文档的 [环境变量 API](https://nodejs.org/api/environment_variables.html)列出 `util.parseEnv` / `process.loadEnvFile`；[CLI `--env-file`](https://nodejs.org/api/cli.html#--env-filefile)说既有环境优先；[性能计时器](https://nodejs.org/api/perf_hooks.html#performancenow)给出 `performance.now()` 相对进程启动的毫秒值。[dotenvy `from_path_override`](https://docs.rs/dotenvy/latest/dotenvy/fn.from_path_override.html)说明覆盖及重复声明取最后值；[Tokio `Instant`](https://docs.rs/tokio/latest/tokio/time/struct.Instant.html)说明时间不倒退而不保证匀速。[Python `round`](https://docs.python.org/3/library/functions.html#round)说明平局取偶；MDN 的 [Math.round](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round)说明 `.5` 朝正无穷，[String.length](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/length)说明按 UTF-16 单元计长。`dependency-mapping.md` 与 `rust-path.md` 已列 Node/Rust 其余候选依赖的官方资料，本页不重复声称它们是 LiteLLM 1:1 替代。

待核实：目标 Node 和 Rust 最低版本与 crate/package 锁定 API；Python dotenv 与候选解析器的插值/引号差异；不同部署文件系统的 rename 与权限；生产 provider type、认证及特殊参数矩阵；多进程部署是否要求共享 session（当前仅单进程）；具体跨语言 JSON 顺序、正则 Unicode/浮点阈值以及并发故障基线。任何一个范围决定改变，都要重估相关行，而不是直接挪用本表上界。
