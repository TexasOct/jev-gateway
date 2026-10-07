# shadcn 共享组件与交互适配

## Goal

让主要通用控件使用官方 shadcn/ui 源码和统一外观，并保留项目现有交互契约。

## Requirements

- 对应父任务 R2、R5、R7、R8；组件范围以父任务迁移矩阵为准。
- 优先官方 Input/Textarea/Label/NativeSelect/Checkbox/Switch/Badge/Alert/Card/Button/Separator/Tabs 等真实使用的控件，菜单/Tooltip 按场景接入。
- 保留三态、原生值、提交语义、ref、禁用、标签/错误关联、关闭保护和焦点行为。
- 以最新已核验的 Radix Dialog 为基线，通过现有业务包装 API 接入统一样式。

## Acceptance Criteria

- [ ] P1：通用控件可复用，视觉与默认/hover/focus/disabled/invalid 状态一致，父任务 A2/A4。
- [ ] P2：NativeSelect、表单提交、三态和 Dialog 的 Escape/外部点击/失败待保存/焦点/认证挂起行为通过回归，父任务 A5。
- [ ] P3：不发生大小写文件冲突、全局重置或导入失败，lint/unit/build、相关浏览器与主动类型诊断通过，父任务 A1/A8。

## Dependencies and exclusions

- 等 Foundation 验收后实施；两个页面子任务等本任务验收后消费组件。
- 不拥有业务草稿、API、路由、配置写入和页面布局，不全量安装无使用场景的组件。
