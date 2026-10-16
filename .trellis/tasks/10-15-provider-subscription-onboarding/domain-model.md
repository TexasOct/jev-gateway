# 供应商接入域与扩展框架 v3（提案）

状态：按用户最新范围重新建模，待设计评审。目标是一个可扩展的接入框架，覆盖本地和远程部署及主流供应商的 API key、官方订阅登录、云身份和协议适配；不是把 41 个当前 presets 全部宣称已支持。任何接入 recipe/adapter 的支持声明都必须由来源、能力矩阵、合规边界和 runtime 验收证明。本轮只做研究与规划，没有产品实现或真实供应商调用。

本文件规定领域对象和扩展点；`design.md` 规定本地/远程组件部署和 onboarding 流程；`research/provider-access.md` 记录先例与来源；根目录 `GLOSSARY.md` 固定术语。

## 1. 产品目标与原则

- 本地、本地网络浏览器连远程 Gateway、headless/self-hosted Gateway 都属于目标部署形态，不把一个固定本地 callback 当作通用 OAuth 方法。
- 用户按「供应商品牌 → 接入产品/计划 → 连接方式」操作。OpenAI API 和 ChatGPT plan 是两个产品，OpenCode Go 是一个 API-key 订阅产品。
- 同一接入框架支持多种协议和授权流程，但协议、authorization grant、credential store 等通过显式注册 adapter 实现，禁止对未知内容作通用推断。
- API key、OAuth、设备授权、云身份、手动凭证、无凭证是不同认证策略；credential lifecycle、连接、账号身份和模型绑定各有 owner。
- 扩展方便不代表 provider 可被允许接入。每个产品声明 permitted deployment、授权语义、限额、数据处理、支持模型/协议，并可因官方规则将能力标记为 restricted。
- 老的 `provider/upstream_model`、CLI/API、凭证隔离和事务语义保持兼容；新路由能力不由旧静态字段的默认值推导。

## 2. 核心对象

### 静态、版本化注册数据（代码/随发行版发布）

| 实体 | 用途 | 版本/兼容 |
|---|---|---|
| `Brand` | 搜索名称、别名、图标 | 使用现有 brand/icon ID，不作鉴权依据 |
| `Product` | 品牌下的具体服务/计费产品，如 OpenAI API、ChatGPT plan、OpenCode Go、Azure OpenAI | 区分 host、用户资格和 billing label |
| `ConnectionRecipe` | 一个用户可选择的接入模板与向导策略 | `recipe_id + recipe_revision`；含文案/链接、auth option、deployment constraint、probe policy、connector id |
| `AuthMethodDescriptor` | 明确注册的 key、OAuth、device grant、cloud identity 等认证行为 | 指向受支持的 flow adapter；定义 secrets/expiry/refresh/revoke 能力 |
| `AuthFlowAdapter` | 一次授权流程状态机（browser loopback、远程 pairing、device authorization、key entry） | `adapter_id + contract_version`；负责 redirect/state/PKCE/polling/result commit，不发送模型推理 |
| `CredentialProvider` | 认证结果在某种部署中的受保护存储/解析 | local store、remote broker 或 external cloud identity 的明确实现 |
| `ProviderConnector` | 一个上游产品的 discover/usage/inference service facade | `connector_id + version`；只调用显式允许 host，返回规范化结果 |
| `InferenceProtocolAdapter` | Chat Completions、Responses、Anthropic Messages、Gemini 等 wire translation | 明确 operations/capabilities/limits/error & streaming semantics |
| `ModelSourceAdapter` | 当前供应商/账户模型目录、模型 metadata 和分页 | listing 结果单独标记完整性，不等同 inference 可用 |
| `QuotaAdapter` | 可选 usage/limit 查询 | quota scope、单位、reset/新鲜度；无法查询则 unknown |

Provider presets 仍是现有已配置 API transport 的来源；以上 registry 逐步包覆它们。不要在 `ProviderView.tsx` 或 gateway HTTP route 里写品牌分支，也不要让 UI 根据 provider name 猜 adapter。

### 每个 Gateway 实例的运行时数据

| 实体 | 用途 |
|---|---|
| `Connection` | 用户定义的供应商连接；保留目前 `providers[].id` 和模型 ID 稳定性；拥有 product/recipe revision/config snapshot/auth binding/channels |
| `UpstreamAccount` | 授权 adapter 确认的上游 subject/workspace/client registration 身份；不是 JEV operator |
| `AuthorizationGrant` | 一个实际 grant / 设备授权 session / issued client registration 上下文，含 scopes、host、session epoch 和 refresh 状态；API key 也可拥有独立 key record，但不是 OAuth grant |
| `CredentialRecord` | 加密/受限存储的 key/token/cloud ref；有明确 owner、generation、rotation、清除与审计策略 |
| `ModelBinding` | 对现有 canonical `provider/upstream_model` 的运行时绑定；选择来源与 channel，保存经确认的 metadata/能力 |
| `InferenceChannel` | 某连接允许使用的 endpoint+协议+auth application+adapter capability 组合，可有多个但每个 ModelBinding 必须选择明确 channel |
| `AccessObservation` | 对具体 connection/model/channel、deployment、credential/session 代际执行一次身份/listing/generation 检查的结果 |
| `QuotaObservation` | 带 grant/account/workspace/model group scope、window、单位、观察时间、staleness 的结果 |

### 关键关系

```text
Brand → Product → N ConnectionRecipe → AuthMethodDescriptor + AuthFlowAdapter
                                      → ProviderConnector
                                      → ModelSourceAdapter
                                      → InferenceProtocolAdapter(s)
                                      → optional QuotaAdapter

Connection(provider ID)
  ├── Product + accepted recipe/connector/protocol revisions
  ├── exactly one active AuthBinding → CredentialRecord | AuthorizationGrant
  ├── 1..N InferenceChannel
  └── N ModelBinding(provider/upstream_model) → exactly one eligible channel

UpstreamAccount 1..N AuthorizationGrant (different registrations/workspaces remain distinct)
```

Account 仅在上游提供可验证身份时建立。email 只是显示信息，不能作主键；同 email、不同 workspace/client registration 不能合并。一个 grant 初期只允许被一个 Connection 绑定；除非厂商明确说明 quota scope 共享且用户显式选择，不做账号池或负载均衡。

## 3. 接入框架合同

静态 Recipe 应声明 capabilities，不携带 user secrets：

```text
id/revision, brand/product, localized name/aliases/docs
availability + restrictions + policy/evidence status
supported deployment modes + auth method IDs
flow adapter ID + connector ID + model source ID + quota adapter ID?
allowed inference adapter/channel descriptors
fixed issuer/authorize/token/revoke URLs and allowed destinations
expected grants/scopes/account claims; per-flow callback strategy
credential storage class + refresh/revoke semantics
listing/generation/probe operations + bounded policy
billing label + quota scope definition + known data retention notice
capability constraints + official evidence URL + checked_at
```

动态接口最小合同（类型示意，具体 Python Protocol/API 尚待实现研究）：

```python
class AuthFlowAdapter(Protocol):
    def begin(self, context: FlowContext) -> UserAction: ...
    def receive(self, callback: Callback | PollResult, context: FlowContext) -> AuthCandidate: ...
    def validate(self, candidate: AuthCandidate, context: FlowContext) -> VerifiedGrant: ...
    def refresh(self, grant: VerifiedGrant, context: FlowContext) -> RotatedGrant: ...
    def revoke(self, grant: VerifiedGrant, context: FlowContext) -> RevokeResult: ...

class ProviderConnector(Protocol):
    def inspect_credential(self, ...): ...
    def list_models(self, ...): ...
    def inference_channel_for(self, model_id: str, ...) -> InferenceChannel: ...
    def execute(self, channel, request, credential_lease, ...): ...

class ModelSourceAdapter(Protocol):
    def discover(self, connection, credential_lease, ...) -> CatalogResult: ...

class QuotaAdapter(Protocol):
    def read_quota(self, account_or_grant, credential_lease, ...) -> QuotaResult: ...
```

上面只是职责切分示意。OAuth 完成 callback 和 token exchange 次序因供应商不同，应由 adapter 合同定义；框架统一 attempt isolation、single-use、safe errors、credential persistence gates，不强迫所有厂商套相同 OAuth endpoint/claim shape。

禁止 adapter：改变全局 `os.environ`、直接写 `models.json`/provider configuration、返回秘密到 UI、把原始 upstream error 泄漏到日志/API、使用任意 callback/token endpoint、修改外部配置/持久化绕过统一 owner。扩展通过 registry injection；network 与凭证仅依赖受限能力接口。

## 4. 本地与远程：明确支持的部署拓扑

OAuth browser 能力、浏览器位置和 JEV Gateway 位置是独立属性。recipe 必须声明哪些拓扑可行，不把 `callback=localhost` 视为万能远程安全机制。

| 拓扑 | 推荐 callback/秘密路径 | 约束 |
|---|---|---|
| Local Gateway + local browser | 127.0.0.1 exact callback 到本机 JEV | 一次性 state/nonce/PKCE，限时 listener，exact URI/Host 验证；Browser response 不载 gateway key |
| Browser on laptop + remote JEV | 不要求公网上 Gateway 开 OAuth callback。优先官方 device authorization；若 provider 无 device flow，采用 JEV 发出短期一次性 signed pairing challenge，operator 在同一 Gateway 的可信本地 CLI 完成 loopback 授权后仅把加密 grant/result 交还对应 Gateway；或在 Gateway 主机用官方支持的受控浏览器完成 | Host ID 属于 remote Gateway；pairing 绑定 operator session、attempt、nonce、expiry，防转移、重放、跨租户误绑。严禁让 remote service 盲收浏览器 POST token。必须逐供应商验证 vendor redirect URI 是否允许此 broker；不行则显示 remote unsupported/受控路径 |
| Remote Gateway + remote-browser-to-remote-console | 仅当 supplier 官方允许该公开/私有 client 的 exact HTTPS callback 且系统具备 TLS/CSRF/Origin/state 防护时启用 | 用户浏览器 redirect 到 gateway 有反向代理/路径配置、恶意 Host、OAuth mix-up 风险；不接受 UI 自定义 issuer/redirect URI |
| Headless/on-prem gateway | 原生 device-code flow，或 agent host 有受管 browser/helper pairing；API key 手动录入也支持 | 无 device flow 且无可用 callback helper 时不能谎称支持登录。需部署说明与稳定 host identity |

**Remote pairing 是连接安全特性，不是 OAuth grant。** JEV 生成的 challenge 永远不能冒充供应商官方 device code；只有适配器明确选择 `authorization_code`, vendor `device_authorization`, key_entry 等流程。

建议 remote pairing control-plane：

1. Dashboard (已认证) 创建 attempt，服务器产生高熵 id、attempt nonce、pairing challenge、owner/tenant、expires_at、固定 recipe/provider/auth_method 和 host registration，保存服务端状态。
2. UI 展示一次性 URI/短验证码，操作者将本机 helper/CLI 显式连接该 Gateway；通过 TLS certificate/approved gateway origin + challenge response 证明目标 Gateway。挑战不含 token、gateway Bearer key或个人标识。
3. 本地 helper 收到 attempt 后，先从服务器取受限 auth request；根据 recipe 在浏览器上进行供应商登录，回调终结在执行官方 OAuth client 的 helper/local agent。helper 用 TLS 将一次性授权结果以 Gateway challenge 的密钥加密并交付。
4. Gateway 只接受尚未过期、尚未消费、owner/recipe/session epoch/host 完全匹配的 attempt；验证 supplier token/ID token/scopes 后写受保护 grant store，然后删短时临时值。无 token 发到通用 dashboard JS 或日志。
5. 显示完成后销毁 pairing secret/challenge，保留非秘密审计状态。取消/revoke 依 grant owner；撤销失败本地立即停用并显示需供应商手动断开。

这套机制能支持协议上可承载的远程 OAuth，但不能越过 vendor client/redirect/terms 的限制。ChatGPT 官方 VM 文档当前描述的是先本地完成授权、再安全转移凭证到 VM，并指出 host-specific attribution/revocation 不可用；v1 首先实现/评估其官方流程，不自行对 SIWC 改造出官方未认可的 device flow。若 local-to-remote token transfer 将官方流程允许，本地 helper transfer 需防重放、绑定 remote host ID，并标明撤销限制。

## 5. AuthBinding 与秘密生命周期

认证方法用有界 discriminated union：

| kind | 行为 |
|---|---|
| `api_key` | SET/KEEP/CLEAR，secret ref 独立；可属于 API 计费或订阅 API key，billing 另存，不推断套餐 |
| `oauth_grant` | AuthFlowAdapter 完成授予/验证；Connection 绑定 grant_id；刷新与撤销归 credential owner |
| `device_grant` | 仅供应商原生 device flow；polling interval/slow_down/expired_token 由 adapter 抽象但协议错误映射仍有测试 |
| `manual_token` | 只接受 recipe 声明的 token 格式/issuer/expiry；不收 Cookie、浏览器 profile 或任意 token dump |
| `cloud_identity` | 现有 ADC、IAM 等受控方式；deployment-specific，保持旧支持 |
| `none` | 明确的无认证本地/开放 provider；不能 fallback ambient secrets |

通用 AuthFlow state machine：`created → waiting_user → exchanging/validating → candidate_ready → committed`；拒绝/超时/取消/credential rejection/commit_unknown 是终态或恢复分支。Adapter 不能在 validate 阶段把 grant 持久化到活动 connection；只有统一 commit owner 将 candidate single-use handle 绑定。

受保护 store 必须同时设计 local 与 remote：本地 owner-only 文件权限/原子 replace；远程部署 owner-only runtime store、system service 用户、backup encryption/key management policy、静态/传输加密、轮换和备份恢复策略。不能声称 chmod 就是远程加密。若支持多租户，各租户必须有独立密钥和授权可见范围；当前 JEV admin auth 无 RBAC，接入新租户前要有 identity boundary，否则只能按单 operator 资源管理，不能把订阅共享给不可信客户端。

`models.json` 存绑定引用和 adapter revision，不存 token。现存 `credentials.json` 继续服务 API key。OAuth store 单独版本化。Access/refresh/ID tokens 不进 browser、SQLite、routing evidence、URL、应用日志、崩溃 dump。刷新 token rotation 是外部 side effect：跨进程 durable single-flight + CAS，提交失败时可能需重授权，绝不能旧 byte 回滚后说正常。

revision 分四类：`config_revision`（provider/model binding）、`grant_epoch`（登录/断开/身份/授权 scope）、`credential_generation`（同 grant token rotate）、`channel_revision`（endpoint/protocol/capability）。AccessObservation 对齐全部引用的版本，异步晚到结果不得覆盖新状态。活动请求拿短时 CredentialLease；network call 不持全局 config lock。

## 6. 通道/能力和模型绑定

一个 Product 可提供多种接入 recipe；一个 Connection 有多条 InferenceChannel；每个 ModelBinding 明确选择一个 channel。Models source 还会独立报告其 `supports_generation`, `listed_model_ids`, completeness 和 provenance，不能用 directory name 推断 channel。

支持协议逐产品/模型声明：`chat_completions`, `responses`, `anthropic_messages`, `gemini_generate_content`。适配器显式定义：

- 认证 placement/header (Bearer、`x-api-key` 等) 以及固定 allowed host。
- request mapping, required/forbidden fields, explicit unsupported parameters。
- SSE framing、terminal success/failure/incomplete、backpressure/cancellation、non-stream aggregation bound。
- tool calls/results/call-id/history mapping；vision/media schemas；reasoning; usage/cost mapping。
- provider-specific quota/auth errors 的安全分类，不误判 401/403/429/5xx。
- 每项 capabilities 为 supported / unsupported / unknown + 证据/版本；unknown 不等于可用。

有效能力是已确认模型记录 ∩ channel adapter 实现 ∩ product policy ∩ 当前 request；新订阅模型不能继承旧 profile 默认的 `vision/tools/json_mode=true`。自动 route 只选择通过硬约束的 channel；手工指定不支持项返回明确错误而不是静默丢弃参数。

每个 connection 可以启用受 policy gate 限制的显式 inference smoke；不自动发送。结果绑定 model/channel/credential generation，包含时间和 scope。QuotaAdapter 的 quota observation 带 account/grant/workspace/product/model-group 真实 scope，共享额度不复制。无可用 API 显示 unknown。

计费 label `subscription|metered|unknown` 与路由参考价格拆分。用户已确认订阅模型无需手动估值即可参与 economy/balanced：优先采用渠道自身可用的相关价格同步方案，否则回落到 JEV 默认同步器。参考价格不代表实际订阅账单或剩余额度；不能因为 subscription 自动填 0，也不自动加入模型池。所有来源均无价格时模型仍参与路由但成本项排在有有效价格的候选之后，手动指定始终可用；legacy cost semantics 的兼容必须单独核查并测试。

## 7. 安全与合规的可配置可行性

recipe 的 `availability` 为逐认证方式及部署 topology 的状态，而非单个 brand Boolean：`supported`, `restricted`, `not_supported`, `experimental`, `needs_review`。状态附固定原因、官方 evidence refs 和 checked_at。必须有 policy gate 才能向用户展示为 enabled。来源过期或重大 policy change 可降级为禁新建；老连接仍按明确法律/安全策略处理，不会被悄悄改变端点。

- OpenAI API key 和 ChatGPT plan 是不同 Product。官方 SIWC 公开文档面向 open-source/local-hosted app；远程 hosted 产品另有程序要求。ChatGPT plan 使用特定 Responses API 限制及 scopes。官方 remote VM 文档当前是 transfer flow，不把它描述为官方直接远程 OAuth redirect。
- OpenCode Go 用 API key；一个 Go model catalog 对应多个协议 endpoint。按照当前文档将 key 与通道/模型映射；协议及认证 header 测试后逐项启用。
- Anthropic API key 与 Claude.ai subscription 不同。当前官方限制不准第三方收集 Claude.ai 订阅凭证并中转；不能因某竞品运行 Claude CLI 就将该 subscription recipe 设为 supported。用户仍可配置其合法 API/云凭证。
- Z.ai GLM Coding Plan 官方列明只允许在其 approved tools/product environments 使用，并区分 Anthropic/OpenAI protocol base URLs；不能仅因有 API key 就认定 JEV generic gateway 获授权使用，recipe 应 restricted/needs review，先依据官方条款确认 JEV 是否在许可范围。它是 must-have compliance test case。
- 其他当前 41 个 API presets 全要保留兼容，扩展模型支持按实质性适配与产品计划分期；subscription support 必须由证据/允许范围定义，不能自动继承 preset。

## 8. 现有实现映射和架构切入

当前仓库的 `provider_presets.py` 有 41 个 LLM presets + decision preset，目标不只是三家：另有 DashScope 国际/中国、Moonshot 区域、Zhipu/Z.AI、MiniMax 区域、OpenAI-compatible 国内供应商、Azure、Vertex、Bedrock、本地 Ollama/LM Studio 等。统一 onboarding registry 应能表达其中 API/region/cloud/local 模式；不强行给每个 API preset 产生 Account/OAuth。

现有边界：

- `catalog.ProviderProfile`：static reusable transport+credential refs；
- `catalog.ModelProfile`：现有模型选中后 resolved type/base/key；
- `credentials.py` / `provider_config.py` / `config_transaction.py`：secret resolution、revision、validate/apply/recoverable persistence；
- `gateway.py:completion_payload`：当前 LiteLLM Chat Completions 调用组合点；
- `provider/ConversationAdapter`：历史/续写适配而非 HTTP transport；
- `provider_presets.py` 被管理 API 与 CLI 共用；`ProviderView.tsx` 现在固定 preset→通用 credential form。

提案目录（命名待 spec/实现研究验证）：

```text
jev_gateway/onboarding/
  contracts.py           # recipe/auth flow/connector protocol types
  registry.py            # frozen registry, duplicate/id/version validation
  manifests.py           # built-in product/recipe metadata; no secrets
  deployment.py          # local/remote topology and feature constraints
  attempts.py            # state, polling, pairing, single-use result handles
  policy.py              # permitted deployments/official evidence/restrictions
jev_gateway/auth/
  contracts.py / store.py / leases.py / refresh.py / recovery.py
  oauth_...py / device_...py / api_key_...py (only concrete supported flows)
jev_gateway/transports/
  contracts.py / registry.py / chat_completions.py / responses.py / ...
jev_gateway/model_sources/...
jev_gateway/quota/...
```

Do not implement this exact tree until module-depth review; keep facades deep and adapter per provider/product in private concrete modules. FastAPI remains composition root (`gateway.create_app`) but delegates to onboarding/auth/transport services. React consumes safe recipe DTO and generic step schemas, not Python metadata implementation. CLI and dashboard use the same application/domain owners.

## 9. Migration and versioning

1. Keep canonical provider IDs/model IDs and existing `providers` document shape.
2. Legacy ProviderProfile only projects in memory as a legacy Connection + legacy key/cloud/no-auth binding + single LiteLLM channel. Preserve type/params/param_env exact behavior and defaults.
3. Ordinary old edits still roundtrip the old schema; never auto-inject adapter/version fields into every provider.
4. New managed connections use strict tagged/versioned storage representation; reject ambiguous combinations of legacy auth and new `AuthBinding`.
5. Provide explicit revision-aware migration with all model references preserved and rollback plan. No oauth token in `api_key_env` to support a previous binary.
6. Unknown recipe or adapter contract version causes explicit `unsupported_by_runtime`/upgrade error; cannot silently choose generic ChatCompletions.
7. Remote/local auth store roots derive from documented `JEV_GATEWAY_HOME`, with explicit deployment-specific secure-store config. Status/API must not expose resolved paths/secrets.
8. Backup/restore/upgrade/uninstall/CLI health/config commands must account for both secret stores; remote install requires a documented encryption and restore-owner model before claims of production support.

## 10. Existing projects/reference implementations

CC Switch provides two-step preset selection, auth/vendor/cloud/custom categories, plan/region/version variants and “Needs Routing” badges. Its chatgpt/codex reverse-engineered proxy is explicitly risky; don't reuse its private backend/device flow as compliance evidence.

Magpie separates provider/account/plugin account, uses provider protocol channels, auth adapter-specific login/refresh and can run original Claude Code. Its breadth is a useful domain example, but Anthropic terms prohibit its Claude subscription credentials proxy in JEV's proposed generic service. Importing existing agent token files is also not a default architecture; only an explicitly permitted and safe migration path could be considered.

OpenCode Go public docs and CC Switch issues demonstrate per-model multi-protocol endpoints and auth header differences. Z.AI official docs explicitly list allowed tools for GLM Coding Plan; general protocol compatibility is not blanket access permission.

Reuse only abstract patterns (two-step guided selection, account/grant separation, protocol registry, service-owned OAuth adapter, deterministic observation state, connection-to-model ownership). Do not copy implementations until source review, license, security model, user flow, deployment assumptions and vendor policies match.

## 11. Domain invariants / validation scenarios

| Scenario | Required result |
|---|---|
| Local OAuth callback | exact loopback, one attempt, state+PKCE, fixed host, single use |
| Remote browser with vendor-approved device flow | Gateway owns attempt/polling, per-host identity, account owner scope |
| Remote browser without device/approved HTTPS callback | explicit helper/host-side flow or unsupported; never leak callback code to general UI logs |
| ChatGPT local OAuth vs remote self-hosted VM | separate adapter/topology support label; follow official VM credential-transfer/host-ID restrictions |
| Same provider offers API and plan | distinct Product/recipe and billing; no fallback across costs |
| One Go key serves chat/messages/responses models | one auth binding, multiple channels, correct model-level choice; quotas not duplicated |
| Z.AI coding-plan key at unapproved generic endpoint | blocked/restricted until permitted usage confirmed, even if probe succeeds |
| 200 model-list response | listing observation only; does not set authorization/inference pass |
| identity scope without model-plan permission scope | no plan-backed serving |
| same email, different workspace/client registration | separate identity/grant |
| refresh vs logout/pairing completion | stale CAS cannot restore disconnected grant or bind other host |
| two remote tenants register same supplier recipe | separate accounts/grants/data keys; no ID/credential cross-read |
| auth endpoint, issuer or callback override from form | rejected before network call |
| old config/default-auth/Ollama/LMStudio | no forced migration; same behavior |
| generic provider reports unknown capabilities | explicit values remain unknown; cannot inherit false certainty |
| current recipe refresh changes base URL | existing connection unchanged until explicit diff acceptance |
| recipe/adapter not installed in runtime | cannot save as supported; safe upgrade prompt |
| unknown quota / billing | unknown, not zero-priced, unlimited or duplicate per channel |
| revoke fails after local disconnect | local serving stops; user receives fixed action to disconnect upstream |
| refresh rotates upstream but local write fails | recovery state/re-auth; don't restore stale token and report healthy |

All are proposed tests, not passing implementation tests.
