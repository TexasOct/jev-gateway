# 引入标准 shadcn/ui 流程并统一后台组件样式

## Goal

为管理后台建立可重复使用的官方 shadcn/ui 组件开发流程，统一大部分通用控件和主要页面的视觉样式，让后续开发沿用同一套组件、主题和维护规范。

## Status and confirmed decisions

完整方案已提交。用户已选择范围 B（组件与页面整理）和主题 B（中性底色＋蓝色强调），随后指示：“等待admin系列的任务交付归档后再开始”。父任务与四个子任务保持 planning，按此安排延后启动；admin 系列全部交付并归档前不得进入实施。

## External start dependency

- 前置任务为 `10-05-admin-experience` 及其五个子任务：settings-security、workflow-canvas、supplier-connections、model-contracts、model-workspace。
- 必须核实上述任务全部完成交付验收并归档，不能只依据代码已整合、单项检查通过或任务目录消失判断。
- 条件满足后，以 admin 最终交付的提交、组件和规范重新核对本方案，再按既定顺序开始 Foundation；如方案发生实质变化，重新提交变更部分审阅。
- 本任务不代替 admin 所属会话推进验收、提交或归档。具体核验项见 `research/start-dependency.md`。

## Background

- 前端已使用 React 19、Vite、TypeScript、Tailwind v4 和 `@/` 别名，无需迁移框架。依据：`frontend/package.json:18`、`frontend/vite.config.ts:11`、`frontend/tsconfig.json:8`。
- Button、Card、Separator 来自手工适配的注册表源码，缺少 `components.json` 与标准 CLI 工作流。旧手工接入约定需要更新。依据：`frontend/src/shared/ui/README.md:3`、`frontend/src/shared/ui/README.md:13`。
- Tailwind 未启用 Preflight，原生控件全局规则与工具类并存；已有语义 token 映射和动态主题。依据：`frontend/src/styles/index.css:1`、`frontend/src/styles/index.css:6`、`frontend/src/styles/index.css:24`。
- 主题有系统/明暗选择及服务端种子色读写。默认种子色为 `#3b66d9`，调色板已有中性表面。依据：`frontend/src/app/hooks/useDashboardTheme.ts:23`、`frontend/src/app/hooks/useDashboardTheme.ts:37`、`frontend/src/shared/theme/palette.ts:13`、`frontend/src/shared/theme/palette.ts:127`。
- 调研时另一会话将共享 Dialog 从原生模态改为 Radix，尚在原管理后台任务的修复与验收中。本任务以实施时最新核验版本为准，不恢复旧实现。当前依据：`frontend/src/shared/ui/Dialog.tsx:1`、`frontend/src/shared/ui/Dialog.tsx:15`、`frontend/src/shared/ui/Dialog.tsx:16`。旧实现的关键行为证据保存在 `research/adoption-audit.md`。
- 模型入口位于所属供应商下，草稿和写入保护由业务层拥有。依据：`.trellis/tasks/10-05-admin-experience/acceptance-contexts.md:9`、`frontend/src/features/providers/models/ModelDialog.tsx:16`、`frontend/src/shared/navigation/unsaved-changes.ts:1`。

## Requirements

| ID | Requirement | Owner |
| --- | --- | --- |
| R1 | 接入官方 CLI 与 `components.json`；组件源码由项目维护，添加、比较上游、更新和许可记录有可重复流程。 | Foundation |
| R2 | 统一 Button、Input、Textarea、Label、NativeSelect、Checkbox、Switch、Badge、Alert、Card、Separator、Tabs，以及有实际使用场景的菜单与 Tooltip；Dialog 通过业务兼容层统一外观与可访问性。 | Primitives |
| R3 | 整理设置、供应商及模型列表、模型编辑与批量导入的分组、层级、密度和留白。统一监控面板、工作流工具栏、菜单、属性编辑器和外层导航控件样式。 | Config / Operational / Parent |
| R4 | 中性背景与表面配合现有蓝色默认强调；保留已保存种子色、自定义颜色、主题读写/重置、系统及明暗模式。状态颜色仍有清晰语义与可读对比度。 | Foundation / Parent |
| R5 | 保留鉴权与凭证边界、供应商和模型身份、原子保存与失败草稿、离开保护、加载/空/失败/只读/写入状态、键盘操作、弹层关闭保护和焦点恢复。 | All |
| R6 | 保留现有导航归属、供应商下的模型入口、渐进展开、画布几何/历史/连接、监控虚拟列表尺寸/分页/焦点保留。支持中英文、明暗及桌面/窄屏。 | Config / Operational / Parent |
| R7 | 按明确覆盖清单验收：列入范围的通用控件全部迁移，保留项需有具体行为理由；不能仅添加未使用组件后宣称迁移完成。 | Parent |
| R8 | 保留其他会话的未提交和已暂存修改。按最新基线实施，前端产物仍通过 `/dashboard/` 提供并随 Python 包交付，不引入远程字体/资源或新浏览器持久化。 | All |

## Acceptance criteria

| ID | Observable outcome | Requirements |
| --- | --- | --- |
| A1 | 从项目目录执行固定版本 CLI 可预览并添加组件，产物位于约定目录，别名可解析，构建不依赖手工修补导入。文档包含添加、检查差异、更新、业务包装和许可流程。 | R1 |
| A2 | 覆盖清单中的普通按钮、文本框、选择框、复选/开关、标签、反馈、面板和标签页使用统一组件；保留的颜色输入、画布与虚拟列表等机制有明确记录。 | R2, R7 |
| A3 | 设置、供应商/模型、监控、工作流及连接页呈现一致的表单分组、边框、圆角、字号、间距和反馈层级；原有入口仍可找到，密集内容不会无限扩大卡片或嵌套弹窗。 | R3, R6 |
| A4 | 明暗模式和已保存自定义种子色下，主要按钮、focus ring、状态文字均可读；主题保存/重置/失败/重连流程继续有效。 | R4, R5 |
| A5 | 表单标签、Tab/Shift+Tab、NativeSelect、弹层 Escape/外部点击、失败和待保存草稿、焦点恢复在桌面和窄屏通过行为验收；三态能力和清空/保留语义未折叠。 | R2, R5 |
| A6 | 真实浏览器指针和键盘操作证明画布添加/删除/连线/历史/缩放/Fit正常；监控滚动继续分页、保留焦点，列表和节点几何符合现有契约。 | R6 |
| A7 | 1440px 桌面、390px/320px 窄屏的中英文与明暗代表性截图经检查，无页面横向溢出，底部操作区可达；工作流另检查已有高视口场景。 | R3, R4, R6 |
| A8 | lint、单元、类型/构建、浏览器、Python 和打包检查通过，产物新鲜且静态资源被打入包。保留既有回归断言、正常超时和零重试；原任务验收与本任务证据分别记录。 | R5, R7, R8 |

## Out of scope

- 导航结构重设计、功能入口迁移和业务流程重写。
- 后端路由、鉴权、凭证、模型配置或主题 API 契约变更。
- 画布引擎、坐标、连线、撤销重做和虚拟列表机制重写。
- 发布新版本、修改操作员真实配置、调用真实上游生成接口。
- 营销动画、图片、远程字体、外部运行时资源和不使用的组件全量安装。

## Task map

| Task | Deliverable | Dependency |
| --- | --- | --- |
| `10-06-shadcn-foundation` | 官方 CLI、配置、主题 token 与维护流程 | admin 系列全部交付归档＋最终基线核对 |
| `10-06-shadcn-primitives` | 通用组件、兼容包装与基础交互 | Foundation 验收 |
| `10-06-shadcn-config-surfaces` | 设置、供应商和模型表单/列表 | Primitives 验收 |
| `10-06-shadcn-operational-surfaces` | 监控与工作流呈现 | Primitives 验收 |
| Parent | 外层导航/连接页整合、跨模块视觉与产物验收 | 两个页面子任务验收 |

## Supporting artifacts

- `design.md`：接入边界、主题、组件映射、兼容性和回退设计。
- `implement.md`：执行顺序、检查命令、风险点和整合门槛。
- `research/adoption-audit.md`：仓库与官方资料证据。
- `research/component-migration-map.md`：控件、页面、保留项和验收矩阵。
- 父子任务均有真实 spec/research 条目的 `implement.jsonl` 与 `check.jsonl`。
