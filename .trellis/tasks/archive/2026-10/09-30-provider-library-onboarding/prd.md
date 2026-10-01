# 供应商浏览搜索与配置引导

## Goal

让用户通过品牌浏览、搜索和自定义入口完成两类 provider 的配置，再找到需要的上游模型。对应父任务 R2、R3、R4、R5。

## Background

- 父任务：`.trellis/tasks/09-30-provider-configuration-experience`。
- CC Switch 可借鉴的流程见父任务 `research/cc-switch-and-upstream-references.md`。
- 本项目已有 Provider、Settings 与策略编辑器，需基于当前 dashboard 扩展；设置迁移、图标库和视觉重构已有独立任务。

## Requirements

- U1: Provider 页面区分 LLM providers 与 decision providers，各自包含已配置实例以及添加入口。
- U2: 添加入口支持供应商浏览与搜索，搜索按品牌名、别名和 provider 类型找到候选；无结果时仍可进入自定义配置。
- U3: 已知供应商使用可核实的官方 logo，并保持品牌比例和识别度；普通操作使用当前操作图标库，自定义项可选择图标并有安全回退。
- U4: 预设填充名称、endpoint 和支持的类型；用户仍可修改。基础表单清晰暴露必填项，高级配置按需展开。
- U5: 两类 provider 都能自定义。Decision 类型可选择 System One，并明确模型参数和完整评估地址的含义；不展示未支持类型为可用选项。
- U6: 自动获取模型时显示加载、空列表、失败、重试、手动输入与搜索选择状态；采用已确认的搜索/勾选后显式导入流程，支持全选并清楚显示范围与数量。获取、刷新和取消不得自动导入模型。
- U7: 保存、取消、返回和未保存变更处理明确；双语、键盘和窄屏体验可验收，不扩大 dashboard 全局重设计范围。
- U8: 导入确认页展示必要价格与能力字段及查询来源，支持可信预填、逐项编辑和批量确认；缺失或冲突字段有明确状态。用户确认前不导入，新查询不得覆盖已编辑值。

## Acceptance Criteria

- [x] ACU1 (U1, U2): 从两个分区分别浏览、搜索和创建预设/自定义实例，空结果和清空搜索都可继续操作。
- [x] ACU2 (U3): 每个已知供应商 logo 记录官方来源及许可/品牌说明，本地构建与离线 shell 可显示；自定义图标可选择，坏资源不破坏布局。
- [x] ACU3 (U4, U5): 表单字段映射到统一配置，System One 可选，显示名称不影响稳定 ID，切换选项不静默丢弃已编辑值。
- [x] ACU4 (U6): 模型获取/搜索/勾选/全选与失败回退均有可操作状态，未确认选择不写目录；同名模型显示 provider 区别，旧响应不会污染新 provider。
- [x] ACU5 (U7): `zh-CN` / `en`、明暗主题及 320px/390px/常规桌面宽度下无内容遮挡，键盘焦点可见且取消后可返回原页面。
- [x] ACU6 (U8): 未知价格不显示为免费，未知能力不显示为已支持；在线查询、来源冲突、手工补齐和批量确认均可操作，必要元数据不完整时阻止提交。

验收证据：主端 210 unit / 80 全量 browser（43 个 Provider cases）、六张双语/明暗/窄屏图与 reviewer `8d3a2916-b8ec-469` PASS，见父任务 `acceptance.md` 和 `research/final-gates/`。ACU2 以有核实来源/使用条件的本地资源为范围：官方 logo 当前覆盖 1/3（DeepSeek），其完整许可与原 SVG 已核验构建及 wheel/sdist；OpenAI/Anthropic 使用已记录原因的中性回退，不宣称全品牌官方资源覆盖。任务状态保留 in_progress，未提交或归档。

## Dependencies and Boundaries

- 配置契约和模型发现契约审核后集成；供应商搜索纯逻辑与 logo 来源调查可以先独立规划。
- 复用 `09-30-add-project-icons` 的操作图标库；品牌资源不靠生成模型、手画或 favicon 猜测。
- 既有 `09-30-unified-provider-management-ui` 与本任务的交叠由父任务研究文件记录，未授权前不改其任务状态或父子关系。
- 不更换框架、不重新设计其他页面，不放宽现有 CSP 以加载外部 logo，不实现任意远程 SVG 注入或未经定义的图片上传。
