# Dashboard 设计规范提炼

## Goal

将当前 dashboard 的可核实设计规则写入根目录 `DESIGN.md`，方便 provider 配置与后续页面沿用。对应父任务 R6。

## Background

- 父任务：`.trellis/tasks/09-30-provider-configuration-experience`。
- 任务内 `design.md` 是技术方案；根目录 `DESIGN.md` 是用户请求的产品界面设计规范，两者不能混用。
- 当前工作区包含未提交的视觉和图标改动，提炼以实际源码为依据，并注明这是当前工作区基线。

## Requirements

- D1: 记录字体、字号、颜色 token、主题生成与对比度、间距、圆角、边框/阴影和布局约束，并指向 owning source。
- D2: 覆盖 shell/导航、Monitoring、策略画布、Settings、Provider、常见操作控件及加载/空/错误/禁用状态。
- D3: 记录现有响应式断点、固定尺寸、窄屏行为、键盘/焦点和 reduced-motion 规则。
- D4: 分离操作图标与供应商品牌 logo 的职责；未来 provider 浏览/搜索、自定义、模型发现扩展明确标为计划。
- D5: 对源码与规范不一致、硬编码或缺失的品牌能力如实注明，不在提炼文档时重设计或宣称浏览器验收已通过。
- D6: 采用 `google-labs-code/design.md` 官方 alpha specification/schema：提供可机器读取的 YAML token，按标准顺序组织 Markdown 正文，并通过官方格式校验。

## Acceptance Criteria

- [x] ACD1 (D1, D2): 根目录 `DESIGN.md` 存在，主要规范均能追溯到实际源码、现有 spec 或明确标注的后续计划。
- [x] ACD2 (D3): 尺寸、颜色、字体、断点与 motion 条件逐项对照当前文件，不凭截图猜 token。
- [x] ACD3 (D4, D5): 当前事实与 provider 计划可区分，官方 logo 来源规则明确，文档没有伪造实测结果。
- [x] ACD4: 本子任务未修改产品代码、主题存储、现有任务或 generated bundle。
- [x] ACD5 (D6): YAML 使用 schema 支持的字段、单位与 `{path.to.token}` 引用；正文依次使用 `Overview`、`Colors`、`Typography`、`Layout`、`Elevation & Depth`、`Shapes`、`Components`、`Do's and Don'ts`。
- [x] ACD6 (D6): `npx --yes @google/design.md@0.4.0 lint --format json DESIGN.md` 返回 exit 0、0 errors、0 warnings；记录规范来源与验证证据，不把格式通过视为产品无障碍通过。

## Dependencies and Boundaries

- 可独立交付文档基线；provider 新 UI 完成后再更新相应“计划”条目，但不能提前写成已实现。
- 复用已有视觉任务产物，不重新定义它们的产品目标或 token。
- 纯文档交付可用 PRD-only；源码检查与文档核对通过后仍需按 Trellis 审核与收尾流程进行。

## Artifact Status

- 根目录 `DESIGN.md` 已按官方 alpha specification 重排，包含 YAML token、八个标准章节、源码路径、当前原值与已知差异；provider 扩展仍明确列为计划。
- 官方 CLI `@google/design.md@0.4.0` 格式校验：exit 0、0 errors、0 warnings。规范依据和校验范围见父任务 `research/design-md-format.md`。
- 本轮源码和文档核对已完成 ACD1 至 ACD6，证据见 [acceptance-evidence.md](acceptance-evidence.md)。子任务保持既有 in_progress 状态；未修改状态或活动指针。
- 元数据逐字段补齐/确认、来源时间与服务方匹配、每个 provider 的私网发现 opt-in 仍标为 planned。新 UI 完成后由父任务安排复核，不能凭并发产生的文件宣称产品验收。
- 未运行产品测试或浏览器检查；官方 logo 的收集、许可和主题可见性未认证完成。
