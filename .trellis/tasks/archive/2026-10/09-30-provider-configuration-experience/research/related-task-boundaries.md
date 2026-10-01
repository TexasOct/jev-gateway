# 相关任务边界与复用建议

本研究 agent 只新增前端研究和本文件，不修改下列任务的文件、状态或父子关系。当前任务为 planning，禁止产品代码修改、start、commit、archive 的要求见 `.trellis/tasks/archive/2026-10/09-30-provider-configuration-experience/task.json:6` 及父任务 PRD 的 Out of Scope。

## unified-provider-management-ui

任务状态 planning，现有 PRD 要求研究 create/edit、启停、凭据、验证与快捷配置，并明确这阶段不实现产品代码（`.trellis/tasks/archive/2026-10/09-30-unified-provider-management-ui/task.json:6`、`prd.md:18`、`:21`、`:30`）。目录检查有 PRD、research、context manifests、task.json，没有 design.md 或 implement.md；不存在的文件无行号。不能把 jsonl manifest 当作完成的设计和执行计划，PRD 的验收仍要求这些规划产物（同任务 `prd.md:24`）。

其旧研究记载 dashboard 只有观察摘要和 overlay，provider/model CRUD 是 CLI surface，并约束凭据不进入配置响应（同任务 `prd.md:7`、`:8`；`research/current-provider-surfaces.md:14`、`:38`、`:39`）。这是已有研究的边界记录，本轮不重新审查后端。

建议：本次统一底座、预设/自定义、供应商浏览搜索、品牌身份、发现流程与 decision/LLM 分区应在当前任务形成一份兼容旧管理规划的设计，不平行定义第二套 provider 表单/目录契约。当前需求来源于父任务 PRD 的 R1 至 R5。是否合并或终止旧任务由主任务负责人决定，本轮不做状态或关系操作。

## unified-settings-provider-config

任务状态 in_progress，负责顶层 providers 入口、Settings 合成和页面归属，不承接 provider CRUD（`.trellis/tasks/09-30-unified-settings-provider-config/task.json:6`、`prd.md:13`、`design.md:15`、`implement.md:8`）。其 PRD 要求与独立 provider-management 规划协调（同任务 `prd.md:20`、`:34`）。

建议：沿用现有 Shell 四页导航与 Settings 结构，当前任务补齐 Providers workspace 契约；不要重复移动语言/模式/Appearance，也不要将 provider 凭据或发现设置放进主题保存对象。现有结构证据：`frontend/src/app/AppShell.tsx:15`、`:240`、`:254`、`:269`、`:286`。

## add-project-icons

任务状态 in_progress，负责 Lucide 操作图标和六种节点类别；保留 J 产品标记及专用图形，provider logo 不属于该任务（`.trellis/tasks/archive/2026-10/09-30-add-project-icons/task.json:6`、`prd.md:15`、`:28`、`:29`、`:30`）。

建议：操作图标继续遵循现有按钮命名、装饰 SVG 和主题继承测试（`frontend/tests/browser/icons.spec.ts:5`）。provider 品牌 logo、自定义身份图标、logo 搜索与选择由当前任务定义独立资源契约；不能把 Lucide 类别图标当作官方供应商 logo。当前任务的自定义图标/官方 logo 需求见父任务 PRD 的 R2、R4、AC2。

## dashboard-visual-overhaul 及子任务

父任务状态 in_progress，task.json 列出子任务；设计限制复刻 provider logo 或实时健康指示，共享集成由一个 owner 管理（`.trellis/tasks/archive/2026-10/09-28-dashboard-visual-overhaul/task.json:6`、`:21`；`design.md:7`、`:54`）。PRD 要求保持 API/auth、隐私、分页、持久化、策略安全流程；除已批准的监控只读 telemetry 外，不增加 API/schema 或凭据持久化（同任务 `prd.md:18`、`:21`、`:23`、`:45`）。

已完整读取父任务及三个活动子任务各自的 PRD、design、implement。后续 provider 工作建议遵循这些文件所有权：

| 任务 | 已有职责与兼容条件 | 本次衔接 |
| --- | --- | --- |
| dashboard-shell-visual-system | App 编排、共享 token/CSS/palette/UI、入口与 package/build；保留 seed、data-scheme、主题 API、内存凭据、同源资产；禁止第二套全局主题。证据：`.trellis/tasks/archive/2026-10/09-28-dashboard-shell-visual-system/design.md:5`、`:9`、`:15`；`prd.md:11`、`:12`、`:18` | DESIGN.md 提炼当前源码事实；新增 provider 控件复用中性 token。共享文件的后续改动与 shell owner 协调，不能在研究阶段顺手重设计。 |
| strategy-canvas-visual-redesign | 独占 RoutingEditor/Canvas 展示、geometry 和专项测试；保持 hit area、坐标变换、layout queue/rollback、安全写边界。证据：`.trellis/tasks/archive/2026-10/09-28-strategy-canvas-visual-redesign/design.md:7`、`:17`；`prd.md:33`；`implement.md:8` | 模型发现导入后更新目录供既有模型选择使用，不另造画布或改变 selection_mode 含义。布局操作继续不发 policy PUT，validate/review/显式 apply 保留（该任务 `prd.md:19`）。 |
| dashboard-appearance-redesign | Appearance view/CSS/测试；palette、App 和共享 UI 属于 shell。保留 GET/PUT/DELETE、local preview、禁写和并发 guard；无新偏好持久化。证据：`.trellis/tasks/archive/2026-10/09-28-dashboard-appearance-redesign/design.md:5`、`:13`；`prd.md:10`、`:23`；`implement.md:17` | provider 表单不侵入 Appearance，不借 theme API 保存 provider 类型、凭据或 logo。DESIGN.md 记录主题现状，不修复调色板差异。 |
| strategy-monitoring-home（已归档子任务） | completed，负责 in-flight route activity 与只读 telemetry，process-local/content-free，不是 provider health。证据：`.trellis/tasks/archive/2026-09/09-28-strategy-monitoring-home/task.json:6`；`prd.md:17`、`:18`、`:38`；`design.md:19`、`:46`、`:48` | provider 测试、发现进度与监控流量分开；不得拿 activity 动画宣称连接健康。 |

父任务执行计划也明确 shell、canvas、appearance 的所有权和独立规划要求（`.trellis/tasks/archive/2026-10/09-28-dashboard-visual-overhaul/implement.md:28`、`:30`、`:31`、`:33`）。子任务链接本身不解决依赖排序。

## 当前任务应形成的新增规划

- provider 品牌与功能类型分别建模。LLM/decision 两区都允许自定义，System One 是 decision type；依据父任务 PRD 的 R5 / AC5。
- 模型发现结果与已导入目录分开，保留 provider-qualified ID 和现有策略引用。用户已确认搜索/勾选后显式导入，支持全选，并确认导入前补齐/显式确认必要元数据；新增在线数据查询与结构优化需求由本次配置/发现子任务承接。依据同任务 PRD 的 R3、R3.1、R8、R9、AC4、AC8、AC9。
- 根目录 DESIGN.md 单独提炼当前 dashboard 的原值、组件和已知冲突，将计划中的 provider 扩展另列，不把它写成已实现；依据同任务 PRD 的 R6 / AC6。可用的源码与原值见同目录 `dashboard-provider-design-baseline.md`。

以上均为规划建议。没有宣布旧任务被替代或已完成，没有改变任何任务状态、父子关系或既有验收条件。
