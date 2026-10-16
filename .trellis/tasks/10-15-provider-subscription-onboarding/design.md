# 供应商添加与订阅连接设计（待评审草案）

状态：按最新产品决策重建草案；用户已确认「逐供应商认证方式 + JEV 服务端持有授权并代理 + 本地和远程部署均需考虑 + 为主流供应商 API/订阅登录建立可扩展抽象」。远程多租户边界尚待澄清，未授权实现。以下新字段、文件及接口均为提案，不是现有功能。领域对象以 [`domain-model.md`](domain-model.md) v3 为准。

## 1. 设计主线

用户在选择的是「我已有哪项服务」，不是先选择一个 transport。URL/代码引导参考 rclone headless OAuth、GitHub CLI device login、RFC 8628 与原生应用 PKCE loopback 模式；具体来源和安全约束见 `research/url-based-onboarding-ui.md`。这些仅是 UX/安全先例，不代表任一供应商允许 JEV 采用相同流程。

保持现有 Suppliers 导航和供应商内 Connection settings / Model settings，不重做整个控制台。仅将新建过程从「preset → 技术表单」调整为「品牌 → 接入产品 → 专用授权/配置 → 保存连接 → 模型」。已保存实例继续使用原实例 ID，同品牌可以有多个连接。首阶段只展示当前可实际连接的接入方式；未实现的订阅产品不以 planned 占位显示，也不提供不可用入口，后续仅在 adapter 与许可证据达标后加入目录。合成测试 recipe 不进入生产目录或用户可见列表。

领域关系以 [`domain-model.md`](domain-model.md) v2 为准，术语见仓库根目录 `GLOSSARY.md`。三个独立维度在实体上拆为：

- **Brand / Product / ConnectionRecipe**：品牌、接入产品及版本化接入方式，不代表用户已获得权益。
- **Connection / AuthBinding / Account / AuthorizationGrant**：现有 provider ID 继续标识连接；只有 OAuth 等需要可验证身份时才有 Account，连接绑定特定 Grant，而不是含糊地绑定账号或复制 token。
- **ModelBinding / InferenceChannel**：保留 provider/upstream_model 模型 ID；同连接的不同模型可选择不同协议通道，能力约束与计费观测单独表达。

手动 token 不是一个任意接受 session cookie 的万能入口。只有某 supplier 官方支持并完成验证的 token 形态才展示；本轮 Go 是 API key，ChatGPT 是 OAuth，Claude 订阅不开放 token 粘贴。

## 2. 新建流程与页面草图

### 第 1 步：选择服务

```text
供应商 / 添加连接
选择你要连接的服务                              [取消]
[搜索品牌、服务或计划…]

[OpenAI]             [Claude / Anthropic]        [OpenCode]
 ChatGPT 授权         API 与云服务接入              Go 订阅
 API 按量计费         查看订阅使用限制               订阅 API key

其他供应商…（保留现有品牌）
[自定义兼容连接]  [本地模型 / 云服务]
```

品牌卡进入产品选择，而不是立即跳进 transport 表单。搜索索引包含 ChatGPT、Codex、Claude、Go、API 等别名，结果直接标出接入产品。后续具体供应商阶段中，restricted 产品可被找到并显示限制与替代操作，不做虚假可点击登录；首阶段尚未实现的订阅产品不显示占位。

### 第 2 步：按产品连接

**OpenAI**

```text
OpenAI · 选择接入方式
( ) 使用 ChatGPT 计划    官方授权 · 使用账号共享额度
( ) OpenAI API          API key · 与 ChatGPT 订阅分开计费
```

选择 ChatGPT 后只展示连接名称、适用部署说明、授权范围、用量说明及官方 `Continue with ChatGPT` 按钮；不展示 api_base 或 API key。授权结束显示「身份已验证 / 计划使用权限已授予」；登录成功但未授予 plan scope 不得显示连接可用。首次完成按官方 UI 指引显示一次用量说明，提供 Manage usage。

本地网关优先通过受管 loopback listener 自动完成 callback，网页只轮询 opaque attempt 状态。若该 OAuth client/供应商流程允许，可提供辅助的“粘贴完整回调 URL”入口：只解析精确注册的 loopback callback URI、当前 attempt 的一次性 state 与 code，由服务端用原 PKCE verifier 交换；绝不接受任意 host/redirect URI 或 URL 中的 access/refresh token。URL 按秘密处理，不写日志/遥测，短时单次消费。供应商不允许或流程不适配时不显示此选项。若用户在另一台设备访问 dashboard，不把 loopback callback 冒充服务器地址；不得将回调 URL 粘贴进普通 dashboard JS。应显示拓扑要求并提供经过官方许可的 host-side/helper 路径，否则标记 remote unsupported。

**Claude / Anthropic**

```text
Claude · 选择接入方式
[Anthropic Console API]     API key · 独立计费
[通过云服务]               转到现有 Bedrock / Vertex 配置

Claude 订阅
当前不能由 JEV 持有 Claude.ai 订阅凭证并代用户代理请求。
[查看官方限制] [获取 Console API key]
```

这是确定的当前产品边界，不标成普通网络故障，也不引导用户寻找 setup-token/Cookie 绕开。云入口只列已验证的现有 transport，不额外承诺所有云区域和模型。

**OpenCode Go**

```text
OpenCode Go · 订阅连接
1  在 OpenCode Console 开通计划              [打开官方控制台]
2  创建/复制 Go API key
3  将 key 保存到这台 JEV 网关

连接名称  [我的 Go                     ]
API key   [••••••••••••                ]
地址由 Go 预设管理；无需手填协议
[检查模型目录]   [返回]   [保存连接]
```

不要求在 JEV 中再次购买套餐或运行 `/connect`。不假造 OAuth。Go/Go Plus 若没有可信查询接口，不通过用户手选套餐宣称已经验证权益。Go 与 Zen 等其他产品不共用一个错误 endpoint。

**其他连接** 保留现有 API key、服务器默认认证、云参数和本地无 key 流程；只有必要参数进入正常步骤，transport、引用名称及兼容 endpoint 放 Advanced。decision providers 不走订阅向导，保留独立连接流程。

### 第 3 步：检查并保存

分开显示：

- 认证：已授权 / 凭据已填写 / 需要重新授权。
- 模型目录：已读取 N 项 / 暂不支持 / 部分结果 / 查询失败。
- 生成：尚未验证，旁边可选「发送测试请求（消耗额度）」；不可自动生成。
- 费用：使用订阅额度或 API 按量；剩余额度未能查询时显示未知及官方管理入口。

API key 新连接显示「凭据已填写」，只有供应商实际校验能建立 authenticated 结论；公开 model list 返回 200 不证明 key 有效。

保存是唯一绑定激活动作；认证获取的 token 先在服务端暂存，不出现在活动 provider。保存失败可恢复，取消需回收暂存授权。用户已在供应商完成 grant 并不意味着取消本地页面能撤回外部行为：取消时尝试 revoke，未确认撤销要告知官方断开入口。

### 第 4 步：添加模型

保存后展示「连接已保存，尚未添加模型」及 [选择模型] [稍后配置]，进入既有 Model settings 的确认导入流程。读取目录不导入模型；导入不自动设置全局默认、不自动加入模型池。

模型行展示该模型协议支持情况和限制；Go 未适配协议的模型可见但不可导入为可服务模型。OAuth 账号模型目录不是所有模型均已生成验证的证明。保留手动模型设置，但订阅型连接不允许任意覆盖协议映射来逃逸限制。

## 3. 已连接实例

供应商列表摘要：名称 / 接入产品 / 认证状态 / 已导入模型数；必要时显示限额或重新授权提醒。新接入产品不改变原实例 canonical ID。

编辑页保留两块：

- Connection settings：名称、产品、掩码账号标签、认证状态、用量管理、检查连接、替换 key / 重新授权 / 断开授权。
- Model settings：既有管理、详情、发现、批量确认导入。

「断开授权」停止新请求但保留连接与模型，以便恢复；「删除连接」仍受模型/策略引用保护，不偷偷级联删除。重新授权只能替换同一账号/workspace registration；改账号通过新建连接，不在后台用另一个人的授权替代原连接。

远程撤销失败≠本地仍启用。必须停止本地使用并提示 revoke 未确认。不得因 token refresh 成功抹除已断开状态。

## 4. 前后端边界（提案）

### 4.1 接入配方 registry

在共享 preset 旁增加版本化接入配方，不在 ProviderView 中写品牌 if/else：

```text
recipe_id, brand_id, product_id
localized title/description, documentation_url
availability: supported | restricted | planned
restriction_code
supported_auth_methods, deployment_modes
fixed_hosts, discovery_adapter, inference_adapter
limitations, usage_management_url
```

保留现有 preset id/type/setup_fields 向后兼容。品牌与图标继续使用现有 Lobe registry，CLI 与 dashboard 消费相同 recipe。只有注册且已验证的 adapter 才能给出 supported；不能依据供应商名字推断认证或协议。

### 4.2 公共配置与私密授权分离

旧 provider 无新字段时继续走现有凭证引用和 LiteLLM 路径，不批量重写配置。

v2 将连接的认证绑定定义为互斥联合：api_key_ref、managed_oauth、manual_token_ref、cloud_identity、none。managed_oauth 指向 `grant_id`；Account 只是授权主体的身份，不是可直接用于出站调用的凭证。每个模型绑定显式选择一个已确认的 InferenceChannel。具体关系、不变量和旧 ProviderProfile 的映射集中在 `domain-model.md`。

不再采用早期「可选 connection_recipe + account_id」作为完整数据模型。最终持久化 schema 须有明确 discriminator/version、严格混合输入校验和显式迁移合同；不能假设旧 binary 会拒绝未知 optional 字段。新 recipe 驱动已注册 runtime adapter；不得伪造 LiteLLM type 绕过 parser。parser/CLI/安全投影共同定稿之前，本设计示意不可作为可运行 models.json。

保护存储提案：

- `models.json` 保存静态 recipe/account 引用、模型和策略，不存 token。
- `credentials.json` v1 保持现有字符串 key 用法；Go key 继续使用现有 credential owner。
- 新 `provider-auth.json` versioned store 分别保存 Account 与 AuthorizationGrant（registration、issued client ID、host ID、验证后的身份、scopes、expiry、access/refresh/ID tokens）。目录 0700、文件/恢复材料 0600、原子写入、拒绝不安全权限，纳入备份与卸载提示，不进 Git/SQLite/evidence。文件权限不是静态加密承诺，主机管理员仍能读取。
- 结构变化/账号绑定使用现有配置事务及恢复日志扩展；refresh 使用独立 secret generation 和跨进程 CAS。普通配置 revision 包含绑定/结构 generation，不包含每次轮换 token 字节，避免用户编辑时频繁 409。coherent snapshot 需同时检查结构与 secret generation，不能把一个账号 endpoint 和另一个账号 token 组合。
- 不把会过期的 token 固化在 ModelProfile.api_key 中；发送前由 credential lease 获取。现有 API key profile 行为先保持兼容。

### 4.3 授权 attempt 与管理 API

以下路由名为设计提案，沿用管理 Bearer 边界、Origin 策略及 safe fixed errors：

| 操作 | 拟定接口 | 语义 |
| --- | --- | --- |
| 读取可用接入 | GET `/v1/provider-onboarding/recipes` | 安全配置、部署适用性、限制，不含秘密 |
| 创建 OAuth attempt | POST `/v1/provider-auth/attempts` | recipe、目标绑定/代际；服务端生成 state/nonce/PKCE，返回 attempt ID 与受控授权链接 |
| 查看进度 | GET `/v1/provider-auth/attempts/{id}` | 固定状态、掩码账号、权限，不回传 code/token |
| 取消 | DELETE `/v1/provider-auth/attempts/{id}` | 幂等取消、阻断后到 callback，并清理暂存 |
| 保存绑定 | 现有 provider configuration transaction 扩展 | expected_revision + 短期 single-use auth result handle；与 provider 激活一起提交 |
| 重新授权 | 新 attempt + 显式事务确认 | 原账号保持工作，验证新 grant 后才替换；身份不符拒绝 |
| 断开 | POST `/v1/provider-auth/grants/{id}/disconnect` | 带 expected session epoch 和幂等 operation ID，只断开该授权会话，先持久化 tombstone，再尝试远程 revoke |

OAuth callback 是单独的 loopback listener，不需要 dashboard Bearer，因为浏览器回调无法附带；只接受一次性匹配 state 的当前 attempt，并校验 Host、exact URI、OIDC 与权限。不把 gateway key 放进授权 URL。callback 页面无第三方资源，禁日志、no-store、固定安全文案，响应后及时关闭 listener。仅在 provider recipe 明确许可的流程中，允许从受信任的本地 CLI/UI 粘贴完整 callback URL；严格校验 scheme/host/port/path/state、单次 attempt 与 code 参数，服务端持有 PKCE verifier 并完成交换。远程浏览器到远程 Gateway 不将 code 交给普通管理页面；须由受许可的 helper/pairing 处理，或不支持。设备授权仅在供应商提供 RFC 8628 类流程时展示其 verification URI/user code、倒计时、轮询状态和取消；不把 JEV pairing challenge 冒充厂商 device code。

不将 remote dashboard 的任意 redirect_uri 或任意 OAuth endpoint 作为客户端输入，防止 SSRF/凭证出站。授权 URL 如含 ID-token hint，仅发送给官方 authorize endpoint，禁记日志。无已验证 device-code flow 时不画设备码入口。

attempt 默认建议 TTL 10 分钟并有数量上限；新 attempt 不自动替换别人的已保存授权。认证暂存结果为单次消费，expected_revision 冲突时仍可短期保留供 GET 恢复再确认，不能重放外部 code exchange。

### 4.4 推理接缝

当前 gateway 的 completion_payload / LiteLLM 调用点是 transport 接缝；`provider/ConversationAdapter` 仅处理历史/续写，保留职责。拟新增窄的推理传输 facade，由 gateway 选择 runtime adapter，路由策略仍不感知 OAuth：

```text
RoutingEngine → selected provider/model
    → transport facade (legacy LiteLLM | Responses bridge | vetted native protocol)
        → credential lease → upstream → normalized chat response/chunks
```

- OpenAI ChatGPT：固定官方 public Responses endpoint；输入全历史、store=false、上游 stream=true；下游 stream=false 时有界聚合后返回 Chat Completion。不运行 Codex shell/MCP agent 来冒充一次模型调用。
- 工具输入/输出、call ID、消息角色、多模态、reasoning 和 usage 映射须独立测试；某能力没完成就禁用，不默认继承旧 capability=true。
- 不支持的显式硬参数（例如 max_output_tokens 的等价限制）在选模约束阶段排除，手动选择则安全 400/不支持错误。不能由 request dump 静默删除。路由自动推导的可选 effort 只能落在适配器声明支持范围。
- 以 upstream terminal completed 为成功条件；响应中途 failed/incomplete/断流记录失败，不输出成功 finish 或正常 [DONE]。已经发出 SSE 时不能再变更 HTTP 状态，使用既有安全错误约定并关闭流；下游不保证所有客户端都展示自定义错误。
- 请求取消必须关闭上游、限内存/时间/输出 bytes；不重放已开始的 generation 来刷新 token 或更换模型，避免重复消费和工具执行。发送前失效的 token 可刷新一次，已发送后的不明结果不自动重试。
- Go：单连接共享 key，但每模型需可信的 wire protocol descriptor。来源缺失则 unavailable，不按名称或 host 猜。先验证现有 LiteLLM 对自定义 Responses/Messages endpoint 的能力，再决定桥接复用；当前不宣称现有 completion path 已覆盖这些协议。

## 5. 生命周期与竞态

前端 wizard：select → configure/authorizing → checking → review → committing → saved。expired、denied、unsupported、failed、commit_unknown 是明确分支；返回上一步保留非秘密草稿，确认取消清空输入、结束 attempt、恢复焦点。

AuthorizationGrant：staged → bound → authorized；refresh 是同一会话内的受控操作，invalid_grant → reauth_required；disconnect → tombstone → secrets cleared。Account 身份不随一次 refresh 或 disconnect 删除。refresh network error 不直接删除 refresh token；retry 有界退避。跨进程同 grant 单刷新者，刷新结果 CAS 匹配 session epoch/secret generation；断开先加 tombstone，因此晚到刷新不得复活。外部旋转成功但本地提交失败时不能仅恢复旧 token 假报成功。

generation 与 pending：

- UI 请求绑定 workspace admission、draft、recipe、account/session、configuration revision；任一相关身份变化即抑制旧反馈。
- token 换代使使用旧凭证的 probe 过时，但不等于所有配置结构发生变化。
- 已知写成功后只读恢复；未知提交结果 GET operation/config 状态，失败继续阻止下一写，不自动重复 apply。
- refresh 网络调用不长时间持有全局配置锁；配置/secret commit 固定锁顺序，避免 refresh 与 delete 死锁。
- 活动 stream 可在断开时取消本地传输，但不能承诺收回已送达上游的请求或避免其计费。

## 6. 用量、费用与路由

展示单独 billing 标签：subscription / metered / unknown；订阅提供 Manage usage、额度错误及有可靠来源的 reset time，不捏造百分比。

不改写传统模型的 token 单价为零。新增订阅连接先完成模型确认，不自动加入池或默认。用户已确认：订阅模型无需手动估值即可参与 economy/balanced；优先采用渠道可用的相关价格同步方案，否则回落到 JEV 默认价格同步器。同步得到的 token 单价仅作路由比较参考，不宣称订阅实际按 token 扣费或反映剩余额度。实现前核查现有同步器的来源、模型匹配、手动值所有权与缺失值语义，定义可追溯的来源优先级及失败回落；若所有来源均无价格，模型仍参与路由但成本项排在有有效价格的候选之后，手动指定仍可使用。未知不默认为零或最便宜，不因本决策隐含改变 legacy 排序。

额度耗尽只更新该连接状态，不暗中改用付费 API key。跨连接回退继续遵循用户已配置且可解释的策略，并在跨计费时要求明确授权；不在本任务自动加 fallback。

## 7. 部署拓扑和通用接入框架

本地和远程是产品要求，不是不同的产品流程。统一 recipe/auth-flow/connector/credential provider registry 为 UI 和 runtime 提供部署能力矩阵；具体 flow adapter 声明 `local_loopback`、`vendor_device_flow`、`remote_host_helper`、`approved_https_callback` 等可用拓扑，不允许 UI 自己拼 callback URL。

必须实现/设计清楚：

- 本地浏览器→本机 JEV loopback。
- 用户浏览器在 laptop、JEV 在远程 VM 的跨主机授权。本地 pairing/helper 可作为可插拔 grant delivery transport，但必须能验证目标 Gateway、operator session、recipe、host ID 和一次性 nonce；callback code/token 不得发给一般 dashboard JS，不许随意贴完整 URL或 OAuth endpoint。
- Headless/远程浏览器之外可使用真正由供应商提供的 device flow；JEV pairing challenge 不冒充供应商 device code。
- 官方只允许本地授权/转移的产品必须遵照其流程。SIWC 官方 VM 文档目前说本地完成后安全转移到 VM，不能称官方允许 public remote callback。没有被授权的 device/HTTPS flow 则明确标 remote `unsupported` 并给可行部署说明。
- 本次产品仅支持单一 operator。管理 key 控制供应商连接与授权；不引入 tenant/user ACL、账号共享池或跨 operator access。远程 Gateway host identity 和 pairing 只把 grant 交付给 operator 管理的目标 Gateway；不得让本地浏览器或不可信入站 client 获得上游 grant。公共 chat API 的订阅滥用/配额风险仍需明确运维限制，不以单 operator 声称解决 end-user sharing policy。
- 本地/远程秘密存储、外部 backups、恢复、upgrade/uninstall 都走 CredentialProvider 接口；权限/加密/key ownership 是部署适配能力，不得以 chmod 作为所有平台的静态加密结论。

`domain-model.md` 的 v3 包括具体拓扑表、pairing sequence、静态 registries 与 adapter Protocol 草案。这里的 remote pairing 仍须逐 supplier/flow 验证安全和官方许可。

无论拓扑如何，不承诺所有计划可用；不能提供 Claude 私有 token 路线。官方限制变化重新评审；technical reachability 不能置换 permission/support。


## 8. 交付与回滚

1. 完成 41 个现有 LLM presets/API mode 与主流 subscription login 的 capability inventory；每项记录来源、认证流程、远程适用性、协议、quota/billing 和条款 gate。
2. 冻结 connection/auth/account/grant/channel schema、adapter contracts、部署 topology、credential owner 和 tenant/single-operator boundary；先画 UI 与 local/remote sequence。
3. 建共享 recipe/flow/connector/protocol/model-source/quota registry 和 generic onboarding UI；逐产品加入 adapter，旧 provider 编辑保持可用。
4. 建 local/remote CredentialProvider 和 pairing/device/loopback 流程；逐供应商接入已获批准的方法，Go 多协议以模型级 descriptor 验证，Claude subscription 保持 restricted。
5. 加 model transport facade 与真实 request/stream/tool tests；成本、usage 与不能静默 fallback 合同一起完成。
6. 完整兼容回归、部署拓扑/权限验收及另外授权的真实 supplier smoke；同步公开文档和 CLI 指引。

新 recipe capability gate 控制入口；故障时可禁新建而保留旧 key 服务。已保存新字段不能回退给旧二进制静默解析；回滚前导出结构备份并明确断开受管授权，恢复旧静态文档。绝不恢复曾被旋转失效的 refresh token 来冒充成功回滚；revoke 为外部不可逆副作用，必要时重新授权。受限备份包含秘密，不复制到公开验收材料。

## 9. 未关闭的决策

已关闭：本地+远程均在框架范围内；仅单一 operator，无多租户/账号池；订阅定价采用渠道价格源优先、否则默认同步器，全部缺价时仍可路由但成本项排在有有效价格候选之后。

用户确认首阶段先落地通用部分，并选定方案 A：通用层包含 contracts/registry、通用 UI、41 个 presets 无损映射、受管授权生命周期基础设施（attempt 状态机、受保护 grant store、CredentialProvider、refresh/CAS/tombstone、管理 API 骨架）与保持等价行为的 transport seam，以合成 recipe/mock upstream 驱动，不启用真实供应商。首阶段 Dashboard 只展示实际可连接的接入方式；未实现的订阅产品不显示占位入口，待相应 adapter 可用后再纳入目录。其它未决事项（供应商 generation probe 文案、手动 token 范围、OpenAI Preview 复核与逐供应商 adapter 分期）属于后续阶段，不阻断通用层。当前不得启动实现。
