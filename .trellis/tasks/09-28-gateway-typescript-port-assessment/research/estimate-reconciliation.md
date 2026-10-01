# Node.js 与 Rust 移植估算对账

本页对照本任务的七份研究文件，仅核算已有区间及其工作边界；没有执行移植、测试或真实上游调用。人日均指单名熟悉对应语言和 Python 基线的工程师、每日 8 小时净工程时间的顺序工作量，不是日历工期。TypeScript 路线以 Node.js 为运行时基线。两种语言是替代方案，不能把两列相加。

## 输入、计算与结论

| 研究文件 | 对账作用 |
| --- | --- |
| [gateway-inventory.md](gateway-inventory.md) | 核对 HTTP、策略、记录、dashboard、CLI、测试与发行的源码边界；其行数不是人日。 |
| [dependency-mapping.md](dependency-mapping.md) | 核对 Node 对 LiteLLM、FastAPI、HTTPX、dotenv、Uvicorn 及关键传递依赖的替代边界；没有独立可加的人日。 |
| [rust-path.md](rust-path.md) | Rust 全网关粗估 120 至 216 人日及其限定 provider 前提。 |
| [api-provider-estimate.md](api-provider-estimate.md) | HTTP/SSE、聊天 transport/续接、System One 和本领域差分；Node 42 至 78，Rust 56 至 98。 |
| [routing-config-estimate.md](routing-config-estimate.md) | 目录、配置、策略、System One 与内存会话；Node 20 至 38，Rust 24 至 42。 |
| [storage-monitoring-estimate.md](storage-monitoring-estimate.md) | SQLite、activity、dashboard 数据 API、游标与静态服务；Node 24 至 43，Rust 27 至 46。 |
| [cli-release-validation-estimate.md](cli-release-validation-estimate.md) | CLI、日志、资产构建、发行、安装、共享 Python golden 与目标实现的系统验收；Node 38 至 69，Rust 45 至 79。 |

四份领域表的**原样算术和**为 Node 124 至 228、Rust 152 至 265 人日。这只是发现重叠的中间数，**不是可报告的项目总估算**。两份背景研究也不能加进来。领域表的测试范围、共享夹具、System One 和资产验收存在交叠；Rust 的领域细项还改变了粗估桶的费用边界。当前资料不足以给出经去重且同一范围的 Node 或 Rust 项目总区间。

`rust-path.md` 的 120 至 216 可以复算：下界 `8+10+14+16+14+18+7+10+7+16=120`，上界 `14+18+24+30+26+32+13+18+13+28=216`。它是**该文件自己十个粗估桶的内部合计**，没有算术错误；它不是四份细项表已经验证的合计，也不覆盖未知的完整 LiteLLM provider 矩阵。

## 按工作所有权去重

| 工作边界 | 应由哪一项持有 | 对账发现及尚待厘清的部分 |
| --- | --- | --- |
| System One 的 POST、超时、答案校验及逐 provider 降级 | 路由/配置中的 System One 行：Node 2 至 4，Rust 2 至 4 | API/provider 表也列 Node 2 至 4、Rust 3 至 5，内容是同一决策上游链，不是另一条聊天 transport。整合时只留一份；API 层仅保留请求调用时序的接口验收，需说明其增量是否已含在 HTTP 行。不同 Rust 区间也不能机械择一后称为精确去重。 |
| 聊天 provider transport、DeepSeek 推理与续接 | API/provider 持有 wire、参数、流 capture、消息 hash、payload 语义及存储接口接入 | 路由/配置持有 reasoning effort 的选择与策略信号；存储/监控持有 continuation 表、查询、队列及旧库迁移。`routing-config-estimate.md` 的 System One 是决策服务，不等于聊天 provider。必须用接口边界划开“选择/透传/落库”，否则 reasoning 和续接会再次计价。 |
| HTTP 配置端点与配置实现 | API/provider 持有鉴权、状态码、错误 envelope、响应头、无效请求 intake 钩子；路由/配置持有 overlay、校验、文件替换、热重载与回滚 | 不能把 HTTP 端点整条业务流程同时列入两个模块。API 表称仅计边界接入，但是否覆盖所有配置端点的适配成本还需同一测试清单确认。 |
| Activity、静态资产与安全/日志 | 存储/监控持有 activity 状态、dashboard API、游标、静态服务及其缓存/安全头；API/provider 持有流结束时的清理调用、安全错误接线；CLI/发行持有日志格式与脱敏规则、Vite 产物构建/封装 | 流取消和 activity 的“恰好一次”会跨 API 与监控测试；文件服务与资产打包是不同实现，但 `/dashboard/`、缓存、安全头、缺资产的验收样本可复用。API 的安全错误/脱敏接线不能再次计作完整日志系统。 |
| 模块单测与领域差分 | 各领域表已含本领域局部测试和评审；API/provider 另有本领域跨子项协议差分 Node 5 至 9、Rust 7 至 11 | 这些费用只可覆盖本领域 fake upstream、SSE、续接、错误与有限真实端点的差分；如果系统验收再次执行同一脚本而无新的跨层判断，应在最终测试计划中剔除重复执行费用。路由表也含 golden 配置/领域差分，存储表含旧库、监控的局部差分；不能把“有 golden”再当作一整套共享 Python 样本制作。 |
| 共享 Python golden、旧库 fixture 与全系统验收 | CLI/发行表的共享 Python golden Node/Rust 均 8 至 14；每条目标路线另计跨模块执行 Node 9 至 16、Rust 11 至 20 | 共享夹具跨两个目标语言若同时开发也只制作一次。存储表另提“若尚无旧库/脱敏 golden”3 至 6，须先判断是否已由共享 8 至 14 覆盖，不可直接外加。全系统行应专用于进程/发行路径、故障注入、灰度和回滚的跨领域判断；HTTP 故障、旧库、配置回滚在各领域已经有局部验收。实际哪些脚本、环境和人日共用，四表未给出可逐项抵扣的清单。 |

仅删除两表完全同名的 System One 行，会得到 Node 122 至 224、Rust 149 至 260 的**示意算术数**（分别从 API 表去掉 2 至 4、3 至 5）；它们仍含上述测试及接口集成的未定重叠，不能作为项目报价或可靠总量。Rust 两个 System One 行的区间还不一致，简单扣减没有消除预算口径差异。不要再从这两个示意数随意减掉整段 golden 或系统验收：那些行也包含没有重复的取样与跨模块工作。

## Rust 粗估与细项的逐桶核对

| `rust-path.md` 粗估桶 | 粗估人日 | 细项对应范围 | 判断 |
| --- | ---: | ---: | --- |
| 行为样本、差分夹具及配置/provider 盘点 | 8 至 14 | CLI/发行表共享 Python golden 8 至 14 | 数值相同，只计一次；领域内 golden 测试是否重复取样仍需厘清。 |
| Catalog、配置、dotenv、覆盖层/回滚 | 10 至 18 | 路由/配置表 Rust 前四项 10 至 18；该表全部九项 24 至 42 | 不可把前四项等同整个 10 至 18。Node 前四项为 8 至 15、后五项为 12 至 23，合计 20 至 38；Rust 前四项为 10 至 18（`4+1+4+1` 至 `7+3+6+2`），后五项为 14 至 24，合计 24 至 42。Rust 两个粗桶与细项恰好对齐。 |
| 路由、信号、策略、System One、会话 | 14 至 24 | 路由/配置表后五项 14 至 24 | 完全对齐；System One 已在此，不应再加入 API/provider 的同名行。 |
| provider transport 与续接；HTTP API/SSE | 16 至 30 加 14 至 26，即 30 至 56 | API/provider Rust 56 至 98；若只扣其重复 System One 3 至 5，为 53 至 93 | 细项按 HTTP、provider、SSE、续接和本领域协议差分重分，不能逐桶映射；局部协议差分 7 至 11 是否已部分落入粗估末尾系统验收，尚无独立工时表。现有数值明显不等，不能声称粗估覆盖了细项。 |
| SQLite；dashboard | 18 至 32 加 7 至 13，即 25 至 45 | 存储/监控 Rust 27 至 46（含 activity） | 同一范围的细化更新，差下界 2、上界 1 人日；不是额外模块。 |
| CLI、进程、密钥及日志 | 10 至 18 | CLI/发行表 Rust 前三项 14 至 23 | 相同功能拆细后下界多 4、上界多 5；不可加到旧桶。 |
| 容器、二进制发行、安装/回退 | 7 至 13 | CLI/发行表 Rust 资产、Docker/release、安装三项 12 至 22 | 细化后下界多 5、上界多 9；仍包含前端资产打包，不包含 dashboard 静态路由实现。 |
| 全链路差分、故障注入与迁移验收 | 16 至 28 | CLI/发行表 Rust 的目标执行 11 至 20；共享 golden 已在首桶 8 至 14 | 同按“首桶已收 golden”口径比较，新目标执行少 5 至 8；但灰度、目标平台矩阵和领域差分的实际拆分未核准。若把共享 golden 再并入，得到 19 至 34，与粗估末桶比较会重复计首桶。 |

因此，120 至 216 的十项算术自洽，但**与细项费用并不对齐**。仅用于展示差距：以路由表保留 System One，其他三份细项原样合并并去掉 API 的重复 System One，可算出上述 Rust 149 至 260；它比旧粗估两端各高 29、44。这一差额混有 HTTP/provider 的更细验收、activity、CLI/发行重估和系统测试口径变动，不能直接解释为净新增工作，也不能拿来替换 120 至 216。Node 没有同口径的全网关粗估表可核；其领域表原样算术和及示意扣减同样不构成可信总数。

## 统一总量前需固定的输入

1. 固定两个方案共同的 provider 支持矩阵：实际使用并获验证的 type、特殊参数、认证与 stream/tool/reasoning 组合，列明目录的全 `provider_list` **静态接受**和实际可调用支持是两种合同。当前 `models.json` 的 `deepseek`/`openai` 及有限成功 outcome 不能证明生产全集。完整 LiteLLM 调用覆盖没有可信固定增量；`rust-path.md` 每新增原生协议组 8 至 25、特殊 provider 2 至 8、发现准备 5 至 12 人日均是条件性规划，未知组数时不得并入总数。保留 Python LiteLLM 桥接则属于混合运行时，需另估。
2. 指定单一工作分解表和所有权：System One 只留路由/配置一行；HTTP 接线、continuation payload、SQLite 接口、activity 清理及 dashboard 静态服务分别规定验收交接点。Rust 粗估和细项择一作基线，并对不同端点重新审定，不能用两张表的上下界拼接。
3. 给每个测试场景标明“生成 Python 参考样本”“目标语言局部单测/领域差分”“跨模块系统验收”“灰度/发行回退”中的唯一主要付费项，列出共享运行脚本与独有断言。确认旧库 3 至 6 人日条件项是否被共享 golden 包含；把活动模块与相邻测试/调用的分歧先定为基线，避免把修复旧 Python 行为混进移植估算（见 [storage-monitoring-estimate.md](storage-monitoring-estimate.md)）。
4. 锁定 Node 最低版本、Rust crate/MSRV、OS/架构和发布资产矩阵，核实旧库可回滚性与真实供应商测试权限，再对每条路线重新合计一次。这些输入尚未齐备时，报告可保留 Rust 120 至 216 为**限定范围的原始粗估**，但须同时注明它未通过细项对账；Node 与 Rust 的细项总量暂不报告为确定区间。
