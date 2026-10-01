# Provider 与模型配置底座

## 边界

遵循父任务 design.md 的 API、存储、凭证与事务契约。本子任务拥有 catalog.py、provider configuration/preset/credential 服务、gateway 管理 handlers、CLI 共用写入及对应测试。在线网络抓取由发现子任务实现，frontend 由界面子任务实现。

## Schema 与兼容

ProviderProfile/DecisionProvider 增加可选 display_name/brand_id/icon_id；LLM 增加 allow_private_network，严格 bool，旧默认 false。provider ID 与 upstream ID 保持独立。模型新增严格 metadata envelope，旧列表和默认值继续读取，确认值仍在 cost/capabilities/limits。parser 与 as_dict/snapshot 分别选择安全字段，不输出凭证、raw upstream 内容或任意额外 keys。

## 解析与服务

catalog_from_document 及下层凭证解析可注入 Mapping[str,str]；缺省维持旧调用兼容。将 CLI sentinel/global os.environ 替换为局部快照，env 只依已声明 reference 查询。DecisionSettings 可携带受保护 resolver/snapshot 或在 registry 注入，保持未注入测试的 call-time env 语义。

新 provider_config 服务负责 read/validate/apply operations、opaque revision、文件锁、env set/clear、完整 baseline+overlay validation、恢复和安全投影。gateway 提供 reload_lock、prepare/activate callback 和现有 auth/error builder，CLI 不导入 gateway。新 handler 仅修改 provider/model，禁止 gateway/storage/策略字段；原 routing overlay API 不写 baseline。

API 保持父任务统一 operations 契约。metadata import 先要求完整确认字段，追加去重；配置 delete 的引用错误必须提前拒绝。跨文件恢复路径保护 env permissions；revision conflict 不写任何内容；validate/discovery 本身不写任何配置。

## 依赖与检查

先交付 schema/service/API，发现模块稍后注册进 handlers。共享文件只由本子任务编辑，集成发现后再运行测试。验证 legacy defaults、fake credentials、并发/revision、env sharing、故障回滚、旧 CLI 行为、decision resolver 和 overlay baseline 字节不变；协议 discovery 与 UI 不在本子任务中重写。
