# Provider 配置集成验收

四个子任务并发实施，父任务负责跨模块验收。初始源码快照保存在 `/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-provider-before-z84iyawv`；检查任务改动时与这份快照比较，不能把本轮之前的 dirty 改动算入交付。

## 追加主题完善：验收通过

用户已授权 R11/AC11-AC13。追加前 scoped 快照为 `/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-theme-before-h65wvdwy`，仅含源文件/文档，不含本地配置或凭证。实现 owner `646cf363-9c81-471` 已交付；主端已读回授权和界面接线、查看四张截图并完成本轮全量检查。独立 check `7106a0e6-6349-4c0` 返回 PASS，无产品代码/测试改动；两处文档修正已读回。AC11-AC13 通过。下面的 719/210/80 记录为追加前 Provider 交付基线，不代替本轮验证。

本轮主端结果：720 backend tests、Pyright 0 errors/0 warnings/0 informations、30 files/210 frontend units、81 browser cases；lint 0 errors，保留 4 个既有 Fast Refresh warnings。browser 命令包含生产 build 和测试 TypeScript，均通过。bundle check、wheel/sdist 重建及 artwork/license 校验通过；两个发行包的 theme/backend 源码与当前工作区一致，包含静态资源，未包含本地配置或恢复文件。命令和日志在 `research/theme-settings-gates/`；专项证据见 `research/theme-settings-implementation.md`。

主端比较确认 dashboard 仅两处 theme 写授权调用改变，11 个 style/palette/theme-hook 文件与追加前快照一致。主动 LSP probe 检查五个源码文件，类型诊断无错误；唯一辅助 ast-grep warning 指向既有 `int(latest is not None)`，实际输入是布尔值，属于数值解析规则的误报，未改动该排序代码。四张 mock 截图覆盖桌面浅色/320px 中文深色的预设与自定义选中态，外圈和 Pencil 彩色圆形控件可见，无页面横向溢出。

独立检查另外执行 14 个后端专项、5 个前端专项、类型和 active LSP，并从已安装 React 19.3.0 的类型/执行代码及抽取的 listener 验证 cleanup、StrictMode 接线和 input/change 提交次数。主端全量包括全部 43 个 Provider browser cases。来源见 `research/theme-settings-review.md`；它的“主端待跑”表述为 reviewer 交付边界，主端结果以上面的本轮记录为准。限制：测试使用临时假配置/mock HTTP；原生系统弹窗和其他浏览器引擎未自动化验证。任务状态、已有 dirty 工作、未提交/未归档边界保持不变。

## 场景与证据要求

| 场景 | 需要成立的结果 | 验收证据 |
| --- | --- | --- |
| 打开 Provider 页面 | GET 配置提供两类实例、同源预设和 write_available，密钥仅返回引用及 presence | 后端 HTTP 测试、浏览器 fixture |
| 预设与自定义保存 | 使用相同 upsert、验证与事务服务；改展示名和图标不改变 ID | 配置测试、浏览器交互 |
| 凭证 keep/set/clear | 空字符串不能冒充 keep；写入失败恢复模型文件、凭证文件与活动目录；共享引用不能被误清除 | 临时目录、假凭证、故障注入测试 |
| 验证和发现候选 | 不写 baseline、overlay 或凭证，不修改进程环境；取消不留下可路由模型 | 字节比较、环境快照、浏览器取消 |
| 并发与旧 revision | 第二个 stale 操作返回 409；CLI 与 HTTP 使用同一个文件锁；手工改文件可使 revision 失效 | 管理 API 与事务测试 |
| 旧配置 | 无新增字段的配置仍可加载；模型 ID、策略和 capability/cost 默认值保持原语义 | 既有 catalog/CLI/策略回归 |
| 高级参数往返 | UI 省略 params/param_env 时保留原值；read 的 configured 投影不能写回原配置 | HTTP upsert 测试 |
| 模型发现 | 按 transport 取列表；分页、空列表、unsupported、部分结果和重试可区分 | mock HTTP 适配测试 |
| 发现网络限制 | 默认拒绝私网；开启后 fixture localhost/私网可取列表；连接使用核验后的地址并保留 TLS hostname 校验 | DNS/连接/重定向/超时/上限测试 |
| 模型元数据查询 | 精确服务商与 upstream ID 匹配；单位正确；缺失值和冲突可见；外部源不收到用户凭证 | 固定 Models.dev/OpenRouter/LiteLLM fixture |
| 选择与全选 | 全选范围和数量可见；已导入项不重复更新；刷新和取消不导入 | 浏览器交互与服务端去重测试 |
| 新模型导入 | 成本、五项能力、effort 及两个 limit 明确填写或确认；缺失或未确认的必要值阻止导入，明确确认未知的 limit 可提交 `null` | 服务端不完整 payload、前端未知状态测试 |
| 来源与确认存储 | 来源建议和用户确认值可区分；手动修改后的字段不会被再次查询覆盖 | metadata schema 与 UI 状态测试 |
| 策略衔接 | 导入后 qualified ID 出现在现有有效目录；overlay 不被改写，已有 tags/priority 保留 | HTTP→catalog→routing configuration 集成测试 |
| Decision 配置 | System One 使用完整 URL 和可选 model；品牌不充当协议，模型发现不向 decision 发请求 | decision 回归、浏览器两分区 |
| 布局、语言与键盘 | en/zh-CN、明暗主题、320/390/桌面均可操作；表单有标签、错误和焦点路径 | Playwright 与浏览器检查 |
| 品牌资产 | 仅打包有官方来源和使用说明的资源；缺失资源有中性回退 | 本地资产清单和来源核对 |
| 设计文档 | Google alpha tokens/章节与实际源码对应；产品计划和已验收现状可区分 | 固定版本官方 lint、源码核对 |

## 最终检查记录

未运行的检查保持待验收。子任务的单独通过结果不替代集成后的全量检查。

### 最终状态：实现与集成验收通过

- 主端前端全量：lint exit 0（4 个既有 Fast Refresh warnings），30 files / 210 unit tests，build exit 0（587.63 kB JS，保留 500 kB chunk warning），browser TypeScript exit 0，80 browser cases 全部通过，其中 43 个 Provider cases。
- 原 browser 失败全部解决。shared GET mock 与旧导航/刷新 selector 已适配；手动 Pause/Resume 控件在实施前已缺失，当前源文档只承诺系统 reduced-motion，Settings 只管理语言/外观。主端测试现在提供非空假 activity，验证 1280/390/320px 动画、reduce 静态连线且文字状态不变、恢复动画、route-map 无内嵌控制与页面无横向溢出；没有新增产品控件。垂直 SVG path 的零宽边界不适用 Playwright visibility，改以父 SVG 可见、路径已挂载、正路径长度及 stroke/CSS 验证绘制。
- 主端最终后端：`PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true uv run pytest -q` 为 719 passed in 33.90s，exit 0；全量 Pyright 为 0 errors、0 warnings、0 informations，exit 0。该标记禁用 LiteLLM 导入时的自动 dotenv 加载，临时 fixture 的显式凭证解析仍正常。早期未设置 dotenv 禁用标记的执行可能触发依赖自动读取，不作为零私有文件访问的证据。
- 既有矩阵测试已改为已跟踪文档对应的假 fixture，64/64 通过且不再依赖 operator-local 配置。主端 AST 比较证实 10 个 test functions（含 decorators）、两个 case arrays 与全部 29 条 assertions 不变；tester 额外审计 hook 验证该文件零私有配置/网络访问，旧 8 个失败节点全部通过。
- 配置复核 `8289f6dd-140a-441` 独立 14 个 regression 通过、原六项修复成立；其追加 CLI P2 已由 `c9fa60ef-649b-420` 修复。主端读回三个 CLI 模块和 15 个新回归：show/validate/doctor/reload/status/start 使用共同锁内 document+immutable mapping；reload 与 start polling 保留同一次捕获的地址/key，health 显式 key 注入保留旧接口，recovery 在读源/探测前安全拒绝。九个 CLI 文件 42 cases 和主端 719 全量均通过，进程环境不变、literal/legacy/inherited/empty 四种状态有验证。该项关闭。
- UI 复核 `8d3a2916-b8ec-469` 返回 PASS，五项 P2、候选保存后导入、只读重试、策略 qualified ID、坏图回退和 clear 文案均满足。调色板、十个样式文件与 CSP 与初始快照一致。
- bundle check、最终 `uv build`、wheel/sdist assets check 均 exit 0；两包包含七个新增/扩展配置与发现模块，无 `.env` / `models.json` / recovery 文件。两包的 DeepSeek SVG SHA 匹配 manifest，完整 MIT notice 存在于 JS。最终 CLI 修复后已重建，并逐字节确认三个 CLI 源码与两包对应内容一致。
- `DESIGN.md` 已将经前端验收的 Provider 指引改为现状，记录 logo 覆盖 1/3 和中性回退，仍保留原 YAML。固定官方 lint：0 errors、0 warnings、1 info。六个文档的本地链接全部存在；README 双语 headings 9/9、fenced blocks 12/12。

命令、退出码、耗时和完整日志保存于 `research/final-gates/`。下方保留首轮交付与返工过程，早期计数不代表最终状态。

实施前源码快照的 `test_catalog.py`、`test_cli_config_ops.py`、`test_cli_providers.py`、`test_decision_provider.py`、`test_routing_overlay.py` 合计 79 passed，退出码 0。执行使用当前虚拟环境的 Python、快照作为 cwd，以及本地 LiteLLM cost map；没有构建正在编辑的前端，也没有真实上游调用。集成后需重跑这些回归与全量检查。

设计文档子任务已交付，详见其 `acceptance-evidence.md`：固定官方 lint exit 0、0 errors、0 warnings，28 色与源码执行一致，14 条源码断言通过。主 agent 对照实施前快照确认 root YAML 未改变。Provider 新交互继续明确标为 planned；全量集成后的官方 lint 和产品验收仍保留在下面清单中。

配置 owner 已交付 API/事务/凭证快照并报告 218 个联合 mock tests 通过。主端重新运行 `uv run pytest -q tests/test_provider_onboarding_integration.py`：3 passed in 0.11s，exit 0；`uvx pyright`：0 errors、0 warnings，exit 0。HTTP fixtures 验证从来源查询到规范 envelope、用户确认、磁盘持久化及安全 GET 的往返，包含参考 structured-output 字段与原单位；不一致的确认价格拒绝且不写文件。全量后端与前端 gates 仍待全部修复和 UI 交付。

发现独立 reviewer 返回 REWORK，两项 P2 已用 fixture 复现：Anthropic 原生 structured-output 声明直接映射 JSON mode，以及 EOF 短于 Content-Length 仍报告完整。修复 agent `10fd87d0-3ec4-462` 正在处理。配置独立 reviewer `e8dd2361-81fb-403` 正在审查恢复、并发和凭证边界；当前不宣称独立评审通过。

UI owner 已交付，报告 31 个专项 browser 通过。主端复跑 frontend lint/unit/build：三个命令均 exit 0，29 files/200 tests；lint 保留 4 个既有 Fast Refresh warnings，build 主 JS 为 584.86 kB，触发大于 500 kB 的既有阈值提示。DeepSeek SVG 的源码 SHA 和打包产物 SHA 均与 `sources.json` 匹配，图形未改动；覆盖为 1/3，另外两品牌有中性回退。完整许可 notice 的发行包覆盖仍待检查，不能据此宣称品牌资产验收结束。UI reviewer `52520178-e7b1-4c4` 与全量 browser/screenshot tester `1e71a498-2ac3-4a0` 正在执行。

父任务和三个产品子任务的 manifests 已加入精确 API 交付文档；五任务共 34/26/26/20/14 个 implement+check 条目，均为存在路径且无重复。HTTP 文档三个完整 JSON 示例均可解析；models-config 中最早的既有部分示例与实施前快照完全相同。

发现修复 agent `10fd87d0-3ec4-462` 已交付两条 P2 的修正；主端读回 Native projection 和 HTTP reader，并独立复跑三文件：82 passed in 0.11s。主端 HTTP 集成现为 4 passed in 0.14s，新增私网 HTTP 候选经真实 discovery 适配与 mock transport 的规范 envelope 衔接；原生 structured-output 和 input-only limit 仅作为证据，不认证 JSON mode 或 combined context。主动 LSP probe 为零诊断。

配置 reviewer 的两个 terminal reports 合计六项（reload 两项相互关联）：旧 dotenv 插值回归、reload 覆盖成功 PUT、CLI add 绕过共享引用保护、clear 与 external fallback 状态不一致、未恢复 journal 被读取、正常 CLI 写入期间 startup/reload 未等待锁。修复 agent `705a96f8-511e-45f` 负责对应源码和故障/并发测试。任何未解决项仍阻止配置验收。

UI reviewer `52520178-e7b1-4c4` 确认五条 P2：刷新配置后接受旧查询、预填与展示证据不同步、null 被当成冲突、改凭证无提示丢失模型草稿、导入后读取失败仍声称目录刷新成功。修复 agent `e34b6d62-0a81-447` 负责产品源码和专项回归。DeepSeek 许可问题已排除：完整 MIT 原文经 `?raw` 嵌入 JS，主端以完整文本/JSON 字符串形式验证匹配；最终 wheel 和 sdist 仍需分别验证。

全量 browser 初跑为 65 passed、3 failed/68；31 个 Provider cases 均通过。两条 monitoring 旧 selector 与一条缺少 Provider GET mock 的响应式 case 已交给 tester `0828ff89-a1bf-42d` 对照实施前快照、保持原测试意图修正。完整命令和输出见 `research/browser-evidence/verification.md`；这次失败不能作为最终通过记录。主端已查看六张 en/zh-CN、明暗、320/390/1280 截图，未知/冲突与只读操作可见、无文档横向溢出；这些截图为修复前基线。

- [x] 后端全量 pytest。
- [x] Python pyright。
- [x] 前端 lint、unit、build。
- [x] Playwright 全量浏览器回归。
- [x] dashboard bundle check 与 Python wheel/sdist build。
- [x] DESIGN.md 官方 lint：0 errors、0 warnings。
- [x] 独立评审全部本轮 owned 改动，处理确认的问题。
- [x] docs/models-config.md、docs/http-api.md 与 backend specs 同步实际契约。

父任务与四个子任务的实施/验收完成。任务状态保留 `in_progress`，没有提交或归档；其他任务的状态与职责未改变。限制：官方品牌资源目前覆盖 1/3，另外两品牌采用中性回退；未核实全部供应商 artwork。此验收使用 mock 上游和假凭证，没有进行真实账户模型生成或线上服务实测。手工恢复 journal、绕过共同锁的外部编辑以及通用 dotenv 读取器不理解 literal marker 的边界保持明确。

产品测试只使用假凭证和模拟上游响应。记录失败时保留命令、状态码和安全的定位信息，不粘贴密钥、原始上游响应或本机配置。
