Fresh installations now start with the existing strategy plans and no bundled
providers, models or upstream credentials. Local dashboard setup creates a
protected management key and opens the console; suppliers and models can be
configured later. CLI setup also supports terminal and remote deployments.

File-backed configuration can be edited through the existing guarded dashboard
transactions. Settings provides one global default model shared by every
strategy. An empty matched tag routes to this model and reports `default` in
previews, response headers, records and sessions. The dashboard displays
Default/默认 for this reserved result while preserving literal custom labels.
Per-strategy default overrides
are deferred. Missing usable routing returns a controlled setup_incomplete error
while the console remains available.

Initialization and updates preserve existing configuration, credentials, routing
overlays and records. The installer retains the current running/stopped service
behavior and uses Python 3.12. Download the wheel or installer with its matching
SHA256 sidecar. See the README and CLI documentation for setup and reload steps.

Completed streams now retain finish reason, usage, the provider's returned model
and assistant continuation state after successful delivery. Interrupted streams
retain failure evidence without recording a completed continuation.

首次安装保留默认策略，不带供应商、模型或上游密钥。本机面板设置管理密钥后即可进入
控制台，供应商和模型可稍后配置。Settings 中的全局默认模型由所有策略共同继承；
命中空 tag 时回退到它，分流显示“默认”。每个策略单独设置默认模型延后。安装和更新
保留已有配置、凭据、路由覆盖和记录。
