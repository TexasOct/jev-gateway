# Provider 配置实施方案

## 决策与边界

实现统一配置底座、LLM/decision 两类管理、供应商预设与本地图标、模型发现、在线元数据预填和显式导入。沿用 React/Tailwind、独立 Provider 入口及既有策略编辑器；根目录 `DESIGN.md` 描述界面。用户已确认选中导入、导入前元数据确认、存储可优化，以及显式开启私网发现。

`models.json` 保持唯一静态配置，`.env` 保存声明引用的凭证，`routing-overrides.json` 保持只承载策略和 tags/priority。新增目录管理 API 可以修改 baseline；现有 routing API 的 baseline 字节不变契约继续成立。空 catalog 启动、OAuth、新 decision 协议、路由算法调整不在范围。

## 配置与身份

LLM 保留 `providers[]`，decision 保留 `decision.providers[]`。两类新增可选 `display_name`、`brand_id`、`icon_id`；LLM 新增 `allow_private_network: bool = false`，只控制发现。实例 ID 不因展示编辑而变更。System One 使用完整评估 URL 和可省略 model，无模型列表调用。

模型继续使用 `models[]` 和稳定 `provider/upstream_model`。结构优化采用可选、严格校验的 `metadata` envelope，记录来源、检索时间、模型/服务商关联、字段证据和确认信息；现有 cost/capabilities/limits 是运行时确认值。建议和确认值有不同用途，未确认远端项只留在 UI/查询缓存，不持久化到有效目录。旧模型无 metadata 时保持当前默认值。不引入数据库或平行运行目录。

## HTTP 契约

新增 GET `/v1/provider-configuration` 返回 `{revision, write_available, providers, decision, models, presets, provider_types, decision_protocols}`。providers 和 decision.providers 只返回安全字段、env reference/presence，params 维持 configured 投影；模型不包含凭证。

POST `/v1/provider-configuration/validate` 和 PUT `/v1/provider-configuration` 接受 `{expected_revision, operations}`，operations 为 provider upsert/delete 和显式 model import。Provider 操作指定 kind（llm/decision）、provider 规范配置和 `credential: {action: keep|set|clear, value?: string}`；空字符串不表示 keep。Import 指定 provider_id、models 和 `confirmed: true`。响应包含新 revision、导入/跳过数量和配置投影。UI 的预设和自定义均生成同一操作。

POST `/v1/provider-discovery` 接受已有 provider ID 或仅内存的 candidate provider、可选 write-only credential；返回 `{provider_id, supported, complete, items, warnings}`。items 使用 `{upstream_model, qualified_id, imported, metadata}`，metadata 只含归一化安全字段。POST `/v1/provider-metadata` 接受 provider/candidate、upstream_models 和 refresh，返回按 upstream ID 的候选字段/来源。不创建模型、不写文件。

所有管理命令包括 validate/discovery/metadata 都使用现有 gateway-key 写授权；无 key 时 403，错误 key 时 401。GET 保留现有读鉴权。错误沿用 OpenAI envelope，新增 revision conflict 409；返回固定安全文本，不输出原始异常。API 具体字段以端到端类型与测试为准，调整必须同步本文件与两侧实现。

## 一致性与凭证

配置解析新增可选环境映射，不临时改 os.environ。凭证快照由进程外部环境与邻近 `.env` 合成，候选覆盖只在该快照中；只有配置声明的 reference 可解析。DecisionClient 支持注入凭证解析器，确保新的快照被新 registry 使用。

共用配置 mutation 服务供 HTTP 和 CLI 使用。跨进程文件锁保护 models/env/overlay；HTTP 锁顺序固定为 reload_lock 再文件锁，CLI 仅文件锁。revision 是不公开凭证的 opaque token，检测 baseline、overlay 与 credential-file 变化；不把 secret 的裸 hash 暴露给客户端。读取最新磁盘 baseline/overlay 后应用操作、完整校验及 prepare registry，再写文件和交换活动状态。

catalog 与 env 写入采用同目录临时文件、fsync 和 replace；env/备份 0600。记录受保护的恢复状态以处理多文件中途失败，恢复旧字节和旧运行目录；恢复失败返回失败并保留恢复文件，不宣称成功。合作 CLI 写入共享锁；外部手工编辑的竞争由 revision 检测，不能承诺未合作编辑器服从锁。overlay、storage、gateway 设置不由管理操作改变。

清除/更改共享 env reference 必须检查其他引用者；活动配置无必要凭证时拒绝候选。删除 provider 不静默删除被引用模型/策略；明确说明先移除引用。管理 read 不暴露凭证值，秘密输入只在模块/表单内存，成功或取消清除。

## 发现与数据源

首批发现适配 OpenAI-compatible、native Anthropic、DeepSeek；其他 transport 明确 unsupported 并保留手工添加。适配 registry 独立于 history adapter，按 transport 选协议，保留 path prefix，认证在 header，分页取到上限后返回 complete=false。每次最多 1000 模型、20 页、20 秒；列表响应最多 4 MiB。取消/切换后旧响应不覆盖新状态。

网络层验证 scheme/userinfo/query/fragment、DNS 与目标 IP；固定解析地址并用原 hostname 验证 HTTPS，防止校验和连接使用不同地址。默认只接受公网 HTTPS；显式 allow_private_network 后可访问 loopback/private 的 HTTP/HTTPS。仍拒绝 unspecified、multicast、link-local、云 metadata 和重定向，TLS 校验保持开启。

元数据优先实际服务商的原生字段，Models.dev 精确 provider/model 映射补充，OpenRouter 仅用于对应 serving 的价格预填，LiteLLM 本地备用 JSON 作失败参考。固定公开源不接收用户 key/私有 endpoint。单源最大 16 MiB，缓存最多 6 小时、标记 stale，主动刷新有 30 秒并发/频率保护。聊天路由不查询元数据服务。

统一价格为 USD/百万 token：OpenRouter/LiteLLM per-token 乘百万，Models.dev 原值。保留条件价格证据，不把基本输入/输出一对数值称为完整账单。未知/null/冲突保持候选状态；temperature、tools、JSON、vision、reasoning/effort 分别确认，名称和创建日期不能推断字段。Models.dev last_updated 不作为核验时间。

新模型 import 必须明确两个非负有限价格、五个 bool capability、effort 列表及上下文/输出上限（上限未知需明确确认 null）。quality/priority/tags 使用用户值或现有默认规则，不由外部 benchmark 自动生成。服务端重新验证 confirmed 与字段完整性；已存在 qualified ID 跳过并保留旧元数据/overlay，不更新路由 membership。

## 界面与资产

Provider workspace 有 LLM/decision 分区、已配置列表、品牌浏览/搜索和自定义入口。表单提供稳定 ID、显示名、图标、类型/协议、endpoint、env reference、密钥动作和私网选项。保存与取消明确，advanced 不丢失原始 params/param_env。可先保存有效 provider 再发现，也支持仅内存候选发现；全新空 catalog 不放宽启动校验。

模型面板搜索/勾选，全选限定当前已获取/过滤结果并显示数量，已导入项不重复写。在线元数据只预填未编辑字段，用户可批量填值/确认。必要字段未完成时禁止导入；导入后刷新策略模型目录，保持既有 validate/review/apply。

品牌资源只打包官方可核实资产，记录来源和使用说明；首批 OpenAI、Anthropic、DeepSeek。无法核实的资源显示中性回退并记录缺口，不能假称官方 logo 已收录。自定义图标来自本地有限 icon registry。CSP 和主题不扩大。

## 验证与交付

配置 → 发现 → 界面依次集成；前端可在固定 mock 契约上独立制作。父任务做旧目录/CLI/HTTP、秘密、并发、失败回滚、选择导入、策略引用和窄屏双语验收。所有测试用假凭证/mock 上游；公开资料抓取用于资产/协议核实，不发送用户凭证或生成请求。共有文件改动逐项保留既有 dirty 内容，不提交/归档无关任务。

## 用户追加：主题设置局部完善

用户截图显示 Theme PUT 被共用的 configuration-write guard 拒绝。授权缺口位于 `dashboard.py` 的 theme PUT/DELETE，以及 AppShell 将 routing/provider `write_available` 传给 Appearance。仅 theme PUT/DELETE 改用现有 `authorize(state.gateway_api_key, authorization)`：未配置 key 时可写，配置时继续 Bearer 校验。不修改 guard 自身或 provider/routing/canvas 调用点，不增加偏好/凭证存储，也不读取 operator-local 配置。

Appearance 保留三个预设和 native color input。选中状态用有间隔的外圈高光，不再用中心勾号或黑色实边；自定义入口为与预设同尺寸的彩色圆形及 Lucide Pencil，非预设 seed 也显示选中外圈。保留 pending/read/write race guards、input/change 的预览与提交分工、localized accessible name 和键盘焦点。只改 Appearance JSX 与 AppShell 的主题权限接线，CSS 入口、palette、CSP 和图标依赖保持现状。
