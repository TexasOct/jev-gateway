# 供应商订阅计划快捷接入设计

## Goal

让用户按实际持有的供应商服务/订阅计划快捷连接 JEV，而不必理解通用 transport 配置。JEV Gateway 服务端直接保存授权并代理推理请求，不只是配置外部客户端。

## Confirmed decisions

用户本轮确认：

1. 按供应商的实际做法提供官方授权或手动 token/key 配置等方式，不强制所有供应商使用同一种认证。
2. JEV 直接持有授权并代理请求。
3. 用户要求参考 CC Switch / Magpie 后开始重新建模；当前授权为设计与领域建模，尚未批准产品实现。

## Background

- 现有共享 preset registry 在 `jev_gateway/provider_presets.py`；前端添加流程位于 `frontend/src/features/providers/suppliers/ProviderView.tsx`。选 preset 后进入统一编辑器，已有主 key、云凭据和服务器默认认证，并非所有 transport 只有单 key。
- 现有连接保存与模型发现/确认导入是独立步骤；候选连接测试仅证明模型列表可读取。写入沿用 expected_revision 和可恢复激活事务。
- 当前没有发现独立 OAuth session 的轮换身份模型；`gateway.py:completion_payload` 从静态模型 profile 组装 LiteLLM completion 参数，`provider/` 是历史/续写适配，不是通用 transport 层。
- 官方接入核查、原文来源与限制记录在 `research/provider-access.md`。OpenAI 有开源本地应用的官方 ChatGPT plan 授权路线；OpenCode Go 提供订阅 API key 和多种推理协议；Anthropic 当前明确禁止第三方收集 Claude.ai 订阅凭证并代用户代理请求。

## Requirements

- R1：添加入口按品牌及接入产品组织；领域模型区分 Connection、Account、AuthorizationGrant、ModelBinding 与 InferenceChannel，OAuth 绑定特定授权会话而非含糊绑定账号。认证方式、订阅计费与推理协议分别建模。继续支持 API key、自定义兼容连接、本地模型、云默认身份与 decision providers。
- R2：OpenAI 分开显示 ChatGPT plan 与 API 按量计费；OpenCode Go 使用该产品的 key 引导；Claude 明确显示订阅代理限制，提供 Console API/已有云连接替代路径，不出现无效的订阅 token 输入。
- R3：提供选择服务→连接授权→检查并保存→选择模型的渐进流程。默认隐藏 transport、凭证引用等实现字段，保留必要高级配置；保存连接后方可导入模型，不自动设置策略或默认模型。
- R4：JEV 服务端拥有 OAuth 交换、受保护存储、刷新、重新授权和撤销生命周期。浏览器不持有 OAuth access/refresh/ID token，不要求网站密码、Cookie 或第一方私有会话文件。
- R5：认证成功、模型列表读取、模型已导入、实际生成成功、额度状态分别展示。任何实际生成测试必须用户单独触发并提示消耗额度；旧 model-listing test 保持不生成。
- R6：代理适配覆盖请求与流式/非流式返回、工具往返、终止/错误、取消和资源释放。不支持的硬参数不得静默删除或假报完整兼容。
- R7：保留旧 provider/model IDs、凭据引用、路由及 overlay 所有权、密钥不回显、revision 冲突、未知写结果恢复、草稿/异步代际保护及 CLI 行为。
- R8：按 AuthorizationGrant 串行刷新并防止退出/删除后晚到请求重新写入 token。配置事务、session epoch 与轮换 secret generation 分离，避免每次刷新令全部草稿失效；认证身份/权限变更仍需作废相关观测。
- R9：订阅模型无需操作者手动估值即可参与 economy / balanced。价格同步优先采用渠道自身可用的相关方案，否则回落到 JEV 默认价格同步器；同步值是路由比较参考，不代表订阅实际按 token 计费。订阅不是零成本或无限额度；未知剩余额度不可编造，不得无声切换到按量付费连接。全部来源均无价格时，模型仍可参与路由，但成本项排在有有效价格的候选之后；手动指定仍可使用，不填零、不虚构价格。
- R10：保留现有 UI 组件、主题、语言与品牌资产来源；完整键盘、窄屏、失败恢复和状态文案属于验收。

## 首阶段实现范围（已确认）

用户确认首阶段先落地通用部分，且通用层按方案 A 定义：

- 可扩展的 recipe / auth-flow / credential-store / connector / model-source / inference-protocol / quota contracts 与 registry；
- 通用 onboarding UI 与安全 DTO 投影；
- 现有 41 个 LLM presets 与 decision preset 的无损兼容映射；
- 受管授权生命周期基础设施：attempt 状态机、受保护 grant store、CredentialProvider 接口、刷新/CAS/tombstone、管理 API 骨架；
- 从现有 completion 调用点抽取窄 transport seam，旧 LiteLLM 行为保持等价。

首阶段以合成 recipe、synthetic secrets 与 mock upstream 驱动验证，不启用任何真实供应商的 OAuth、订阅 key 或新推理协议 adapter，不发送真实请求。Dashboard 首阶段只展示实际可连接的接入方式；尚未落地的订阅产品不显示占位入口，待对应 adapter 可用后再加入目录。供应商 adapter 分期属于后续阶段，仍受逐项许可与证据门控制。

## Scope decision: local and remote deployment

用户确认本次接入框架同时考虑本地与远程 Gateway，范围不再假设为 local-only。抽象应覆盖目前大多数供应商的 API 接入及其有官方依据的订阅授权方式；通过可扩展的 recipe、auth-flow、credential-store、connector、model-source、inference-protocol 和 quota adapters 支持差异，不能把框架覆盖度误写成已逐家认证/实测。

所有当前 41 个 LLM presets 必须保持旧连接兼容，并进入新目录/抽象的覆盖盘点。新增订阅登录按产品、官方允许用途、部署拓扑分别标记支持/受限/不支持/待核实。未能确认条款/远程流程的产品不得打开登录路径。

远程流程至少需要正式设计 host identity、浏览器与 gateway 不同主机时的授权回传、一次性 pairing、跨设备 callback/device-flow 可用性、tenant/operator owner、服务端秘密管理、刷新/撤销、备份恢复和安全部署。不得要求打开无保护公网 OAuth callback，也不得将本地 callback 直接冒用为远程地址。

本次部署与授权所有权边界已确认：支持本地及远程 Gateway，但只面向单一 operator；不实现多人/多租户 ACL、账号池或跨 operator grant 共享。远程 pairing 必须把 grant 绑定到这一个 Gateway/operator 与稳定 host identity。

## Acceptance criteria

- A1 / R1–R3：原生 UI 可从品牌找到正确接入产品和所需凭据；OpenAI 不混淆 ChatGPT/API 计费，Go 不混淆其他 OpenCode 产品；Claude 不出现不可用授权按钮或订阅 token 框。
- A2 / R3–R5：取消或测试不保存 provider/model；明确保存只创建连接，导入只创建已确认模型；成功写后读取失败仅 GET 恢复，不重放写入。
- A3 / R4,R8：授权回调重放、错误 state/nonce/身份/scopes、过期、刷新并发、进程重启、撤销失败、删除/刷新竞态有确定性测试；无凭证泄露。
- A4 / R5,R6：listing 成功不等于 generation 成功；显式生成测试标记具体模型、配置/授权代际和时间；上游终止事件、晚到额度错误、断流及取消不伪装成功。
- A5 / R6：三个协议族的文本/工具/多模态能力按实现范围独立验收；不支持参数在上游调用前明确拒绝；OpenAI Preview 限制有专项测试。
- A6 / R7：旧配置无需迁移仍能启动/编辑/调用；显示名、credential refresh 不改模型 ID 或 overlay；新 schema 在旧版本下明确报错，不能悄悄降级认证。
- A7 / R8：同 session 的刷新跨进程 single-flight/CAS，轮换不使普通管理 revision 频繁变化；身份绑定、退出和删除仍使相关探测及请求失效。
- A8 / R9：订阅模型无需手动估值即可参与 economy / balanced；测试覆盖渠道价格源优先、不可用时默认同步器回落，并显示参考价格来源及其与实际订阅账单的区别。订阅不显示为免费 token 或虚构额度，没有自动跨计费模式回退；全部来源无价格时仍可参与路由，但成本项排在有有效价格的候选之后，手动指定仍可使用；测试覆盖全缺价候选与混合候选，不填零、不虚构价格。无需估值不意味着导入后自动加入模型池。
- A9 / R10：320px 与桌面、双语言/主题、键盘、焦点恢复、pending、超时、取消、重连、旧异步返回以及只读状态均通过浏览器验收。
- A10：实现前完成用户设计评审；真实第三方账号验收只使用另行授权的测试账号，文档读取或 mock 通过不能替代真实接入结论。
- A11 / R1,R7,R8：domain-model.md 中的反例成立：同 Go 连接多协议不复制账号或额度；同 email 不同 workspace 不合并；grant 断开不清除其他 session；recipe 更新不静默改已保存通道；legacy 只内存映射，普通编辑不强制迁移。
- A12：以当前 41 个 LLM presets 逐项生成接入覆盖清单，保留旧行为；对主流 API/订阅产品按 `Product × Auth Method × Deployment Topology × Protocol` 声明支持矩阵。只有已实现 adapter 且许可/endpoint/test evidence 通过者可标 supported，不能因为通用接口存在而宣称所有供应商都已适配。

## 首阶段验收范围

首阶段覆盖：现有 41 个 LLM presets 与 decision preset 的兼容映射；通用 recipe/adapter registry 与安全 DTO；通用连接引导 UI（仅呈现可连接方式）；合成授权 attempt/grant 生命周期及并发/删除竞态；保持旧行为等价的 transport seam；合成 listing/generation 状态区分；旧配置、CLI、模型 ID、凭据和事务行为回归；窄屏、键盘、双语及失败恢复验收。

后续供应商阶段再验收：OpenAI ChatGPT/API 产品区别与 SIWC；OpenCode Go key 与各模型协议；Claude subscription restricted 提示及 API/cloud 替代；订阅价格同步优先级与成本排序；真实供应商 OAuth/密钥/协议 smoke；各 provider 的生成测试及额度提示。相关 A1/A4/A5/A8/A10/A12 条款是整个计划的最终验收目标，不能误报为首阶段已完成；首阶段必须逐项标记 synthetic/mock 与真实接入的证据边界。

## Out of scope

- 当前轮修改产品代码、发布或运行真实订阅账号请求。
- 抓取密码/Cookie、私有客户端 token、伪装官方客户端或绕过条款限制。
- Claude 订阅凭证代理；托管原版 Claude Code 是不同产品，不偷换为通用聊天网关。
- 自动购买订阅、自动付费兜底、共享账号池、额度规避或未经批准的多租户共享授权。
- 在验证前承诺所有订阅、模型、工具和 Chat Completions 参数完整兼容。

## Decisions closed

- 本地及远程部署均在本次接入框架范围内。
- 仅支持单一 operator 管理其 Gateway 与授权；不提供多人/多租户共享授权或跨 operator 访问控制。本设计据此仍需绑定 Gateway host identity，并保护远程授权回传。
- 首阶段先落地通用层（方案 A），供应商 adapter 全部后置，仍受许可与证据门控制。
- 订阅参考价按渠道价格源优先、否则默认同步器；全缺价仍可路由但成本项排序靠后，手动指定可用。
