# 存储与监控移植评估

调研范围：当前工作区的 `records.py`、`activity.py`、dashboard 监控 API、游标与静态资产；只读查看源码和测试，没有运行测试或打开真实旧库。行号对应本次工作区快照。`dashboard.py`、`gateway.py`、`tests/test_gateway.py` 已修改，`activity.py`、`tests/test_activity.py` 尚未纳入 Git 跟踪，后续改动须重取基线。本页不估上游 API、路由决策、CLI 或发行。前端沿用现有构建产物和 `/dashboard/` URL，不重写 React。参考同任务 `research/gateway-inventory.md`、`research/dependency-mapping.md` 和 `research/rust-path.md`；后者全项目 Rust 表的存储 18 至 32 人日、dashboard 7 至 13 人日可用作本页拆分的核对，不应与本页再相加。

## 当前合同与迁移风险

| 边界 | 仓库文件:行证据 | 必须对照的行为 |
| --- | --- | --- |
| Schema 与旧库 | `jev_gateway/records.py:55-216,746-795,900-929`; `tests/test_records.py:90-159` | 六张表及 `decision_evidence` 视图，索引名、字段可空性及类型保留。启动执行 schema、增补 `decisions` 两列，再把旧 `requests.requested_model NOT NULL` 表重建为可空，并重建视图。不能只依赖 `CREATE TABLE IF NOT EXISTS`。`PRAGMA journal_mode=WAL`、`synchronous=FULL` 和忙等待 5000 ms 默认值保持；新文件以 0600 创建并拒绝显式符号链接路径。旧库中 `rowid`、`continuation_id` 是排序/分页依据，不可换成 request ID 排序。 |
| 排队与可靠性 | `jev_gateway/records.py:1395-1599`; `tests/test_records.py:581-638` | 4096 默认有界队列；写入请求只入队，队列满立即拒绝。专用线程独占 SQLite，读查询也排在同一队列并等待结果；`flush()` 追加同步栅栏，成功表示之前接受的工作执行完。后台任一操作失败后标记不可用，后续提交和关闭报错；关闭排空已接受工作。`register_config`/写请求在入队前复制对象，避免调用方修改快照。存储失败不应改变正常服务结果，启动失败降为 unavailable store（`records.py:1611-1622`; `tests/test_gateway.py:1731-1784`）。 |
| 留存、JSON 与脱敏 | `jev_gateway/records.py:440-571,796-885,941-1055,1242-1291,1335-1392`; `tests/test_records.py:162-267,373-468,486-548` | 配置 hash 用 Python 排序键、紧凑 UTF-8 JSON 的 SHA-256 前 32 个十六进制字符；内容关闭仍保留 prompt digest 和计数。秘密字段及文本凭证遮蔽，内容字段用带类型/数量的 omission 对象；旧库非法 JSON 有各字段不同的安全回退。每第 256 次写事务按 `received_at DESC,rowid DESC` 裁剪请求并清理附属记录；默认无 request 数量上限。续接按自增 ID 保序，分别限制每会话轮数及会话总数。JSON 编码/数值、正则及 Unicode 处理不同可能造成 hash、脱敏与旧库读取差异。 |
| 活动快照 | `jev_gateway/activity.py:12-121`; `jev_gateway/gateway.py:422-447,1230-1239,1274-1285,1380-1420`; `tests/test_gateway.py:1841-1955` | 进程内 request token 到不可变 path、stream token 集合，双重 finish 幂等；容量 4096、异常后 `complete=false`，只返回聚合路径，不含 session、request、内容。`instance_id` 每实例生成，路径稳定排序，关闭时 clear；不从 SQLite 重建。响应端 `Cache-Control: no-store`、Bearer 校验见 `dashboard.py:299-315`。当前代码 `window_seconds=0` 且 `in_flight_requests`，与同工作区 `tests/test_activity.py:10-89` 的 `arrive`/`finish_stream`、60 秒窗口和 `recent_request_remaining_ms` 断言不一致；`tests/test_gateway.py:1958-1976` 仍断言旧字段，`gateway.py:1277-1279` 仍调用 `finish_stream`。先确认预期基线并修复/隔离陈旧测试，不能拿这些断言当新实现的通过证据。 |
| 聚合与分页 | `jev_gateway/records.py:1057-1240`; `jev_gateway/dashboard.py:64-117,167-199,317-478`; `tests/test_gateway.py:1124-1321,1341-1550,1731-1784` | provider 摘要窗口为 `[end-900,end)`，以 `upstream_requests.created_at` 统计提交尝试；未完成、无流量、存储关闭/故障分别表达。会话列表只含内存中仍存活的会话，补入最新请求/决策证据；按有证据优先、时间和 session ID 倒序。请求详情仅对活会话开放，以 `(received_at,rowid)` 倒序且同时间用 rowid 破平，缺失决策/结果也要返回。列表严禁泄露 prompt 和内存事件，详情可按 capture 选项暴露允许的字段。 |
| 游标及静态服务 | `jev_gateway/dashboard.py:46-145,268-297,370-478`; `jev_gateway/gateway.py:722-737`; `frontend/vite.config.ts:5-15`; `tests/test_gateway.py:852-881,1462-1548` | 游标是紧凑 JSON `[1,endpoint,session_id,key]` + 32 字节 HMAC-SHA256，再做无 padding URL-safe base64。每个 router 实例随机密钥；限制 4096 字符、字符集、签名、作用域、键形状与有限数值，错误返回 400 `invalid_cursor`。默认每页 30、上限 100；session ID 可以含 `/`。`/dashboard` 不跳转直接给 HTML 200/no-store，`/dashboard/assets/` 使用长缓存及 immutable；静态资源和 HTML 设置 CSP、nosniff、no-referrer，缺 bundle 的错误由 shell 路由控制。静态服务还须抵御路径穿越与错误 fallback；其他路由的 auth 行为不应被静态 mount 覆盖。 |

这里有两处需先核实的基线分歧：活动模块和相邻测试/调用尚未收敛；静态资产的实际 hash 文件名及测试 fixture 随前端工作区变化。估时假设先确定活动的目标合同，未把修复现有 Python 代码计入移植工时。

## TypeScript / Node.js 路径

- SQLite 候选为 Node `node:sqlite` 的 `DatabaseSync` 或 `better-sqlite3`，放在 `worker_threads` 专有 Worker 中，通过消息 ID 返回结果；主线程自行实现有界、非阻塞 `tryEnqueue`、错误状态、FIFO、flush 栅栏及 drain-on-close。两个 SQLite API 都是同步的，直接在 HTTP 事件循环使用会阻塞。Node 内建模块的成熟度和目标最低 Node 版本尚未确定，不能现在锁包；若选择原生 addon，还要验证其平台二进制可用性（本页不估打包）。强制执行现有 SQL、PRAGMA、transaction 及旧表重建，并在应用层显式处理文件权限/符号链接。`node:sqlite` 默认启用外键约束的文档事实值得特别测：当前 schema 未声明 foreign key，不能预设未来扩展也无影响。来源：[Node SQLite](https://nodejs.org/api/sqlite.html)、[Node Worker 消息](https://nodejs.org/api/worker_threads.html)、[better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)。`better-sqlite3` 的锁定版本、授权、整数返回类型和跨线程连接使用方式待核实。
- 活动表用内存 Map/Set、单事件循环的原子更新或显式串行化状态边界；完成/断连/退出同一清理函数。不能把异步回调先后、Worker 消息排序默认看成 Python 锁保护的等价。若当前新 `begin_request` 合同被确认，沿 token/map 快照实现；若旧 60 秒窗口恢复，则增加 monotonic clock 注入、过期/上限测试。
- Dashboard API 可沿所选 Node HTTP 框架实现，但响应形状、错误体、`no-store` 和鉴权自定义。游标用内建 `node:crypto` 的 HMAC 与恒时比较，先验证长度再比较；按原始 JSON 字节签名，而非对象重序列化后验证。静态服务显式划分 HTML 与 hash 资产、限制目录路径并附同一 CSP/缓存头。`JSON.stringify` 的键顺序、浮点、整数精度和 Python `json.dumps`/SQLite REAL 映射须用 golden 校正，尤其 config hash 与游标日期值。来源：[Node Crypto](https://nodejs.org/api/crypto.html)；具体框架及 SQLite 绑定版本待核实。

## Rust 路径

- `rusqlite` + 专属 OS 线程持有连接，Tokio 有界 mpsc `try_send` 作为非阻塞入口，oneshot 回执供读和栅栏等待；将关闭、Worker 错误及已接受操作做明确状态机。和现有读写同队列顺序一致；切勿把 `send().await` 或散落的 `spawn_blocking` 直接视作等价。SQL 仍沿用原 schema/迁移/窗口函数；设置 WAL/FULL、busy timeout 与权限/路径检查。`rusqlite` 有 transaction、execute_batch、pragma helper；Tokio 文档确认 `try_send` 队列满立即返回。来源：[rusqlite Connection](https://docs.rs/rusqlite/latest/rusqlite/struct.Connection.html)、[Tokio Sender](https://docs.rs/tokio/latest/tokio/sync/mpsc/struct.Sender.html)。crate 版本、bundled SQLite 版本和许可待定。
- `serde_json::Value` 用于旧库 JSON/遗漏字段的逐字段映射，hash 则须复刻 Python 排序与 UTF-8 紧凑编码，不能直接把 `Value` 默认序列化当成兼容。脱敏优先实现显式字段遍历和对照正则，异常值给安全占位；activity 用单一受控 Map 与注入时钟，异常时只降级监控，不让查询阻塞服务。
- 游标可选 `hmac` + `sha2` + `base64` 的 URL-safe/no-padding，输入先验界、再验签和 scope/key；CSP/缓存自行设置。静态候选 `tower-http::ServeDir` 仅承担文件查找，`/dashboard` 及安全头由上层实现。来源：[hmac](https://docs.rs/hmac/latest/hmac/)、[base64 URL_SAFE_NO_PAD](https://docs.rs/base64/latest/base64/engine/general_purpose/constant.URL_SAFE_NO_PAD.html)、[tower-http ServeDir](https://docs.rs/tower-http/latest/tower_http/services/struct.ServeDir.html)。库的默认 MIME、目录、安全 header、文件丢失行为仍要实测。

SQLite 官方说明 WAL+FULL 在每次提交同步 WAL；它是数据库提交的持久化设置，不能把“消息进队列”当作 fsync 完成。来源：[SQLite WAL](https://www.sqlite.org/wal.html)。旧表重建按仓库原 SQL 做兼容测试，不假设目标 SQLite 各版本的 `ALTER TABLE` 功能相同；参考 [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html)。

## 分项估算（净工程人日）

前提：一名熟悉对应语言与现有 Python 合同的工程师，每日 8 小时；已有脱敏旧库样本及前端产物；含模块单测、代码评审和此范围内的差分验收；不含 Python 当前活动分歧的产品决策、外部 provider/CLI/发行、跨模块集成总账。区间是规划估算，不是已完成原型测量。共享的旧库样本、脱敏基准与差分夹具只在一条迁移路线中计一次；若两条路线并行验证，可复用，不应双算。

| 独立工作项 | TypeScript/Node.js | Rust | 估算驱动 |
| --- | ---: | ---: | --- |
| Schema、旧库迁移、视图/索引与 SQLite 权限 | 4 至 7 | 5 至 8 | 旧 `requested_model` 重建及 WAL/FULL、旧行保留。 |
| 专用队列、线程生命周期、flush、故障降级 | 5 至 9 | 6 至 10 | FIFO 与队列满/断线/关闭的边界；Node Worker 通信或 Rust 通道/线程。 |
| 记录写入、查询、留存、续接与脱敏 | 7 至 12 | 7 至 12 | 六表的字段映射、两种分页、统计、非法 JSON 和安全内容处理。 |
| 进程内 activity | 2 至 4 | 2 至 4 | 以当前新 token 版合同为前提；旧窗口设计若被恢复须重估。 |
| Dashboard 监控 API、游标、静态资产/安全头 | 6 至 11 | 7 至 12 | 内存与库证据合并、签名游标及 HTML/资产分缓存。 |
| **本范围合计** | **24 至 43** | **27 至 46** | 各项顺序相加；与全项目估算的对应项重叠。 |

共同准备工作若尚无旧库/脱敏 golden：另计 3 至 6 人日采样、生成测试基准和审查敏感数据；此项可跨两路线共享，未入上表。若活动目标合同未定，以上 activity 区间不含澄清和基线修复。Rust 全项目粗估原先存储 18 至 32、dashboard 7 至 13（合计 25 至 45），本页细化含 activity 的 27 至 46，属于同一工作范围的更新区间，不能叠加。

## 跨旧库验收办法

1. 从各代旧库制作已脱敏、只含合成内容的 fixture：缺 `upstream_requests` 表、缺两列的 `decisions`、`requested_model NOT NULL`、现行 schema；分别保存 `sqlite_master`、`PRAGMA table_info/index_list`、关键行及视图查询的基线。原库只读备份，两个候选各在拷贝上启动迁移，确认 `requested_model=NULL` 可插入，旧行内容、索引和视图保留，重复启动应幂等。旧 `requests` 重建时 Python 没有显式复制 `rowid`，因此不能要求数值不变；要对照迁移后相同时间戳的实际分页顺序。现有起点：`tests/test_records.py:90-159`、`records.py:746-795,900-929`。其他历史 schema 是否存在，需要库样本确认。
2. 在 Python 与候选实现各自的新库按相同固定时钟和输入录入 request、decision、upstream、outcome、continuation；`flush` 后对照 SQLite 行/视图、`counts`、session detail、provider 窗口边界、同时间 rowid 排序和旧 JSON 损坏回退。再分别 reopen 并读取对方的库，验证双向兼容与续接插入顺序。测试入口：`tests/test_records.py:268-403,430-548`、`tests/test_gateway.py:1124-1550`。
3. 以合成凭证、嵌套 payload、关闭内容捕获样本比对存储字节、摘要及 API 返回；测试 `api_key`、Authorization、token 计数字段、任意对象/数组 omission、非法旧库 JSON。绝不把真实密钥或原始用户 prompt 放入 fixture。`tests/test_records.py:162-267,373-418`、`tests/test_gateway.py:1551-1680`。
4. 人为卡住 writer 并填满 queue；断言提交即时失败、先前工作顺序保持、`flush` 栅栏、读写故障后状态及关闭排空。重复用只读/不可写目录、符号链接和 SQLite lock 场景验证降级；仅活动/证据不可用时监控标记不完整，不能凭空报零次成功。`tests/test_records.py:561-638`、`tests/test_gateway.py:1298-1321,1731-1784`。
5. 对同一活会话快照采集两种实现的列表、详情和活动响应。固定密钥仅用于测试字节级签名；生产游标密钥每实例随机，旧实例游标跨重启失效是现有行为。测游标篡改、超长、跨端点/跨会话、`NaN`/无穷与同时间翻页；还测带斜杠的会话 ID。页面内容只可相比较已定义字段，不能把两次启动的随机 instance ID 或不同 `time.time()` 视为回归。`dashboard.py:80-117,370-478`、`tests/test_gateway.py:1462-1548`。
6. 用打包后的现有 Vite 产物请求 `/dashboard`、`/dashboard/`、资产、缺失文件及非法路径，逐项核对状态码、MIME、CSP、`nosniff`、`no-referrer`、no-store/immutable；鉴权测活动和监控数据端点，不把静态 HTML 混作受保护的数据 API。`dashboard.py:46-145,275-315`、`gateway.py:722-737`、`tests/test_gateway.py:852-915`。本次尚未执行以上验收。
