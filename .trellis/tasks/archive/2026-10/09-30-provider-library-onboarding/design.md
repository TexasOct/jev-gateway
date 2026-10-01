# Provider workspace

## 边界与依赖

消费父任务 design.md 的配置/发现/metadata API。frontend 独占 feature/providers、App/AppShell、shared/api types/client、双语和新专项测试。保持 Settings/监控/画布职责、主题和唯一 CSS 入口。React hook 负责请求编排，view 负责呈现；凭证依现有模块内存客户端。

## 页面流

LLM/decision tabs，各有实例列表、搜索和添加。添加弹出品牌 browse/search 与 custom，预设来自 backend registry。表单包含 ID（编辑时锁定）、显示名、品牌/本地 icon、transport/protocol、endpoint、env reference 和 write-only credential keep/set/clear；LLM 显式 allow_private_network 复选框，decision 选择 System One 与可选 model。高级字段保留原 params/param_env，不能由 safe read marker 替换原存储值。

保存使用统一 operation 与 expected_revision，错误保留草稿。发现可对保存的 provider 或仅内存候选执行；控制 stale 请求、loading/empty/unsupported/retry/manual。搜索选择/全选明确范围，只导入所选项。metadata 显示来源、状态、USD/百万单位、限制和能力，预填只影响未编辑字段；批量配置有 scope/count，确认后才能提交。已导入项跳过，成功刷新本地 catalog 给策略使用，不自动加 label。

## UI 与资产

复用 shared Button/Input/Card 和 Lucide 操作符号，provider logos 是独立本地资源，有 official source/usage manifest。自定义 icon 从本地 finite registry 选择，坏资源用 initials/neutral。无远程 logo、raw SVG 注入、CSP/theme 改动。两语言、两 scheme、320/390/桌面布局及键盘 focus/cancel 必须可读可操作。

## 测试

API mocks 精确匹配 backend 契约。验证 read-only/401/403、revision conflict、私网 opt-in、切换 provider stale、metadata unknown/单位/确认、选择全选范围、重复导入、取消/保存及字段保留；browser 使用 fixture gateway，不访问真实 provider。
