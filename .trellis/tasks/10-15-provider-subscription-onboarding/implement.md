# 实施顺序（草案，不是开工授权）

当前阶段：planning。不得运行 task start 或修改产品代码；本地+远程都纳入。已关闭：单一 operator 边界、订阅价格源优先级与全缺价路由行为、首阶段实施切片（方案 A：通用层含授权生命周期基础设施与 transport seam，不启用真实供应商）。已确认：首阶段 UI 只展示可实际连接的接入方式，不显示未落地订阅产品占位。供应商生成测试、手动 token 范围与 OpenAI Preview 复核留给后续 adapter 阶段。本阶段仍须完成源码核查、技术合同定稿及最终规划评审后才能启动。

## 0. 设计收敛门

- [ ] 确认远程是 single-operator self-hosted（已确认）。
- [x] 确认单一 operator 边界与远程 pairing 只向该 operator 的 Gateway 交付 grant。
- [x] 冻结订阅参考价源优先级（渠道优先，否则默认同步器）与全缺价排序行为（仍可路由，成本项排后，手动指定可用）。
- [x] 明确首阶段实现切片（方案 A）：通用层含 contracts/registry、UI、41 presets 映射、受管授权生命周期基础设施与 transport seam；不启用真实供应商 adapter。
- [x] 首阶段 UI 只展示可实际连接的接入方式；未实现订阅产品不提供占位或登录入口，测试用 synthetic recipes 不进入生产目录。
- [ ] 后续阶段（供应商 adapter）再定：手动输入 token 的实际供应商范围、显式生成测试的最小功能与耗额提示、逐供应商协议覆盖。
- [ ] 复核官方文档、许可和部署资格；OpenAI Preview 动态变化有逐项检查表。
- [ ] 前后端 schema 与 safe projections、CLI 兼容、local/remote CredentialProvider、secure pairing/device/loopback 流程及版本回退定稿。
- [ ] 盘点 41 个现有 LLM presets 与 coding/subscription plan: product/auth/deployment/protocol/quota/billing/official-use support；未核实项标 `needs_review/restricted`，不得把抽象覆盖写成已支持。
- [ ] PRD 去重收敛，design/implement 更新为最终版并经用户评审。
- [ ] implement/check context manifests 加入真实 spec/research；按当前会话身份正确激活现有 task，不能为修复指针重建任务。

## 1. 领域合同与接入 UI

- [ ] 以 domain-model.md v3 为权威：Connection 保留 provider ID；Account/AuthorizationGrant 分离；OAuth 按 grant 绑定；新 ModelBinding 引用已确认的通道。
- [ ] 固定多协议、同 email 不同 workspace、断开/旋转竞态、recipe 快照、legacy 内存投影反例为测试用例，再定严格持久化 discriminator/version。
- [ ] 账号仅在可验证身份时创建，不强制普通 key/cloud/local 生成 Account；首版不增加共享 grant/账号池。

- [ ] 扩展共享 Brand/Product/Recipe/AuthFlow/Connector/Protocol/ModelSource/Quota registry，而非在 UI 通过品牌名猜 auth/transport；41 个旧 presets 全保留为兼容基线。
- [ ] 品牌/产品搜索、产品选择、专用 key/OAuth/restricted 向导、检查/保存/模型下一步。
- [ ] 保留 decision、云认证、无 key 本地、自定义连接、原编辑及草稿保护。
- [ ] 用现有组件、Lobe 资产及双语言主题，不新增风格系统。

## 2. 受管授权生命周期

- [ ] 受保护 versioned store、permission/size/shape 验证、snapshot、CAS/single-flight、tombstone 和恢复。
- [ ] configuration revision / session epoch / secret generation / channel revision 分离；配置绑定和暂存 single-use handle 原子消费；grant tombstone 阻止晚到 refresh。
- [ ] 外部 refresh 成功但本地原子提交失败时明确恢复/重授权，不声称恢复旧 token 字节即可回滚。
- [ ] 按拓扑实现 OpenAI 官方 local SIWC 与官方允许的 self-hosted VM credential transfer；评估精确 loopback callback URL 粘贴作为本地可访问性 fallback，仅在 SIWC/client 流程许可且完成一次性 state/PKCE 校验后启用；未获批准的 public remote callback/device-flow 标 unsupported，不借用其他客户端凭证。
- [ ] 借鉴 rclone / GitHub CLI / RFC 8628 的分拓扑引导：provider device flow 展示 URI、user code、expiry、polling、cancel；有许可的远程 helper 指向绑定 Gateway 的 pairing；明确分离手动 API key 输入与授权回调 URL 粘贴。
- [ ] 重新授权、断开、远程撤销失败说明；退出/刷新/保存竞态和 orphan cleanup。
- [ ] 管理 API 鉴权、固定错误与敏感数据 redaction；callback/pairing/device attempt 都有独立一次性校验。
- [ ] local file 与 remote service credential backends 的加密、backup/restore/rotation owner 定义；多租户 ACL 无实现前禁止 grant 共享。

## 3. 推理与模型

- [ ] 从 gateway 的既有 completion 调用点提取窄 transport seam，旧 LiteLLM 行为先保持等价；不改写 continuation adapter 职责。
- [ ] OpenAI Responses bridge：角色/历史、字段限制、工具往返、流终止/错误、非流聚合、usage、取消。
- [ ] 主流供应商逐项通过政策 gate 后启用 recipes。Go 单连接多 InferenceChannel 与可信 per-model 选择；不同模型/通道共用同一 auth binding，额度 scope 不按通道复制；不支持项不可假装可服务。
- [ ] listing/认证/生成/用量分离，显式 bounded generation probe 独立于旧 listing test。
- [ ] runtime credential lease，不在静态 profile 固化可轮换 token。
- [ ] 费用/能力筛选遵循冻结合同；不自动加入策略/默认或付费 fallback。

## 4. 验证

实现阶段使用 synthetic secrets、mock 官方 endpoint 与 deterministic clocks；真实第三方测试需另行授权，并独立记账。

- [ ] Python：旧 config/CLI 不变，事务 rollback/未决 journal，错误身份/state/nonce/scopes/replay，刷新并发及撤销竞态、进程重启。
- [ ] 协议：文本、tools/结果多轮、内容/图片边界，stream=false 聚合，failed/incomplete/半截事件、晚到限额、网络取消及资源释放；不支持字段零上游调用。
- [ ] UI/browser：逐入口 native actions；pending/失败/返回/取消/重连、未知提交 GET-only、已保存后读取失败；320px/桌面、双语言主题、键盘及焦点。
- [ ] 隐私：配置 GET/日志/异常/SQLite/诊断/URL/浏览器 storage 和 bundle 中无授权秘密；文件与 backup/recovery 权限断言。
- [ ] 单独列出真实账号接入未验证项，不能用 fixture 截图代替。

实施后的仓库命令（本轮未执行，因为只写规划文档）：

```bash
uv run pytest -q
uvx pyright
npm --prefix frontend run lint
npm --prefix frontend run test
scripts/build-frontend.sh
scripts/build-frontend.sh --check
uv build
```

浏览器命令先根据实际 fixtures/config 确定所有权，再运行相关 suite；不臆造新的 package scripts。

## 5. 交付

- [ ] 完整需求→实现→证据映射、独立审核、官方限制复核。
- [ ] 更新公开 admin/credentials/models/API/CLI 文档和英文/中文 README；规划草案不冒充 shipped 功能。
- [ ] 记录新合同到英文 specs；准备范围明确的提交计划，用户批准后再提交，不自动发布。

## 风险文件与回滚点

`catalog.py`、`provider_config.py`、`config_transaction.py`、`credentials.py`、`gateway.py`、CLI、shared API types 和 management hook 为兼容高风险区。后续先用测试锁定旧行为；不宽泛重构。保留本任务之前的 README 和 project-structure 文档变更，不混入产品交付。

新 OAuth token 轮换及远程 revoke 不能仅靠恢复旧文件回滚；恢复健康结构引用后可能必须重新授权。保护所有恢复材料，不公开 secret source snapshot。
