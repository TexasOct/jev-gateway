# 供应商连接独立验收计划

本轮只制定计划。SP1-SP5 与供应商 IA2-IA5 全部待执行，尚无产品验收结论。实现分支上的自测、旧浏览器用例和未集成代码均不能建立最终 PASS。

验收任务为 `.trellis/tasks/10-05-admin-supplier-connections`，父任务为 `.trellis/tasks/10-05-admin-experience`。本上下文独立于 `admin-suppliers` 实现者。父会话交付集成快照后，应恢复本验收上下文完成需求核对、浏览器/API/文件取证、问题复查及子任务 `acceptance.md`；父集成验收仍使用自己的独立上下文。本轮唯一写入是本文件，不执行测试、不修改产品或测试、不操作任务生命周期、不提交。

## 依据与判定规则

| 依据 | 本任务采用的内容 |
| --- | --- |
| 根目录 `prompt.md` 一、四、七 | 页面职责、中文术语、普通配置简化、直接凭证输入、稳定身份、明确连接测试、图标、失败保留、键盘/焦点/窄屏及可复核浏览器记录。 |
| 父 `prd.md` | SP1-SP5、IA2-IA5、兼容约束及 DV2/DV3 的独立验收职责。 |
| 父 `design.md`、`implement.md` | 单一配置事务、供应商与模型页面分工、连接测试契约、共享类型归属、全部验收行必需及集成后复查。 |
| 子 `prd.md`、`design.md`、`implement.md` | 两种供应商、预设/接入方式优先、生成身份、更换/保留/清除、共享保护及供应商专属验证。 |
| 父 `research/current-state.md`、父子 `task.json` 与 `implement.jsonl`/`check.jsonl` | 已有表单改动需保留、配置与凭证写入边界、当前任务归属和需读取的规范。 |
| `.trellis/spec/backend/provider-configuration.md` | 不写入的校验/发现、唯一基线事务、版本冲突、回滚、稳定引用及网络边界。 |
| `.trellis/spec/backend/provider-identities.md` | 全量共享预设、账户配置、图标独立性、本地资源、固定来源、哈希、许可证和 CSP。 |
| `.trellis/spec/backend/credential-configuration.md` | JSON > 本地 dotenv > 捕获进程值、只写凭证、共享引用计数、KEEP/SET/CLEAR、继承值及隐私。 |
| `.trellis/spec/backend/dashboard-routing-config.md` | 真实网关 CSP、打包资源、统一样式、内存凭证、权限、44px 控件与响应式几何。 |
| `.trellis/spec/backend/quality-guidelines.md`、`backend/index.md` | 网络隔离、合成凭证、实际失败证据、pytest/Pyright/前端与打包检查。 |
| `.trellis/spec/backend/decision-providers.md`、模型契约子任务 `design.md` | System One 完整评估 URL、可选模型、独立协议及没有安全列表探测时的准确状态。 |

`prompt.md` 和本次验收指令确定必需范围。预设难配置、没有安全探测、共享凭证拒绝、错误恢复均属于验收项，不能归入可选增强或用普通 OpenAI 成功路径替代。旧规范或断言与新需求冲突时，应记录冲突及集成后的实际处理，不能降低源需求。

目前看到的两处基线冲突只是复查线索：`ProviderView.tsx` 的保存路径在失败后也清空 secret；`provider-management.spec.ts` 的冲突用例要求该清空。`assets.test.ts` 要求原 DeepSeek 宽版 `viewBox="0 0 195 41.3594"`。集成后需检查新行为及更新后的断言，旧断言通过不能证明失败保留或独立图形符合要求。

## 验收总矩阵

以下所有行均为必需，初始状态均为待执行。B 表示真实浏览器输入/焦点/网络记录，A 表示实际后端 API 与受控上游，F 表示隔离运行目录的字节/文件/运行态比较，S 表示代码、规范和资源来源核对，V 表示实际打开截图后的视觉检查。浏览器夹具证明界面行为，A/F 才证明服务端事务及非写入边界。

| 要求 | 必须观察到的结果 | 场景 | 必需证据 | 状态 |
| --- | --- | --- | --- | --- |
| SP1 | 先选供应商/接入方式，再填写名称、地址和实际所需凭证；默认值可靠且适合自定义的值可改；云配置完整；同品牌可保存多个命名连接。 | P01-P08、I01 | B+A+F+S | 待执行 |
| SP2 | 新连接自动分配合法、稳定的 ID 和必要凭证引用；名称变更保留模型、策略和默认供应商引用；现有环境/共享接入可从有说明的高级入口使用。 | I01-I05、P05-P08 | B+A+F | 待执行 |
| SP3 | 空的新凭证输入默认保留原值；直接更换、显式清除清楚；校验/写入失败保留草稿；共享引用保护和实际有效状态准确。 | C01-C10 | B+A+F+S | 待执行 |
| SP4 | 测试解释实际验证范围，区分上游认证、地址、网络、未知/不完整及不支持；候选凭证可测试；决定型无安全探测有明确状态；测试/发现不写配置。 | T01-T10 | B+A+F+S | 待执行 |
| SP5 | DeepSeek 在列表、预设/图标选择器中显示独立图形，无图中品牌文字；本地固定资源来源、哈希和许可证可复核；实际网关 CSP 及两主题正常。 | A01-A05 | S+B+V+F | 待执行 |
| IA2 | 中文标题、导航、按钮、字段、状态、提示、无权限/错误及可访问名称统一使用“供应商”；普通流程不要求填内部身份字段。 | L01、P01、I01-I05 | S+B | 待执行 |
| IA3 | 沿用已有主题和控件；间距、层级、图标、提示与相邻页面一致；原生选择器及窄屏可用。 | U01-U06、A02 | B+V | 待执行 |
| IA4 | 加载、空数据、失败、保存中、无权限各有准确说明及可行下一步；恢复不重复已提交写入；保存失败保留输入。 | C05-C10、T02-T10、U01-U03 | B+A+F | 待执行 |
| IA5 | 键盘完成流程；脏草稿关闭/切换先询问；拒绝丢弃保留草稿；弹窗焦点正确；窄屏能访问字段及操作。 | U04-U06、C05-C08 | B+V | 待执行 |

## 预设、普通表单与身份

预设覆盖以集成快照的 `provider_presets()`/配置 API 返回值为准。当前读取的共享注册表含 41 个 LLM 预设与 1 个决定型预设。执行时逐项登记预设 ID、kind、type/protocol、地址语义、必填参数、凭证模式及用例/结果。若数量变化，先说明新增/移除原因；不得删掉困难模板来使验收通过。

| 场景 | 输入与操作 | 验收断言与证据 |
| --- | --- | --- |
| P01 | 从空目录和已有目录进入“新增供应商”；选择预设或自定义接入方式；仅填写普通流程所需内容并保存/重新打开。 | 选择先于连接表单；无需填写 ID、凭证引用名、brand_id 或环境变量名。类型适用字段、实际凭证和必填说明正确。录制浏览器操作及实际 upsert；新实例 ID/引用由系统生成。 |
| P02 | 逐项打开全部预设，检查默认值与相关字段，取消；完成可保存状态并检查序列化。 | 默认 endpoint/native-null、注册 transport/protocol、品牌及私网默认值对应共享注册表；取消零写入。配置 payload 不包含 `setup_fields`、aliases、docs 或只读模板元数据。需要凭证的普通接入不能仅靠创建“未配置”记录冒充完成配置。 |
| P03 | 以中文/英文品牌、别名搜索，检查区域变体；零匹配后恢复搜索。 | 中国/国际及订阅地址保持区别；说明和返回结果准确。基于注册表完成保存路径；供应商连接凭证不能发往不匹配的区域地址。 |
| P04 | Anthropic/Gemini 等 native-null；DeepSeek/OpenAI 等显式地址；自定义代理地址；改变 transport。 | native-null 正确保留，适合自定义的字段能修改；改变方式后删除无关新模板参数，保留适用配置。不从图标推断 transport、protocol 或服务渠道。 |
| P05 | Azure：缺资源地址、缺 API 版本、仅空白，逐项补齐；Cloudflare：缺账户专属地址；LM Studio：缺服务地址。 | 所有缺失均定位到字段并阻止相应保存/测试；native-default 不能绕过账户地址；普通流程提供所需直接凭证。地址补齐后 API/文件保存结果正确。Cloudflare 不虚构账户 ID。 |
| P06 | Vertex AI：项目、区域缺失/补齐；平台应用默认凭据模式；显式服务账户模式。 | 每种公开支持的模式均有完成配置及失败恢复证据。普通显式凭证流程不要求用户编造环境变量名；平台模式解释凭据由网关运行环境提供，未验证时不得宣称已配置有效。环境引用兼容置于高级入口。服务账户数据不能作为明文 secret 写入普通 `params`。 |
| P07 | Bedrock：缺区域；平台 IAM 角色/配置文件模式；显式访问密钥、秘密密钥及适用的会话令牌；只填半组。 | 不强迫填无关 API Key；半组凭据有字段错误及下一步；公开支持的显式模式需可直接填写实际凭据并由系统管理引用。运行环境模式与高级环境引用各有明确说明及实际验证状态。新凭证的托管写入复用现有事务，不绕过共享保护。 |
| P08 | Ollama 无密钥本地模式；LM Studio 无认证及认证模式；私网发现开关。 | 实际无密钥方式不被虚假的 API Key 必填阻断；认证方式可填新值。私网说明位于合适的高级入口，启用只改变发现权限，不改变生成或其他网络边界。 |
| I01 | 同品牌创建两个不同名称连接，连续再次创建；第二个使用另一凭证。 | ID 与需要独立存储的新引用不碰撞，不能覆盖已有连接或强制继承第一把 key；每个名称、地址、凭证对应自己的连接。取消/重新打开不创建记录；首次保存后身份稳定。 |
| I02 | LLM 实例含已有模型、策略显式成员/标签、全局默认模型和 overlay；只改显示名称，保存、重读与 reload。 | 唯一模型名 `provider/upstream_model`、provider ID、原引用、tags/priority/default、策略成员及 overlay 字节保持；请求仅修改预期显示字段，旧参数省略保留。名称变化不引发重导入或清空凭证。 |
| I03 | System One 已设 decision.default_provider，并被策略使用；改名称；创建第二个决定型连接。 | protocol、完整评估 URL、可选 model、default_provider 及引用不变；model 缺省仍为 null/省略，禁止虚构 vendor model。LLM 与 decision 不串列表或身份。 |
| I04 | 旧目录含无显示字段、未知 brand/icon、自定义实例 ID、JSON/dotenv/process 凭证。 | 可以重读、编辑名称和保存；生成 ID 不迁移旧 ID。高级入口披露兼容方式；原 `params`/`param_env` 在普通编辑时保留，不把 `[configured]` 回写。 |
| I05 | 打开环境/共享凭证高级模式；选择已有引用并保存；收起高级区重新编辑；取消。 | 初始保持普通流程简洁；高级控件解释用途。引用可兼容往返；显式共享有影响范围提示且保留服务器拒绝保护。可理解的品牌/图标控件不改变运行身份。取消零写入。 |

云供应商的实际凭证种类要以已安装适配器、共享预设及其固定文档为依据。仅开放“环境变量引用”不能建立“普通流程直接填写实际所需凭证”的验收结论。若实现范围不能满足该源要求，标记 REWORK 或提出具体 BLOCKED_DECISION，不能把该供应商记为可选。

## 凭证、事务与错误恢复

对 LLM 与 decision 均执行适用凭证场景。全部使用可识别的合成值，取证只报告请求动作、字段名、存在性/相等性和安全错误，不打印实际凭证值。F 在临时运行目录内比较 `models.json`、`credentials.json`、`.env`、`routing-overrides.json`、主题/画布文件的存在性与字节；结合安全目录投影和 live catalog 判断是否生效。凭证哈希与原始请求体不放公开报告。

| 场景 | 操作/失败注入 | 验收断言 |
| --- | --- | --- |
| C01 | 已配置凭证，打开表单，留空新值，仅改名称并保存。 | 显示“已配置”而非旧 secret；保存使用 KEEP，credentials/dotenv 字节不变；重读表单新值为空，原凭证仍有效。空白替换值不被解释成 CLEAR。 |
| C02 | 显式“更换凭证”，直接输入新值并保存；重复提交或按 Enter。 | 一次 validate 和一次 PUT；必要引用自动处理；SET 通过托管 JSON 写入并生效，安全响应不返回值。提交期间不重复写；成功后清空浏览器 secret 草稿，不落存储。 |
| C03 | 显式清除，先取消再确认；覆盖 JSON 与本地 dotenv 都有值、仅 JSON 有值及存在捕获进程继承值。 | 取消无写入；CLEAR 请求不带 value；确认删除该引用所有本地值且保留其他记录。无继承值显示未配置/待配置；继承值仍有效时准确解释，不能声称彻底清除。 |
| C04 | SET/CLEAR 目标被另一 LLM、decision、gateway 或本供应商 `param_env` 引用；另测同事务后续操作增加消费者。 | 服务端拒绝，文件和运行态不变；界面说明共享限制、影响范围和可用替代路径。不能只依赖按钮禁用或夹具拒绝。自动生成的新引用允许独立更换时，要证明没有改共享原值。 |
| C05 | 替换凭证草稿含名称、地址、所需字段、新 secret；分别使 validate 返回 400/500 或网络失败。 | 名称、地址、方式、setup、credential action 和新值保留，可直接纠正重试；不发 PUT，不显示成功；错误说明原因与下一步且无秘密。 |
| C06 | 校验通过后 PUT 返回 409、400、500；断连/超时；注入持久化和激活失败。 | 草稿保留且不自动重发写入。409 刷新版本后仍保留用户修改，需用户重试；500 实际回滚旧文件/运行态。网络不确定结果先重读确认是否提交，不能无条件重发。 |
| C07 | 403 无写权限或写入期间权限变化；401 当前网关授权失效。 | 无权限原因与恢复入口准确；403 保留草稿。401 执行现有全局退出/重新认证边界，网关连接 key 清理；验证重新认证后的供应商草稿恢复是否满足失败保留。若实际丢失，报告未满足，不能用 400 成功保留代替。不得把草稿放 browser storage 恢复。 |
| C08 | PUT 成功后 catalog GET 失败；延迟成功回包；点击重试读取。 | 区分“已保存，刷新失败”和写入失败；保存后的 secret 已清空；重试只 GET，不重复 PUT。重复按钮/Enter 不产生第二写入，晚旧 GET 不覆盖新状态。 |
| C09 | 凭证修改/切连接/配置刷新发生在测试、发现或模型草稿未完成时。 | 有脏草稿保护；拒绝丢弃保留全部输入。接受变更取消候选查询并清除旧测试/预览结论；旧请求晚返回不得覆盖新供应商、新凭证或新 revision。 |
| C10 | 新建、取消、成功保存、失败与错误日志；检查 URL、cookies、localStorage/sessionStorage、shell、API 响应。 | 新建/重读输入不回填已保存值；失败草稿只在内存和当前密码输入；取消与成功清理。只有固定 locale 存储允许持久化；秘密不出现在 URL、普通文本、日志、截图、公开响应或资源。 |

旧 credential 规范要求提交前清理输入，本次源需求要求保存失败保留输入。最终验收按本次要求检查。允许请求完成后清理临时 payload，保留必要的内存草稿；不能以旧清理断言建立 SP3 的通过结论。失败保留和成功/取消清理须分别取证。

## 连接测试与非写入边界

父设计拟定 `POST /v1/provider-connection-test` 使用已有 LLM `ProviderSelector`，返回 provider_id、status、scope、model_count、warnings；模型列表路径 scope 为 `model_listing`。预期 status 为 `success|authentication_error|address_error|network_error|unsupported|incomplete`。这是计划契约，尚未证明已集成。执行时逐字段对照共享 types/client、后端、夹具和界面；决定型需要明确无安全探测状态，不强行套用 LLM selector。

| 场景 | 受控条件 | 验收断言 |
| --- | --- | --- |
| T01 | 保存连接和未保存候选连接，分别 KEEP/SET/CLEAR 测试；上游返回真实格式完整列表。 | 浏览器调用测试操作，A 记录受控上游接收到的正确 endpoint/auth；结果声明只验证模型列表访问/认证，不宣称生成、计费、路由或全部模型能力可用。F 证明候选与凭证未落盘、未 import、未激活。 |
| T02 | 上游返回 401/403；同一请求网关自身返回 401/403。 | 上游认证失败解释检查或更换凭证；网关授权失败按管理权限处理。两类错误不得混淆；不显示私有上游错误原文、secret 或带凭证的 URL。 |
| T03 | 非法 URL、缺账户地址/参数、错误路径 404、不支持 scheme、禁止目标。 | 地址/配置原因准确，缺失参数在字段附近说明；明确未发送探测的情况。不能把上游 404 当认证成功，或把 SSRF 拒绝当普通网络超时。 |
| T04 | DNS、连接失败、TLS、超时、连接重置；上游限流/服务端故障。 | 只声明有证据支持的网络/服务故障，不推断 key 无效。若既定 status 没有细项，warnings/说明保留原因和重试操作；TLS 校验不得关闭。 |
| T05 | 完整空列表；分页部分成功、超时/截断/达到边界；未知 transport。 | 空列表和失败区分；不完整明确未完成，model_count 不伪造完整；unsupported 有可行下一步。无安全列表探测不标为成功。 |
| T06 | System One 预设/现有决定型连接，完整评估 URL 与可选 model；尝试测试入口。 | 显示无安全探测/仅配置校验及其限制。仅配置校验不能证明凭证、地址可达或网络可达；受控上游/生成/评估调用数为零；无模型发现入口误用。决定型表单本身的保存、更换、清除仍必测。 |
| T07 | 已有网络边界：私网不开启/显式允许、危险地址、redirect、DNS 重绑定、超长/过多响应及截断。 | 复用 discovery 网络约束：默认公共 HTTPS、按实例私网 opt-in，仍拒绝 unspecified/multicast/link-local/cloud metadata 和 redirect；连接验证过的 IP，保持 TLS hostname。核对既有 20 秒/20 页/1000 模型/4 MiB 约束，无凭证 query。 |
| T08 | 延迟探测后改地址/凭证/接入方式、切 kind/供应商、取消、刷新配置、发起新探测。 | 探测 pending/取消状态可辨；结果与当时目标绑定，旧回包不会显示为新目标成功；重复点击不失控，失败可重试且草稿保留。 |
| T09 | 校验、测试、发现、浏览图标、搜索/取消前后取 F；测试成功/失败均覆盖。 | 基线、JSON/dotenv、overlay、主题、layout 文件存在性及字节不变；active catalog、引用与 revision 不因探测改变。公网元数据调用不携带供应商凭证。仅夹具 `writes=[]` 不能建立此结论。 |
| T10 | 直接请求接口：错/缺网关 Bearer、没有 configured key、恢复 journal 未解决及只读边界。 | 按实际配置/查询权限返回安全拒绝；configured key 边界保留。不受权请求、未恢复 endpoint/key 对不执行上游探测，文件不变。 |

## 中文术语、DeepSeek 与交互状态

| 场景 | 操作 | 验收断言与记录 |
| --- | --- | --- |
| L01 | 中文遍历 shell 导航、两类供应商标题/列表、新建、预设搜索、自定义、编辑、高级凭证、连接测试每种结果、错误/空/加载/无权限和关联模型入口。 | 可见产品术语和 accessible name/title/提示不残留 `Provider`、`provider`、`Providers`；中文均使用“供应商”。代码标识、外部协议名、source URL、引用文档原文有必要保留时逐项解释，不机械替换。不能仅搜索 locale 文件判通过，需渲染受影响分支。 |
| A01 | 核对新 DeepSeek SVG、本地 manifest、来源 URL、固定 commit/版本、文件 SHA-256、对应许可证和 attribution。 | 独立图形；从固定来源获取并可对比实际字节。若换社区集合标志，明确集合与官方来源区别，保留 DeepSeek 原 repository attribution 和 Lobe MIT notice。截图中没有 wordmark，不能仅删除 `<text>` 判定，因为文字可能由 path 绘制。 |
| A02 | 列表、预设、当前图标/品牌选择器；两主题、两语言、desktop/390/320；打开实际截图。 | DeepSeek 图像本身无文字；名称可作为相邻 UI 文本。图形比例、留白、可读性符合现有设计；宽版 wordmark 不能仅 CSS 裁剪冒充固定 symbol-only 资源。实际 image naturalWidth > 0、边界合理。 |
| A03 | 实际网关服务新 bundle，读 CSP、追踪 emitted SVG URL；打开 wheel 内同资产并比较。 | `/dashboard/assets/*.svg` 同源真实文件，非 data:/CDN；`img-src 'self'` 保持；无 CSP violation；源码、emitted、wheel 字节一致。Vite 注入相同 CSP 的夹具仅作辅助，不能替代真实网关证据。 |
| A04 | 404 图像后选另一图标；未知 icon，包括 `constructor`/`__proto__`；显式 generic icon。 | 中性 fallback 不破坏布局，换 URL 后恢复；未知值往返保留，generic/显式选择优先。图标选择只改变 `icon_id`，type/protocol、brand_id、实例 ID、凭证及引用保持。 |
| A05 | 仅搜索、选择/取消图标、查看来源。 | 未保存无配置写入；attribution/许可证可访问。资产来源有证据，无法核对时保留未验证项，不宣称 provenance 合格。 |
| U01 | 初次配置读取延迟、读取失败、空 LLM/decision 列表、过滤零结果、重新加载。 | loading 与真实 empty 不混淆；失败有原因/重试；空目录有新增入口，零搜索有恢复方法；新手无权限时可找到设置的安全入口。原 gateway key 编辑不出现在供应商表单。 |
| U02 | validate、PUT、探测分别 pending，重复点击/Enter；延迟失败再重试。 | 对应状态可读、busy 反馈准确；不产生重复事务；按需求禁用相关写操作但保留恢复路径，错误/成功通知属于当前操作。 |
| U03 | write_available=false、403、401；真实 API 拒绝与 UI fixture 各执行。 | 无权限说明原因及下一步；不存在旁路保存/探测；401 按 shell 准入边界退出，不能继续露出已拒绝业务界面。拒绝结果与只读/认证状态准确区分。 |
| U04 | Tab/Shift+Tab、Enter、Space、Esc 完成预设搜索、方式选择、直接密钥、advanced、替换/清除、测试及取消。 | 标签/可访问名称、逻辑焦点顺序及可见 focus 正确；图标搜索 Enter 不误提交；Esc 先关内层菜单。若使用 Dialog，焦点限制在 modal，关闭恢复原触发；页面内编辑不强加 modal 语义。取消编辑现有连接时焦点回该连接的编辑入口，新增取消回新增入口。 |
| U05 | 修改普通字段/凭证/setup/图标后，通过取消、Esc、外部关闭（适用时）、kind 切换、导航到模型/设置及页面离开触发 guard；分别拒绝和同意。 | 每种离开路径都有丢弃选择；拒绝后原输入/焦点不丢，零写入；同意后清理敏感草稿。无修改离开不误询问；保存成功后不遗留脏标记。与模型工作区脏草稿一起检查父壳聚合 guard。 |
| U06 | 1440px desktop、768px 较窄窗口、390px 和 320px；en/zh-CN、light/dark；长名称/地址与全错误状态。 | 页面/表单无横向溢出、字段/必要说明/测试/保存/取消可滚动访问，无固定遮挡。输入/select 保持约定 44px 高度；宽屏相邻控件顶部/高度差 ≤1px，原生箭头留足空间。记录 computed bounds、elementFromPoint、可见焦点与截图；错误/状态小字对比目标 4.5:1。 |

IA2-IA5 中每个分支均安排执行；不是只拍成功页面。在两语言/两主题执行主要成功及脏草稿路径，中文覆盖所有错误术语；窄屏至少包含复杂云字段、credential failure、advanced 与 unsupported 状态。

## 后续执行隔离与现有验证入口

本轮不启动服务、不构建或生成测试输出。集成取证开始前，父会话需提供准确快照：integration commit、相对于该提交仍有的 task-owned tracked/untracked 改动清单及内容标识、已集成 child/API/schema 文件、配置夹具和已知失败。未提交改动必须进入 QA 快照，不能只检出 main HEAD。记录所测快照及 diff/hash 清单；执行期间快照冻结，发现后续修改只对新快照复查。

未来 QA 在独立目录执行，任务变量统一使用 `SP_QA_ROOT`、`SP_QA_OUTPUT`、`SP_QA_RUNTIME`、`SP_QA_BROWSER_PORT`、`SP_QA_API_PORT`、`SP_QA_UPSTREAM_PORT`。它们不得指向当前共享 checkout、生产 runtime 或其他 QA 的目录。构建在 QA checkout 自己的 `jev_gateway/static/`，dist、npm/pytest/playwright 输出和截图各自独立。依赖安装和 test runner 缓存不与并行 QA 共用可写 node_modules；不可仅换端口后仍在共享 checkout 构建。

父会话协调分配浏览器预览、实际网关、受控上游各自的独占 loopback 端口，并在启动前验证可绑定；冲突就重新分配，不接管或停止已有进程。当前通用 `frontend/playwright.config.ts` 支持 `JEV_BROWSER_PORT` 与 `reuseExistingServer:false`；旧 `provider.config.ts` 固定 4182，不用于并行验收。还需核对集成后的配置，因为当前支持是工作区未提交改动。每项服务使用独立进程，退出时只清理自己创建的 PID/目录。任何 fixture 自动触发 bundle 构建亦只能发生在 QA checkout。

复用入口如下，执行时按集成版本更新旧定位/断言，不删除失败用例，不提高 timeout 或过度 mock 掩盖产品问题：

| 验证边界 | 已有入口 | 用途及限制 |
| --- | --- | --- |
| 前端纯逻辑/API | `frontend/src/features/providers/{setup,icons,assets,api}.test.ts` 及集成后的新身份/连接 hook 用例 | 默认值、身份、来源与 payload；不能证明真实点击、保存回滚或网关 CSP。 |
| 浏览器 | `frontend/tests/browser/provider-presets.spec.ts`、`provider-management.spec.ts`、`provider-icons.spec.ts`、`select-controls.spec.ts` 及实现新增供应商用例 | 全量共享 registry 与 UI 回归；旧明文 ID/环境字段、失败清空、wide-logo 断言需按新契约核对，不能跳过整组。 |
| 实际事务/API | `tests/test_provider_config.py`、`test_provider_config_regressions.py`、`test_provider_management_api.py`、`test_provider_presets.py`、`test_provider_onboarding_integration.py` | 身份、KEEP/SET/CLEAR、sharing、版本/回滚、兼容及安全投影。 |
| 网络/探测 | `tests/test_model_discovery.py`、`test_discovery_network.py` 及 Contracts 新连接测试 | 受控上游、bounds、validated-IP、状态分类；新增 endpoint 必须实际调用，旧 discovery 通过不能代替新接口证据。 |
| 模块质量/打包 | lint、unit、browser typecheck、pytest、Pyright、bundle freshness、wheel parity | 所有输出归该 QA；父集成验收负责全仓门槛，本上下文核对准确快照上的相关检查及资产证据。 |

示例执行命令仅为计划，变量须由后续 QA 初始化为绝对隔离路径：

```bash
npm --prefix "$SP_QA_ROOT/frontend" run lint
npm --prefix "$SP_QA_ROOT/frontend" run test
npm --prefix "$SP_QA_ROOT/frontend" run build
```

下列命令在 `$SP_QA_ROOT/frontend` 执行，构建已经完成；浏览器直接调用 runner，避免通用 `test:browser` 在共享目录再次构建：

```bash
./node_modules/.bin/tsc -p tests/tsconfig.json
JEV_BROWSER_PORT="$SP_QA_BROWSER_PORT" ./node_modules/.bin/playwright test --config playwright.config.ts provider-presets.spec.ts provider-management.spec.ts provider-icons.spec.ts select-controls.spec.ts --output "$SP_QA_OUTPUT/playwright"
```

下列命令在 `$SP_QA_ROOT` 执行，安装/collection 运行目录按现有 conftest 隔离；将新增 supplier/connection-test 用例加入执行清单：

```bash
uv run pytest -q tests/test_provider_config.py tests/test_provider_config_regressions.py tests/test_provider_management_api.py tests/test_provider_presets.py tests/test_provider_onboarding_integration.py tests/test_model_discovery.py tests/test_discovery_network.py --basetemp "$SP_QA_OUTPUT/pytest"
uvx pyright
scripts/build-frontend.sh --check
uv build --out-dir "$SP_QA_OUTPUT/dist"
```

执行浏览器真实后端流程时用隔离 gateway/runtime 和受控本地上游；真实网关 shell 与安全 headers 不能被 route fixture 替换。网络故障通过可控响应/关闭受控端点注入。禁止真实生成、决定评估、真实供应商凭证或外部收费服务。资产原来源必要的只读核对单独记录请求 URL/固定版本；不能借网络不可用宣布来源已验证。

## 取证、结果与复查

每个场景记录 requirement ID、场景 ID、快照标识、fixture/runtime、locale/scheme/viewport、步骤、预期、实测、命令退出码和证据路径。浏览器记录包含实际请求数量/动作、安全投影、焦点及几何；A/F 包含状态码、受控上游调用数、文件相等性及 live catalog 引用。截图用 per-test 输出路径，拍摄成功、失败保留、无权限、无安全探测、云 setup 与 DeepSeek 两主题，验收者实际打开检查后再引用。不可仅以截图文件存在或测试返回码证明视觉通过。

支持性证据需标明所有者与对应快照。实现者自测不取代本上下文执行；父全仓结果可证明准确相同快照上的质量门槛，仍不能替代本任务关键 B/A/F 场景。用例需独立于实现的返回值构造，受控上游响应及失败注入可复现。禁止把 fixture 状态变量当文件持久化事实。

后续 `acceptance.md` 对 SP1-SP5 与 IA2-IA5 逐项回填：

- PASS 仅在相应必需场景及证据完成后使用；任务最终 PASS 还要求已集成、无源要求遗漏、必要质量检查与资产证据齐全。
- REWORK 记录具体失败、复现步骤、影响要求、实测证据及实现负责人；产品问题退回 `admin-suppliers`，API/凭证事务交 Contracts，shell/navigation 交父集成。验收者不直接修改产品。
- BLOCKED_DECISION 只用于具体尚需决策的契约冲突，列出缺失决策和影响范围。未集成、工具/环境缺口或未运行项记录为待执行/阻塞及原因，不能据此宣布 PASS。
- 修复后在本上下文恢复，对新的集成快照重跑失败场景及受影响边界，并保留原失败和复查证据。

本轮交付只证明计划已写入并覆盖上述必需要求。浏览器/API/文件检查、质量命令、截图与最终 `acceptance.md` 均尚未执行。
