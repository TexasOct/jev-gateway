# 修复选择框箭头间距与宽屏表单对齐

## Goal

让 Dashboard 的单项选择框箭头与右边框保持清晰留白，并让 Provider 编辑表单在宽屏下同一行的选择框与输入框保持一致高度和顶部对齐。

## Background

- 用户提供截图 `/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/pi-clipboard-40a72462-2e36-43da-b227-1025d54c73d4.png`。图像工具无法显示，但本地 Vision OCR 确认页面为 Provider 编辑表单，包含“传输类型”“端点 URL”“凭证操作”。原图和全部 OCR 内容仅在本地私有目录保留，不提交操作者标识。
- 共享控件使用原生 select，元素默认样式位于 `frontend/src/styles/index.css:8`，未独立设置箭头内缩。Provider 控件的 `controlClass` 为至少 44px 高，位于 `frontend/src/features/providers/constants.ts:1`。
- Provider 主表单的两列 grid 位于 `frontend/src/features/providers/ProviderView.tsx:111`，没有显式禁止子项拉伸；端点字段包含附加的原生端点选项。需要使用真实浏览器尺寸测量证明缺陷和修复结果。
- 创建任务已获用户“囤许”（允许）的回复；随后用户明确恢复目标并要求自主实现验证。当前共享分支与多个 Provider 文件属于其他进行中的任务，修复须隔离实现，再按自己的窄小 hunk 集成。

## Requirements

- R1：Dashboard 原生单项选择框统一箭头留白，箭头位于控件内部、垂直居中，文字不会与箭头重叠；不引入远程图标或新增依赖。
- R2：Provider 编辑表单在宽屏下，“传输类型”/“决策协议”与同一行输入框等高且顶部对齐；较高的邻接辅助选项不拉长选择框。
- R3：保留原生选择框标签关联、键盘选择、disabled、焦点状态、值与 change 行为。多选与列表式 select 保留原生呈现；高对比模式可用。
- R4：中英文、明暗主题及窄屏保持可读、无页面横向溢出；至少覆盖 320px、390px、1280px、1701px（截图 CSS 宽度）和 1920px。
- R5：保留其他任务的分支、HEAD、staging、产品改动、任务资料和既有 journal 差异。使用隔离分支检验自己的改动，集成仅涉及所属 hunk。不得发布新版本或修改实际操作者配置/运行服务。

## Acceptance Criteria

- [x] AC1：浏览器验证单项 select 的箭头右侧留白至少 12px、垂直居中、文字留出至少 32px 的箭头区域；共享样式用于所有现有单项选择框。
- [x] AC2：宽屏 LLM 与 decision 编辑表单的对应选择框和输入框高度差、顶部坐标差均不超过 1 CSS px；包括端点附加选项可见的情形。
- [x] AC3：实际原生键盘选择、焦点及 disabled 检查通过，不产生额外保存请求；多选/列表控件和 forced-colors 原生后备可用。
- [x] AC4：指定宽度、两种 locale/scheme 的截图或尺寸检查通过，无页面横向溢出；保留合成 API 浏览器证据，明确工具无法直接显示图像的限制。
- [x] AC5：前端 lint、unit、类型/build/freshness 和相关 browser 回归通过；独立 trellis-check 接受。仅提交本任务源码、证据/spec 与 bookkeeping，其他进行中工作完整。

## Scope

修复共享原生单项选择框的外观默认值和 Provider 主表单对齐，添加必要的真实浏览器回归。保持当前数据与业务接口；厂商图标、预置、密钥管理、新路由功能、版本发布和运行服务变更属于其他目标。
