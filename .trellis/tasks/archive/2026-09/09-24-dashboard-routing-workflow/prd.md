# Workflow 式策略配置

## Goal

把 dashboard 策略配置独立成一个专用页面，采用主流 AI workflow 编辑器的白板交互，让用户能直接浏览并编辑路由流程，不再与主题配置等页面内容混排。

## Confirmed facts

- 当前策略配置使用 React/Vite 前端、`RoutingDraft`、`routing-overrides.json` 与服务端完整 catalog 校验；`models.json` 是只读基线。
- `DecisionMatrixStrategy.decide` 按数组顺序检查规则，首个匹配项决定目标；没有规则匹配时使用 fallback。不能将其呈现或执行成任意并行图。
- 白板坐标及 viewport 保存于服务端独立的 `routing-canvas-layout.json`，由受保护 API 读写。布局保存不得改策略、重载引擎或增加策略 config version。
- 用户要求拖拽连线可修改实际路由，且同意将操作约束到现有策略语义。会话和请求监控列表已有各自的 cursor 分页和虚拟滚动子任务。

## Requirements

- 策略配置采用独立视图，作为主要内容显示 workflow 白板、导航工具栏和节点属性面板。主题调色板不得挤占该页画布的首屏空间；可放到主题/外观的独立界面或次级折叠区。
- 参考主流 AI workflow 编辑器的交互：可平移/缩放或滚动的画布、带端口的节点、方向清楚的连线、选中态、连线预览、拖动/吸附反馈、撤销当前未提交草稿的入口，以及右侧或浮动属性检查器。保持 React/SVG/HTML 实现，新增依赖需先说明必要性。
- 节点可自由拖放，位置和 viewport 写入服务端独立布局文件，跨浏览器共享；策略 API 与布局 API 仍独立。
- 连接编辑受 first-match 策略约束：规则的 match 端口可连到兼容 label；unmatched 端口可调整有序规则链或连接最终 fallback；label pool 可添加/移除 tag-resolved model。若变化无法映射为现有 `questions/rules/fallback/models` 配置，拒绝连线并说明原因。
- 节点面板支持编辑 questions、criteria、规则条件（含 AND/OR）、selection、fallback、模型 membership/priority；可在白板中新增和删除规则节点，新增规则须从已有 question/criterion 与 label 选择有效初始值，删除后更新有序 first-match 连线。显式 `models` 列表及不支持配置保持只读并说明原因。
- 连线、属性面板与排序控件修改统一写入 `RoutingDraft`，经服务端 validation、完整变更审阅和明确确认后，才 apply 到 `routing-overrides.json`；无效配置不得生效。
- 保留 Bearer/写入授权、原子回滚、旧 overlay 兼容；凭证仅驻留内存，不修改 `models.json`。
- 提供键盘操作、可访问节点/连线列表、窄屏属性面板与中英文文案。

## Acceptance criteria

- [ ] 点击策略工作流入口后打开独立策略编辑视图；画布在首屏可见，主题色配置不再占据其上方主要空间。
- [ ] 节点可拖动、平移/缩放画布、选择节点并在属性检查器编辑；刷新或换浏览器后布局恢复。
- [ ] 连线可从 source 端口拖到合法 target 端口。匹配目标、unmatched 顺序、fallback 和模型绑定的改变准确映射到 draft；非法拓扑明确拒绝。
- [ ] 连线或节点属性改动只产生 pending draft；服务端 validate 完成、差异和 warnings 展示后，用户明确确认才发送 PUT。
- [ ] 布局存储和策略 overlay 文件独立；布局保存不改变 policy snapshot/config hash/config_versions，且两种保存各自失败不破坏另一种状态。
- [ ] Questions/criteria、多个条件和 OR 数组、fallback、selection、标签池边、模型优先级及规则增删均有自动化纯逻辑/API 测试。
- [ ] 增删规则后画布节点与连线同步更新，选中状态不指向已删除规则；规则布局坐标不会错误地沿用另一条规则的旧位置。
- [ ] 键盘用户可选中节点、移动节点、创建/重连兼容连线及确认配置；窄屏下画布和属性面板可用。
- [ ] 有基于真实浏览器 pointer 操作的验收证据：节点拖动、match edge 重连、unmatched 重排、pool membership、确认保存及跨刷新布局恢复。若测试环境无法完成某项，明确列为未验收，不以截图代替行为证据。
- [ ] English/简体中文覆盖页面、节点、连线、校验及辅助功能名称。

## Decisions

- 连接遵循当前有序 first-match 语义，不引入任意 DAG 执行。
- 白板布局存于服务端独立文件，跨浏览器共享，配置写入走 dashboard 授权。
- session/request 监控分页使用尽力一致的 cursor；任务契约由 `09-24-dashboard-session-list` 维护。

## Out of scope

- 新策略执行引擎或任意图拓扑。
- provider 凭证、provider/model catalog 结构及 `models.json` 编辑。
- 协同编辑、用户账户或基于用户身份的多份布局。
