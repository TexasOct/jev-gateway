# 统一设置与 provider 配置页面

> 已合并 `09-30-unified-provider-management-ui` 的规划范围。接收任务仍处于实施阶段；本次不将来源规划中的缺口视为已实现或验收通过。逐项映射及边界见 `research/provider-management-merge.md`。

## Goal

整理应用设置入口，让程序本体设置与 provider、模型配置各有清晰归属，同时沿用当前 dashboard 的 UI 风格。

## Confirmed requirements

- 提供一个程序本体级的统一设置页面，其设置不属于策略或 provider。
- 提供独立的 provider 与模型配置页面，作为与监控同级的顶层页面。
- 将现有 Theme 页面并入通用设置页面；主题仍是 dashboard 外观配置，不写入 provider/model catalog。
- 新页面遵循现有 dashboard 的视觉语言与交互模式。
- provider/model 页面承接已合并的 Provider 管理规划范围；本任务统一负责页面入口、信息架构和剩余交互/验收，不另起重复工作流。

## 代码调研确认

- 初始调研时顶层视图为 Monitoring、Strategy workflow 和 Theme；后续源码已加入 Provider 与 Settings，Theme 并入 Settings。导航仍由 `frontend/src/app/AppShell.tsx` 承载，原任务验收尚未逐项收口。
- 主题支持 system/light/dark 色彩模式；自定义 seed 通过 `/v1/dashboard/theme` GET/PUT/DELETE 接口保存到独立的 `dashboard-theme.json`。主题模式与 seed 不应因此迁入 provider catalog。
- 当前应用级偏好包括 UI 语言（`jev-dashboard-locale`，localStorage）；无其他已识别的通用设置项。Bearer 凭据保存在内存，不持久化。
- 此段保留的初始调研描述已被后续工作替代：Provider 配置任务树增加了 dashboard 配置、验证、发现与元数据确认流程。当前边界以本任务合并研究 `research/provider-management-merge.md` 和归档验收材料为准，不将旧描述当作现状。
- Provider 与路由配置写入仍受 `gateway.api_key_env` 保护。后续主题完善允许未配置网关密钥时保存/重置主题；配置了密钥时仍校验 Bearer。合并不改变这项已批准的权限区别。

## 合并的 Provider 管理范围

Provider 管理规划任务的用户目标和未决范围并入本任务。沿用现有数据结构及已提供的管理能力，为 Provider/model 工作区明确信息架构和主要交互，覆盖创建、编辑、启用/禁用、凭据设置与验证状态。凭据仍须遵守现有约束，不回传密钥原文；配置成功、字段错误、验证失败和缺少凭据都要有清楚反馈。常见配置优先复用预设、provider 类型、模型定义及默认值，避免重复录入可推导信息。

本任务树不把原规划需求视作全部已交付。应根据当前实现核对每项能力；现有服务不支持的行为需在合并映射中列为未完成、受限或待决，不能以界面需求推断后端能力。旧任务的调研、界面工作方式和用户决策要求见 `research/provider-management-merge.md`。

## Acceptance criteria

- [ ] 顶层导航提供 Monitoring、Strategy workflow、Provider 与模型配置、通用设置四个彼此清晰的入口；Provider 与模型配置与 Monitoring 同级。
- [ ] Theme 不再作为单独顶层页面出现，其现有主题模式与 seed 配置可从通用设置页面进入。
- [ ] 主题仍使用现有主题 API 和独立存储，不改变 provider/model catalog 或策略配置。
- [ ] 通用设置页只包含程序本体设置；首期至少承载现有语言偏好，不混入策略或 provider 专属选项。
- [ ] 现有 dashboard 写入保护、凭据内存存储与双语体验保持有效。
- [ ] 页面视觉与交互遵循 dashboard 当前设计系统，并适配桌面与窄屏导航。
- [ ] 对照合并任务逐项核实 Provider 创建、编辑、启用/禁用、凭据处理、验证能力和各自的结果状态；实际不支持的场景明确标为限制或未完成。
- [ ] 常用 provider 快捷配置复用现有预设、字段和默认值；每项可推导值的自动填充有明确依据，不能改变实例 ID 或已有模型引用。
- [ ] 整合后的页面信息架构、主要操作流程和用户决策已形成当前任务内记录，并经用户审阅；未确认的行为保持待定。

## Open questions

- 旧 Provider 管理规划要求用户审阅最终方案后再决定是否进入实现。该审阅是否已由已完成的 Provider 配置任务覆盖，需对照保存的用户决策和验收证据确认；不能只依据新旧需求重叠推断。
- 对照当前实现确认启用/禁用和主动连接验证是否可用；若不支持，明确记录为 deferred，而非要求不存在的 API。
