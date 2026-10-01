# 发现执行清单

- [x] 完整读取源协议/metadata 研究和 backend specs。
- [x] 实现可注入的安全网络 transport，单独测试 DNS/pinned connection/redirect/private opt-in。
- [x] 实现协议 registry 与 OpenAI/Anthropic/DeepSeek discover_models；规范返回 shape。
- [x] 实现 lookup_model_metadata、数据源 parser/单位/匹配/cache 和本地备用。
- [x] 给配置 owner 提供模块与调用说明，补充 mocked fixture 测试。
- [x] 运行本子任务 focused tests/pyright。
- [ ] 配置 owner 接入后运行 HTTP import/secret regressions。

先交付配置契约后集成；前端可以固定 mock API 独立制作。只编辑新 discovery/network/metadata 文件及镜像 tests，避免与配置子任务抢 catalog/gateway。API 变化同步父方案及 frontend owner。

## Module handoff

`jev_gateway.model_discovery.discover_models(provider, api_key, *, imported_ids)` and `jev_gateway.model_metadata.lookup_model_metadata(provider, upstream_models, *, refresh=False)` are importable. The configuration owner adds the HTTP imports and handlers. These modules do not read the user's catalog or credential files, write configuration, or query metadata during chat routing.

Lookup returns `{items, fetched_at, stale}`. Each item is `{upstream_model, fields, sources, warnings}`. Discovery returns `{provider_id, supported, complete, items, warnings}`; its item is `{upstream_model, qualified_id, imported, metadata}`, with `metadata` equal to the lookup item's `{fields, sources, warnings}`.

`fields` always contains these flat names, using `null` for unknown values: `input_per_million`, `output_per_million`, `tools`, `vision`, `json_mode`, `reasoning`, `temperature`, `reasoning_effort`, `context_window`, `max_output_tokens`. Conflicting candidates leave the affected field null and retain both sources. Custom endpoints retain native public catalog evidence as `applicable: false`, so those prices and capabilities do not prefill the custom serving.

Source example for a fixture with an explicit Models.dev input price:

```json
{
  "source": "models_dev",
  "source_provider": "openai",
  "source_model": "fixture-model",
  "fetched_at": "2026-09-30T00:00:00+00:00",
  "applicable": true,
  "url": "https://models.dev/api.json",
  "schema_revision": "f4f37ea6a4315ebdb733a49c35499aa93fd35840",
  "fields": {
    "input_per_million": {
      "value": 2.0,
      "source_field": "cost.input",
      "unit": "USD/M tokens",
      "source_unit": "USD/M tokens"
    }
  },
  "pricing": {"input": {"value": 2.0, "unit": "USD/M tokens"}}
}
```

Native discovery sources use `source: "native_listing"` and the instance ID as `source_provider`; they contain no endpoint or credential. Public source evidence may also contain `canonical_model_id`, `source_updated_at`, `source_reasoning_effort`, and projected `pricing` conditions. `source_updated_at` is the source's declared date. It is not the retrieval or verification date. Preserve source evidence with the user's import confirmation, including fields that cannot prefill routing values, such as a native input-only limit or an unsupported effort value. The metadata envelope integration remains the configuration owner's work.

The test seam is `discover_models_with_dependencies(..., fetch=..., clock=...)` and `MetadataClient(fetch=..., clock=..., snapshot_loader=...)`. The public lookup delegates to a bounded process-local client; tests can replace that client. Discovery keeps no credential or listing cache.

## Verification evidence

On 2026-09-30:

```text
uv run pytest -q tests/test_discovery_network.py tests/test_model_discovery.py tests/test_model_metadata.py
73 passed in 0.10s

uvx pyright jev_gateway/model_discovery.py jev_gateway/model_metadata.py jev_gateway/discovery_network.py tests/test_model_discovery.py tests/test_model_metadata.py tests/test_discovery_network.py
0 errors, 0 warnings, 0 informations
```

Tests use injected responses, fixture DNS answers, fake sockets and a local socket pair. No live upstream, public metadata or generation requests were sent during tests. The socket-pair case verifies that the total deadline interrupts stalled response headers. Mocked cancellation verifies that discovery capacity is released. Source fixtures cover exact matching, canonical links, conditional prices, units, unknown/null/false values, conflicts, detached evidence, refresh throttling, concurrent fetches, conditional 304 reads and expiry after six hours.

HTTP authorization, selected import, metadata confirmation persistence and frontend request races need integrated verification. The main agent owns docs/spec updates and full repository gates.

## Review corrections

Applied the two P2 corrections identified by independent review:

- Anthropic `capabilities.structured_outputs.supported` now remains `structured_output` source evidence. Its true, false, or null value retains the original `source_field` and applicability; `fields.json_mode` stays null because the native declaration alone cannot certify JEV's LiteLLM JSON response-format behavior.
- The network reader checks raw body bytes against the declared Content-Length before parsing JSON. Early EOF returns the fixed `invalid_response` category even when the received bytes form valid JSON. Chunked framing continues to use HTTPResponse's chunk reader without imposing Content-Length on its decoded body.

Regression fixtures use a real `http.client.HTTPResponse` over an in-memory stream. A Content-Length of 100 with only the 11-byte `{"data":[]}` body fails direct fetching; a truncated second discovery page preserves the first page's imported item and reports `complete: false` with `invalid_response`. Complete length-delimited, EOF-delimited and chunked responses, zero-length JSON rejection, and bodyless 304 behavior are also covered. No live upstream or public-source requests were made.

Final focused verification:

```text
LITELLM_LOCAL_MODEL_COST_MAP=true uv run pytest -q tests/test_discovery_network.py tests/test_model_discovery.py tests/test_model_metadata.py
82 passed in 0.10s

uvx pyright jev_gateway/model_metadata.py jev_gateway/discovery_network.py tests/test_model_metadata.py tests/test_discovery_network.py tests/test_model_discovery.py
0 errors, 0 warnings, 0 informations
```

The initial type check found a fixture socket annotation mismatch; an explicit cast for HTTPResponse's socket parameter resolved it. The final test run and type check above include that correction. Configuration, frontend, docs/spec changes and whole-suite verification remain with their respective owners.
