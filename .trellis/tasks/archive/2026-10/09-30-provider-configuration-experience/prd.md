# Provider 配置体验与模型发现适配

## Goal

让用户通过供应商浏览和搜索完成首次 provider 配置，自动获取上游模型，并在分流策略中选择已配置模型。保留统一配置底座，同时为 decision provider 与 LLM provider 提供符合各自用途的配置入口。

## Background

- 用户已授权创建父子任务，随后明确要求“开始进行实施”，并确认最后的网络范围：显式开启后支持 localhost/私网。技术方案和执行清单补齐后按子任务实施。
- 当前工作区存在大量未提交改动，以及设置页、provider 管理、图标库和 dashboard 视觉改造任务。本任务不得覆盖这些工作。
- 当前已有独立 Provider 与 Settings 导航，Provider 内容仍是占位。主题和语言继续归属 Settings，不能混入 provider 配置。证据：`frontend/src/app/AppShell.tsx:240`、`:286`。
- CLI 已有 OpenAI、Anthropic、DeepSeek 与 custom 配置入口，但现有 HTTP 写接口只覆盖 routing overlay。`/v1/models` 返回本地配置清单，不是上游模型发现。证据：`jev_gateway/cli/providers.py:14`、`:34`；`jev_gateway/gateway.py:580`；`jev_gateway/routing_overlay.py:34`。
- LLM 实例 ID 与 transport type 分离；decision 已采用独立配置与 `system_one` 注册协议。当前目录的 capability/价格默认值不能作为发现模型的能力核实结果。证据：`jev_gateway/catalog.py:86`、`:102`、`:110`；`jev_gateway/strategy/decision_provider/__init__.py:18`。

## Requirements

- R1: 底层使用统一配置存储与校验机制，上层允许通过预设、表单和配置适配器降低首次配置成本。
- R2: Provider 配置体验参考 CC Switch，支持 provider 自定义以及图标自定义。
- R3: 自动获取上游可用模型，采用用户确认的 A 流程：搜索/勾选后显式导入，支持全选。获取和刷新只读取远端列表；未选中、未导入的模型不进入有效路由目录。
- R3.1: 用户确认采用方案 1：新模型导入前补齐或显式确认必要的价格与能力元数据；可信数据可预填，支持批量设置。未知价格不能静默当成免费，未知能力不能静默当成支持；旧配置默认语义保持不变。
- R4: 添加供应商采用浏览与搜索结合的交互；已知供应商显示可核实来源的官方 logo，方便辨认和选择。
- R5: 区分 decision provider 与 LLM provider，双方都提供自定义入口。Decision provider 的类型可选择，当前明确支持 System One。
- R6: 将现有界面设计提炼为根目录 `DESIGN.md`，遵循 `google-labs-code/design.md` 的权威 specification，记录可追溯到当前代码的视觉和交互规范。任务内 `design.md` 单独承载本次技术方案。
- R7: 密钥、配置写入、旧配置兼容、模型导入与错误回退必须沿用或扩展当前安全约束；本轮先通过仓库调研确定边界。
- R8: 调查可在线查询模型价格与能力的数据源，用于减少导入时的手工填写；核实来源、服务商对应关系、单位、更新方式和缺失字段。数据查询不自动覆盖已配置模型，不以获取时间代替数据的实际更新时间。
- R9: 用户允许为便捷实现优化模型存储结构。方案须区分模型规格、提供方服务配置、报价与用户确认值，保留单一规范配置来源、稳定模型 ID 和旧配置兼容，并明确迁移与回滚方式。
- R10: 自定义 provider 显式开启后支持 localhost/私网模型发现；默认禁用私网访问。公共元数据源仍使用固定公开来源，重定向和危险网络目标不因开启而放宽。
- R11: 用户追加授权主题设置的局部完善：编辑主题色无需配置 `gateway.api_key_env`；选中颜色使用外框高光；自定义颜色入口为带笔图标的彩色圆形控件。主题仍属于 Settings，配置了网关密钥时仍需正确 Bearer。

## Acceptance Criteria

- [x] AC1 (R1): 同一 provider 通过预设表单或自定义表单保存后，均使用同一配置读写与校验链路；不产生第二份运行时配置来源。
- [x] AC2 (R2, R4): 用户可浏览或搜索已知供应商，并辨认其官方 logo；自定义 provider 可编辑名称和图标，缺失图标有明确回退。
- [x] AC3 (R3): 配置可用凭证和 endpoint 后能获取模型列表，支持搜索、勾选与明确范围的全选；只有用户显式确认的选择才导入，获取/刷新/取消不写目录；获取失败时可以重试或手动配置。
- [x] AC4 (R3): 发现模型与已导入模型明确区分，策略选择使用有效的 provider-qualified model ID，现有策略引用不被刷新列表破坏。
- [x] AC5 (R5): 两类 provider 分别展示和配置，自定义 decision provider 显式选择 System One 类型；类型与品牌标识不混用。
- [x] AC6 (R6): `DESIGN.md` 使用符合官方 alpha schema 的 YAML token 与标准章节顺序，覆盖当前颜色、字体、布局、组件、图标、状态和响应式行为，区分当前事实与 provider 计划；官方 `@google/design.md` linter 返回 0 errors、0 warnings。
- [x] AC7 (R7): 自动发现和配置页面不会泄露密钥或上游原始敏感响应；旧配置继续可读，未改动的策略、设置和请求行为保持一致。
- [x] AC8 (R3.1, R8): 新模型缺少必要元数据时不能完成导入；在线预填显示来源与适用服务商，支持逐项或批量确认。查询失败、无匹配或来源冲突时保留手工填写，不能静默使用 true/0 默认值或覆盖用户确认值。
- [x] AC9 (R9): 优化后的存储可表达元数据来源、适用服务商、缺失/冲突和确认状态；旧配置可无损读取，迁移保持模型 ID、策略引用及原有默认语义，失败可恢复旧文件和有效运行状态。
- [x] AC10 (R10): 未开启的私网发现被拒绝，显式开启后 localhost/私网 fixture 可获取列表；危险地址、DNS 变化、跨 origin 重定向、超时及响应上限有 mock 验证。
- [x] AC11 (R11): 未配置网关密钥时可保存/重置主题色；配置了密钥时缺失/错误 Bearer 返回 401。Provider、路由和画布仍保持原配置写入保护。
- [x] AC12 (R11): 预设及自定义颜色的选中态通过外框高光表示，没有中心勾号；自定义入口为同尺寸彩色圆形加笔图标，保留可访问名称、键盘焦点和原生选择器。
- [x] AC13 (R11): 保存与刷新竞态、错误恢复、pending 防重复、双语与窄屏可用性通过相关回归和浏览器核验。

最终证据见 `acceptance.md` 和 `research/final-gates/`：719 backend tests、Pyright 零诊断、210 frontend units、80 browser cases（其中 Provider 43）、bundle 一致性、最终 wheel/sdist 及官方 DESIGN lint 全部通过。独立配置/发现/UI 审查确认的问题已处理；追加 CLI 凭证入口经主端读回与专项/全量测试关闭。AC2 官方 artwork 当前为 1/3（DeepSeek），未核实的 OpenAI/Anthropic 采用中性回退，未声称全品牌覆盖。所有网络行为以 mock 验证，没有真实账户生成测试。父子任务状态保留 in_progress，未提交或归档，其他任务不变。

主题追加已通过独立 check：720 backend tests、Pyright 零诊断、210 frontend units、81 browser cases，build/bundle 与重建后的 wheel/sdist 均通过。AC11-AC13 的授权、事件提交、几何/焦点和截图证据见 `acceptance.md`、`research/theme-settings-review.md` 与 `research/theme-settings-gates/`；上述 719/210/80 为追加前 Provider 基线。

## Out of Scope

- 不提交、归档或改变本次任务树之外的既有任务状态与职责；共享工作区的已有改动必须保留。
- 不整体重做 dashboard、不移动主题与语言存储、不改变路由算法。
- 不实现发现后无确认地将全部模型自动加入路由目录。
- 不实现未定义的 decision 协议，不因参考 CC Switch 引入其客户端配置同步或 OAuth 账号管理。
- 不默认扩展完全空 catalog 的 gateway 启动或无鉴权 bootstrap；首次表单配置不得放宽现有有效目录约束。

## Task Map

| 子任务 | 负责需求 | 独立交付 | 依赖 |
| --- | --- | --- | --- |
| `09-30-provider-profile-config` | R1, R2, R5, R7, R9 | 两类 provider 的展示元数据、预设映射、模型存储与统一配置契约 | 先核对现有 provider 存储与设置任务；与发现子任务共同核对元数据字段 |
| `09-30-provider-model-discovery` | R3, R3.1, R7, R8 | 模型发现适配、元数据查询、失败回退、选中导入与有效模型目录衔接 | 配置契约确认后集成；遵循已确认的导入前元数据要求 |
| `09-30-provider-library-onboarding` | R2, R3, R3.1, R4, R5, R8 | 官方 logo、供应商浏览搜索、预设/自定义配置、模型选择与元数据确认 | 配置契约与模型发现契约确认后集成 |
| `09-30-dashboard-design-baseline` | R6 | 根目录 `DESIGN.md` 的当前设计基线 | 可独立提炼；provider 计划部分不得伪装为现状 |

父任务负责来源需求、子任务边界与最终跨任务验收。上述树结构不代表执行依赖；子任务 PRD 和后续实施计划分别记录先后条件。

## Artifact Status

- 父/子 PRD 与规范上下文均已创建；用户已明确授权实施，按子任务执行并分别记录检查结果。
- 根目录 `DESIGN.md` 已按 Google DESIGN.md alpha specification 重排，包含可解析的 YAML token、八个标准章节与源码来源；官方 CLI `0.4.0` 校验返回 0 errors、0 warnings，未宣称通过浏览器或无障碍验收。
- 后端现状、前端设计、既有任务边界、CC Switch/上游参考、Google DESIGN.md 格式依据以及初版执行建议均保存于父任务 `research/`。
- 在线数据源的字段/单位、更新限制、来源匹配、公开接口实查及存储优化建议保存于 `research/model-metadata-sources.md`；Models.dev schema 与同步工作流已按固定提交核对。
- `research/planning-options.md` 保留前期建议；本次的 `design.md` / `implement.md` 定义实施契约、依赖与验证。

## Confirmed Decisions

- A：自动发现后搜索/勾选，支持明确范围的全选，显式导入选中模型。
- 1：新模型导入前补齐或显式确认必要路由元数据，可信数据可预填且支持批量设置。当前 capability 默认 true、价格默认 0，而 `cheapest_adequate` / `balanced` 使用成本排序；证据：`jev_gateway/catalog.py:86`、`:102`；`jev_gateway/strategy/policy.py:392`。本次要求不改变旧配置的默认语义。
- 用户允许优化模型存储结构以方便本次实现；保持旧格式读取兼容，具体字段和迁移契约由技术方案记录。
- 自定义 provider 显式开启后允许 localhost/私网发现；用户明确要求进入实施。
