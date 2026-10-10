# 两个业务 worktree 的第一阶段交付复核

当前补充（2026-10-08）：Contracts M10-M13已接受，具名PASS为38；Canvas问题坐标修复已有独立82项与62空间记录限定接受，完整Canvas/WF4及原后代/重置范围保持。两次原点探针基础设施失败保留，未提升为业务证据。b6b21c35及三个child均完成。用户新增icon1已在独立work/icon1启动实现后fresh验收；新编排5cb665d2-9700-4941-a6de-5268c2f10a9a运行。见[当前总览](acceptance-contexts.md)、[元数据处置](../../.runtime/admin-experience/parallel-business-acceptance-20261008/contracts-metadata-tail-parent-acceptance.md)和[坐标处置](../../.runtime/admin-experience/parallel-business-acceptance-20261008/canvas-question-parent-acceptance.md)。最终业务验收/整合/安装/提交/发布保持开放。

最新补充（2026-10-08T14:56Z）：Contracts D1-D3已接受，当前具名PASS为34；65原生/JUnit和55/13绑定一致，原39项保留。Canvas超时后的最终报告已找到，55项及312/337/474绑定核对通过，已测菜单/手势子谓词接受，问题组坐标C02/C03仍REWORK。保存本批源码/证据后，新编排 `b6b21c35-38c2-4c31-92bf-48e16cf0acfc` 在原worktree启动Canvas实现后独立验收、Contracts M10-M13。详见[Contracts处置](../../.runtime/admin-experience/parallel-business-acceptance-20261008/contracts-disabled-gaps-parent-acceptance.md)、[Canvas处置](../../.runtime/admin-experience/parallel-business-acceptance-20261008/canvas-creation-recovered-parent-disposition.md)及[当前总览](acceptance-contexts.md)。完整验收/整合/安装/最终提交/发布继续开放，以下旧快照保持其时点。

当前补充（2026-10-08T13:44Z）：具名Contracts PASS为31，D1-D3有限缺口由新fresh owner补充；创建/菜单前轮超时，partial报告和后来46/4/21记录已保存，新fresh owner核对C01-C06并补C05/C06。接续编排 `23ea45b1-e40d-4389-9f45-345f75af4fb5` 在原worktree运行。完整REWORK/整合/安装/最终提交/发布继续开放，以下历史快照保留其时点。见[当前总览](acceptance-contexts.md)及[恢复记录](../../.runtime/admin-experience/parallel-business-acceptance-20261008/creation-timeout-parent-recovery.md)。

最新补充（2026-10-08T13:03Z）：后续第八轮已独立确认M6/M7/M8，父级具名ledger29项。Canvas fresh七项与后继两次完整49项检查分别保留，原48/49缺失alert未复现/未归因，完整REWORK。已保存当前113/231输入，两个fresh owner沿用原worktree推进D1-D5/C01-C06，未提交或发布。详见[第八轮接受](../../.runtime/admin-experience/parallel-business-acceptance-20261008/contracts-eighth-parent-acceptance.md)、[诊断处置](../../.runtime/admin-experience/parallel-business-acceptance-20261008/canvas-known-reset-parent-disposition.md)及[验收总览](acceptance-contexts.md)。原失败、封存控制和本文件以下历史结论保持其时点范围。

最新补充（2026-10-08T09:48Z）：本文件保留第一阶段历史复核。后续普通业务已有实际源码/测试增量；Contracts第七轮313项与Canvas恢复49/49绑定已由父级重算，完整独立oracle复核接受M1-M5及Canvas有限子谓词。当前二十六项具名PASS，M6/M7/M8及完整Canvas仍REWORK；原上下文的限定修复/补证已启动。Contracts failed settlement及Canvas原缺失报告分别保留。最新事实和下一步见[Contracts处置](../../.runtime/admin-experience/parallel-business-acceptance-20261008/contracts-seventh-parent-acceptance.md)、[Canvas处置](../../.runtime/admin-experience/parallel-business-acceptance-20261008/canvas-third-parent-acceptance.md)及[验收总览](acceptance-contexts.md)。以下“只有报告/未执行”仅适用于原第一阶段。

父级被动核对时间为2026-10-07T17:37:19.690268+00:00。主仓库及两个worktree的HEAD均为`2ace03a3651b2fd848a8212207af1699b1f6734d`。这一轮只交付两份报告，没有产品源码、测试、暂存区或提交变化，没有新运行验收。

两个报告最终均是untracked文件，不能沿用作者写入前的clean状态，也不能称为gitignored。主仓库在本次状态更新前是clean。第一版原字节、模式及独立inode副本保存在`.trellis/.runtime/admin-experience/parallel-business-worktrees-20261007/first-delivery-parent-review/`，`preservation.json`记录当时index与六份task.json摘要。副本只保存这个核对时点，不证明连续不变。

| 工作线 | 第一版报告 | SHA-256 | 字节数 |
| --- | --- | --- | --- |
| Contracts | `/Users/texas/Workspace/jev-gateway-contracts-business/.trellis/tasks/10-05-admin-model-contracts/verification-worktree-business.md` | `bc7231ed950a856664ed850ebc2b10ffc869ec653b5c3da244b2f56d39918eb6` | 12197 |
| Canvas | `/Users/texas/Workspace/jev-gateway-canvas-business/.trellis/tasks/10-05-admin-workflow-canvas/verification-worktree-business.md` | `4b73e50372473ec473621e6a91ffb19f33b8c7b38dd4b700881e448a2060d742` | 17945 |

## Contracts 需要补正的结论

旧候选`9a476c601979260415f6afe70490c03749b4c24e`的58行处置为44 supported、3 supported-for-backend、7 REWORK、2 contract gap、2 WAIT_B07。这是历史候选的完整映射，第一版并未交付当前检查点逐行映射。正式业务状态仍保留15项继承PASS / 43项OPEN，不能从这份作者报告提升。

父级直接读当前`catalog.py`、`decision.py`、`model_metadata.py`、`discovery_network.py`和`gateway.py`，确认六类历史问题均有对应源码处理：确认文本控制、quality兼容、延后配置版本发布、effort未声明状态、transport适用性、URL控制及端口检查。当前没有据此建立新的产品缺陷，也没有运行这些路径。`catalog._finite_number`只接受exact int/float并检查有限性；非负条件属于`_metadata_number`。第一版把两个函数混为一处，应纠正。`defer_config_publication`存在且由网关写入路径调用；源码存在不能替代失败恢复和SQLite断言的执行证明。

F5的契约已经在`.trellis/spec/backend/provider-configuration.md`定义：raw source至多16项，runtime接受七种合法token并规范化顺序及重复值，非空known/confirmed字段使用相同规范化。`tests/test_metadata_tail_contracts.py`的`test_effort_raw_bound_and_runtime_canonical_duplicates`明确覆盖raw source第17项拒绝和运行时重复列表规范化。第一版要求再次决定是否增加runtime16上限，缺少现有契约与断言依据。旧冻结超限失败及不同oracle应保持原样，逐项说明其与当前契约的关系，不改原断言。

M13也已有明确实现和回归断言：`model_metadata._models_dev`保存`input_modalities` reference，`catalog.model_metadata`校验其值及来源路径，`test_modality_reference_roundtrip_is_detached`与`test_invalid_modality_source_not_projected_or_persisted`覆盖额外模态持久化及独立副本。是否具备原行所需运行和独立证据仍待映射；这份报告不能将它继续称为未定义契约。

Models B07包含真实browser/API/file/SQLite/SDK链路。归档的`status-404-recheck-report.md`及父级`research/models-status-404-parent-verification.md`保留fresh4/4、392源绑定、五个允许请求与两个拒绝请求、实际持久化及SDK结果。Models原38行已接受。第一版把可复用证据概括为synthetic HTTP消费者，范围过窄；也不能仅凭共同祖先提交认定当前消费者源码一致。后继应对X1/T3/X5/X6的精确断言、源绑定及剩余谓词逐项核对。

D4的十个失败仍是catalog fixture缺少provider，后续session谓词未到达。限定修正版及59个断言保留；未执行修正版，两次原126准入均撤销，没有第三次准入。`ctypes.dlopen` initiator仍未知。

## Canvas 可以复用与需要补正的结论

第一版提供C01至C25及WF/IA缺项映射，保留C19行级证据、其他24行OPEN与任务REWORK。三份主要源码hash匹配父级较新诊断，可作为当前源码核对；这些hash不覆盖全部几何依赖。

Add-node按钮负left、English320 Settings右界和Input label overlap的缺口继续保留。`measureChrome`、窄屏flex/scroll、祖先边界与focus状态是待诊断变量，现有被动阅读不足以建立其因果关系。inline left/width与CSS cascade没有“在窄屏样式之前执行”的结论。`originY`影响竖轴，不直接解释按钮水平negative-left；新rule创建坐标与Add-node按钮边界是不同对象。`index.css`的imports、`canvas-geometry.css`及`routing.css`已重读，后两者主要保留keyframes和说明，未建立新的裁切原因。

Input label在外置透明port层，卡内summary裁剪不约束它。实际ink交叠与painted-backdrop对比度需要分开证明；污染的1.614/1.235不能直接建立当前颜色缺陷。干净4.5:1要求保持UNMEASURED。

C13的edges-only/optional-held比较不足，empty-node layout PUT不等于零写入。C13/C15/C20/C21/C25仍需精确状态与写入归属证明。缺失1587-entry历史harness继续作为缺失证据，不能豁免。v7的48 unique / 41 expected / 7 unexpected与早期夹具失败分开保留。

## 后继范围

第一版执行计划没有exact executable/argv/cwd、有限case IDs和完整资源所有权，尚不可放行。Contracts后继补当前58行映射及最小定点命令方案；Canvas后继补按现象的可证伪诊断与有限命令方案。新文件使用各child的`verification-worktree-business-followup.md`，第一版报告不改。

后继保持原工作树和owner边界，主仓库只读，不stage、commit、merge、publish、归档或额外delegate。继续禁止未经具体准入的tests、collection、lint、typecheck、build、install、browser、network和native执行。不能通过新diagnostic identity绕过旧九诊断的未获准状态，不能以扩大Broker/acquisition/sealing代替业务推进。九诊断、18 consumer和110 Contracts控制继续UNRUN；原受保护进程、断言、失败、126撤销及生命周期要求保留。

两个原句柄`6c962735-23c4-42f`和`1ecd05d3-6619-4de`的resume均返回`Agent not found`。这是恢复句柄不可用，不推翻已取回的交付，也不建立新运行状态。后继派发及实际ID另存runtime回执；仅真实完成后更新交付结论。此前Brokera67的handle同样不可用，未回收完成verdict；ninth仍是其最新完成独立REWORK。

后继已在同一tool message并发启动：Contracts `8c87efdc-7d51-4d8`，Canvas `a5e11337-8634-4bf`。两者继续各自持久worktree，使用`deepseek/deepseek-v4-pro`，实际一般代理角色。工具已返回background started；本记录尚无后继结果，不预测映射或产品结论。

## Canvas 后继交付复核

2026-10-07T17:51:11.883051+00:00，父级取回Canvas后继完整结果并重读16010-byte报告。75-row保存transcript末行有唯一assistant stop，时间2026-10-07T17:46:45.314Z。报告SHA-256为`da9e9b4c6de37faffb9e9ccccd57d112de0ef9f9248609db3fbcf873ea1d43a3`，原模式独立inode副本及回执保存在`.trellis/.runtime/admin-experience/parallel-business-worktrees-20261007/canvas-followup-parent-review/`。

HEAD及分支仍为原检查点和Canvas分支；只有第一版与followup两份untracked报告，tracked/staged diff为空。第一版17945-byte原文hash不变。没有产品patch、测试执行或新增业务PASS。父级处置为`DELIVERED_WITH_CORRECTIONS_NOT_EXECUTION_READY`，不把作者完成通知提升为独立业务验收。

可复用的补正包括：区分Add按钮、新rule坐标和Input label；明确originY只影响竖轴；确认窄屏滚动类已存在；列出按现象的bounds/style/scroll/focus测量字段，以及九case、原180Tab/120frames/4stable和30000/5000/1000ms期限。C13/C15/C20/C21/C25缺项继续保留。

父级另与实际driver/config/launch-binding/FUTURE-EXECUTION交叉核对，保留以下修正：

- 按钮负left不能只由toolbar inline left归因；按钮是工具栏子元素，toolbar.scrollLeft、flex及祖先裁切都需区分。报告的“若出现，来自inline left”仍过强，不是已证根因。
- Add六case允许canvas-layout写入，同时拒绝其他非GET；Settings case拒绝全部非GET，包括layout。两者oracle不同。30个criterion只在Add六case注入，不能推广到其余三case。
- Placement两case实际仅capture before/immediate/settled的布局、请求、卡片与文字范围，没有请求/布局一致性断言。报告称它们“断言一致且不覆盖fixture位置”缺少源码依据。保留诊断观察范围，不把采集记录当C行通过。
- `<sealed-node>`与`<reserved-owned-port>`仍是未解析参数，launch-binding的runtime/port/ownership为null且admitted false。所写argv是原九诊断的计划形状，不能称为可直接执行的exact命令；私有副本、manifest、owner和launch admission仍缺。未来还需核对原v7完整source与当前目标的适用范围，三个主要hash不能替代全输入绑定。
- 六个列出的Canvas public spec在当前worktree存在；`frontend/tests/browser/async-boundaries.spec.ts`不在该路径。C20的这个owner引用仍待纠正。文件存在仅证明路径，不证明具名断言覆盖。

后继中的clean措辞也仅能解释为tracked/staged diff为空，最终状态有两份untracked报告。两版原文均保留，父级在本记录纠正，不再次派发同一文档修正。九诊断、18consumer、110Contracts控制继续UNRUN，4.5:1干净对比度UNMEASURED；Canvas仍REWORK。Contracts后继此次通知仍未完成，继续等其真实交付，不查询未完成输出。

## Contracts 后继交付复核

Contracts后继`8c87efdc-7d51-4d8`已完成。68-row保存transcript末行有唯一assistant stop，时间2026-10-07T17:47:30.808Z。父级完整重读37060-byte报告，其SHA-256为`c8000921d4d888d4de71dfaebd49c55e95666867b3b70935f459b77c3006c730`。报告副本、原模式及独立inode记录、terminal、392源绑定比较和被动推导保存于`.trellis/.runtime/admin-experience/parallel-business-worktrees-20261007/contracts-followup-parent-review/`。两个worktree后继现在均已交付，不再沿用此前pending措辞。

当前58行编号、唯一性和顺序与原acceptance-plan一致，F5的raw16/runtime canonical规范、M13的reference持久化及有限性函数分工已补正。这是映射结构的完整性；表中仍有省略的test名称和历史harness别名，不能当作58行精确证据均已核实。正式15项继承PASS / 43项OPEN不变。worktree仍只有两份untracked报告，tracked/staged diff为空，原12197-byte报告hash不变。报告末尾“gitignored”说法仍错误。

### 当前 B07 源绑定已有具体结论

父级在18:05:40Z对`run-20261006T200222Z/source-identity.json`及`results/source-modes-before.json`的392条有序来源进行独立被动比较：主仓库与Contracts worktree各391条hash一致，392条mode一致，所有输入均为lstat regular文件，没有缺失。唯一字节差异是`frontend/tests/fixtures/dialog-regression.ts`在已授权检查点提交中删除一个文件末尾LF；已与accepted snapshot逐字比较，原9310字节等于现9309字节再加一个LF。没有重新计算后宣称原聚合digest仍相等。

按路径分组，52/52后端源码、180/180前端产品源码、55/55后端测试及36/36其他输入的hash匹配，前端测试为68/69。该比较只覆盖这392条captured source/hash/mode，不扩展到当前新执行环境的全部依赖、native identity或连续非变更证明。

父级完整读取实际fresh B07 driver，SHA-256为`7b9850f4948f7ffc3ff9474f8ba2349c11f4ec833dcaa5393f6ce62d86c5afc4`，与driver-binding一致。它包括真实UI导入、完整编辑、磁盘检查、reload、手动/来源恢复、两个Supplier、失败rollback、SDK及正负legacy quality保存。fresh已接受的六表/25 join及源绑定保留，不能用较早723d4ad/9a476c6 handoff的“SQLite未join / X1待交付”作为当前缺口的唯一依据。B07证明有明确当前源码范围，仍需按X1/T3/X5/X6原谓词核对同一字段及具体断言，未据此直接关闭Contracts。

报告对“六项运行证据都缺失”的概括也过宽：fresh B07已实际覆盖quality=2.5与-2.5的无关UI保存。该证据可以复用其实际覆盖的子谓词，不能扩展为全部quality非法写入组合通过。当前public `test_whole_model_edit_preserves_overlay_and_identity`已有baseline tags/priority与overlay字节保留断言；T3还需真实UI及活动engine的原同窗要求，不能称为完全没有相关断言。X5原要求的响应是`{provider_id,status,scope,model_count,warnings}`及六种status、selector/credential形状，不可缩成报告所说的“六code”。M13所加“全部模态组合枚举”也不能自行扩大原要求。

### 命令计划仍需实质纠正

父级判定为`DELIVERED_STRUCTURAL_58_MAP_WITH_CORRECTIONS_NOT_EXECUTION_READY`，不放行报告中的命令：

- 两个node不存在：`tests/test_provider_config_regressions.py::test_failed_activation_restores_files_and_runtime`和`tests/test_admin_model_contracts.py::test_failed_activation_restores_runtime_files_and_safe_error`。现有`tests/test_provider_config.py::test_activation_failure_restores_files_and_runtime`检查文件、credential、mode和restore callback，没有SQLite config_versions断言，不能替代T8。
- metadata九个现有函数都能从AST定位；静态参数规模是85，native effort为6而非报告的8、transport为17而非16。这是源码推导，未collection、未执行。C6所选`test_unsafe_url_is_rejected_before_dns`也不覆盖报告声称的编码query控制和空/零端口；相关现有具名断言为`test_decoded_controls_reject_before_dns_or_connection`及`test_explicit_invalid_ports_reject_before_dns_or_connection`，仍未在本轮运行。
- D4组的argv指向整份公共`tests/test_provider_config.py`，没有选择冻结transactions中的catalog-only修正版。不能据此宣称保留并验证D4的59断言、十个参数，也不能预设116+10全PASS。原126两次撤销/no third保持，限定副本若执行仍需单独完整准入。
- `uv`是PATH命令而非已绑定的绝对执行文件，环境与`.venv-qa`选择没有落实到实际argv；`-s`会关闭capture，不能作为保留原logging/capture要求的默认方案。多个命令共用basetemp有失败证据覆盖风险，文字中的JUnit路径没有进入argv。安装、缓存、15分钟deadline与资源角色还缺完整launch/ownership及失败保存约束；只提出独立目录不建立隔离或执行授权。

父级保留两版原文及错误方案，在此纠正，停止再次派发相同文档任务。没有产品patch、新测试执行、独立业务PASS、准入、commit或发布。两后继均已交付；Contracts仍15/43，Canvas仍REWORK，Parent33及0.1.3要求继续开放。
