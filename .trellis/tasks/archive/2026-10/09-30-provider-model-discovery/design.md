# 模型发现与在线元数据

## 边界与依赖

消费配置子任务的 provider schema、credential mapping 和管理 API；本子任务只创建独立 discovery/network/metadata 模块和 tests，不编辑 catalog.py、gateway.py 或 frontend。接口由配置 owner 集成。

## 模块接口

`discover_models(provider: Mapping[str, Any], api_key: str | None, *, imported_ids: set[str]) -> dict[str, Any]` 返回父方案 items/complete/supported/warnings。`lookup_model_metadata(provider: Mapping[str, Any], upstream_models: list[str], *, refresh: bool = False) -> dict[str, Any]` 返回 `{items: [{upstream_model, fields, sources, warnings}], fetched_at, stale}`。所有字段默认 nullable，字段证据包含 source/provider/model/units/time；无 secret 或原响应。provider 参数含 id/type/api_base/brand_id/allow_private_network/非敏感必要参数，credential 单独传入。

网络层独立 `safe_get_json`，通过验证后固定 resolved IP 连接与 TLS hostname/SNI，拒绝重定向、userinfo、query credential、fragment、危险 IP；private/localhost 仅 per-provider opt-in。公网只能 HTTPS，私网 opt-in 可 HTTP。20 秒总 timeout、4 MiB listing、20 页/1000 models，失败固定分类。mock 网络依赖可替换，不让测试访问真实 provider。

## 协议与数据

按 transport 注册 OpenAI-compatible、Anthropic、DeepSeek；unsupported 类型不猜 endpoint。Anthropic 的版本/auth/paging 原生适配，DeepSeek 可选 metadata 依实际字段映射。Decision/System One 不发现，model 保持可省略。

读取 Models.dev 固定公开源与实际 OpenRouter serving 元数据，LiteLLM 备用表直接读取安装数据，避免 import-time fetch/helper 默认 0。来源最多 16 MiB，缓存 6 小时、有刷新/并发保护。按精确 provider/model 与显式 canonical/alias 关联；自定义 endpoint 的原厂价格仅参考，不能认证实际报价。公共数据库请求不传 key、私有地址或请求内容。

价格归一化 USD/百万，保留 tier/cache 证据。能力分工具/vision/JSON/reasoning/temperature/effort；缺失不当 false/true，created/last_updated 不作为核验时间。来源建议不覆盖手工输入、既有目录或 tags/priority；import 由配置服务 full validation 和确认处理。

## 验收

测试 auth/path/paging、空与重复、partial/unsupported、safe target pinning、private opt-in、取消/stale、limits、units、tier、unknown/null/false、匹配冲突和 cache。仅 fixtures/mock。发现不写文件，源失败不阻止聊天。
