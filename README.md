# JEV Gateway

JEV Gateway is a session-aware OpenAI-compatible model-routing gateway. `models.json` defines the
providers, concrete models, routing policy, and gateway runtime. A request is
routed to a catalog model, not directly to an endpoint.

## Provider and model identity

The catalog has three layers:

1. `providers` own reusable connections: `api_base` and `api_key_env`.
2. `models` name a provider and its exact `upstream_model`, then define model
   capabilities, limits, quality, and cost.
3. `policy.tier_models` lists the concrete model IDs that may serve each tier.

A catalog model is indexed only by its provider-qualified identity:

```text
<provider>/<upstream_model>
```

For example, a model declared as:

```json
{
  "provider": "deepseek",
  "upstream_model": "deepseek-flash"
}
```

has the catalog model ID `deepseek/deepseek-flash`. This ID is used in
`tier_models`, OpenAI-compatible manual model selection, session state,
`X-JEV-Route`, and decision records. Bare upstream names such as
`deepseek-flash` are not valid manual selections because they are not globally
unique.

```json
{
  "providers": [
    {
      "id": "deepseek",
      "api_base": "https://api.deepseek.com/v1",
      "api_key_env": "JEV_DEEPSEEK_API_KEY"
    },
    {
      "id": "openai",
      "api_base": "https://claude.texasoct.tech/v1",
      "api_key_env": "JEV_OPENAI_API_KEY"
    }
  ],
  "models": [
    {
      "provider": "deepseek",
      "upstream_model": "deepseek-flash",
      "context_window": 1000000,
      "max_output_tokens": 384000,
      "capabilities": {"reasoning": true},
      "cost": {"input_per_million": 0.3, "output_per_million": 1.2}
    },
    {
      "provider": "openai",
      "upstream_model": "gpt-5.6-sol",
      "context_window": 1000000,
      "max_output_tokens": 128000,
      "capabilities": {"reasoning": true, "temperature": false},
      "cost": {"input_per_million": 2.0, "output_per_million": 10.0}
    }
  ],
  "policy": {
    "tier_models": {
      "simple": ["deepseek/deepseek-flash"],
      "standard": ["deepseek/deepseek-flash", "openai/gpt-5.6-sol"],
      "complex": ["openai/gpt-5.6-sol"]
    }
  }
}
```

Several models may reference one provider, so they share its endpoint and key
without duplication. A tier can contain models from one provider or from
several providers. JEV filters candidates by model capabilities, context window,
and output limit, then applies the configured cost, quality, and priority rules.

## Configuration and secrets

`models.json` is the only static configuration source. It contains providers,
models, tiers, scoring, re-routing policy, and gateway runtime settings. The
process does not read fixed `JEV_API_BASE`, `JEV_API_KEY`, `JEV_ROUTES`,
`JEV_MODELS_FILE`, route override, or policy override variables.

`.env` contains only secrets whose names are explicitly declared as
`api_key_env` in the catalog. The only production environment lookup is:

```python
os.getenv(api_key_env)
```

`api_key` literals are rejected in both `providers` and `models`. The policy
endpoint returns `api_key_env` and `has_api_key`, never the resolved secret.

The optional `gateway.api_key_env` protects JEV's inbound HTTP API. It follows
the same rule: JSON names the environment variable and `.env` supplies its
value.

## Gateway runtime

The optional `gateway` object has `host`, `port`, `api_key_env`,
`session_strategy`, `session_ttl_seconds`, `max_sessions`, `decision_log_size`,
and `echo_requested_model`. The host and port apply when the process starts.
The other gateway settings apply after a successful reload.

## Routing strategies

The top-level `policy` block is registered as a strategy named `default`. The
optional top-level `strategies` object adds named strategies and picks which one
serves requests that do not name one:

```json
{
  "strategies": {
    "definitions": {
      "quality": {
        "policy": {
          "mode": "fresh",
          "selection": "quality_first"
        }
      }
    }
  }
}
```

When a top-level `policy` exists, each definition inherits it and only needs
to declare fields that differ. The example therefore keeps the same tiers and
scoring rules while changing only `mode` and `selection`. Its optional `kind`
selects the implementation factory. `auto` (the default) uses JEV when JEV
sources are configured and the plain policy strategy otherwise. Built-in
explicit kinds are `jev` and `policy`. `strategies.default` may name `default`
(the top-level policy) or one of the definitions; it defaults to `default` when
omitted. When `strategies` is present and `default` names a definition, the
top-level `policy` block may be omitted. In that form, the default definition
must provide complete tier mappings.

`mode` defaults to `sticky`: a session holds the model chosen for its first turn,
so the conversation keeps whatever reasoning state the provider bound to that
model. `policy.pin.break_on` lists the reasons that may end the pin and defaults
to `["capability_gap", "context_pressure", "output_limit"]`, the constraints
that leave the pinned model unable to serve the request. Set `"mode":
"escalate"` (or `adaptive` / `fresh`) on a strategy to re-evaluate the model on
every turn instead.

A request selects its strategy in this order:

1. the `?strategy=` query parameter,
2. the `X-JEV-Strategy` request header,
3. the session's pinned strategy,
4. the default strategy.

An explicit name that is not registered returns `400 unknown_strategy`. A
non-explicit name that is not registered (for example a pin from an older
catalog) falls back to the default. The selected name is stored on the session
and returned in `X-JEV-Strategy`.

The engine passes each strategy a detached copy of the session state, so a
strategy cannot mutate live session state. The catalog dataclass itself is
frozen, but its nested policy dictionaries and tier tuples are ordinary Python
objects. A custom strategy must treat them as read-only.

Strategy code lives under `jev_gateway/strategy/`:

```text
strategy/
├── contracts.py  # RoutingStrategy, RoutingRequest, StrategyOutcome
├── policy.py     # policy-based selection, escalation, hysteresis
├── jev.py        # JevClassifier and JevStrategy
└── registry.py   # kind factories, registration, name resolution
```

To add a strategy type, implement `RoutingStrategy`, expose a
`StrategyFactory`, and register it during startup:

```python
from jev_gateway.strategy import register_strategy_kind

register_strategy_kind("my-kind", build_my_strategy)
```

A strategy definition can then set `"kind": "my-kind"`. The factory receives
the parsed `StrategyDefinition` and active `Catalog`. It must return a strategy
with the same `name` and must not mutate either input.

`GET /v1/routing/strategies` lists the registered strategies and their policies.
`POST /v1/routing/preview` compares all registered strategies for the same chat
request by default. Send `{"strategy": ["default", "quality"], "messages": [...]}` to
compare a subset, or use `?strategy=quality` to preview only one. It returns
`{"default": "default", "preview": [{"strategy": "default", "route": "...", ...}]}`
without serving an upstream call, writing a decision, or touching session or
storage state.

## Routing evidence storage

The optional top-level `storage` object controls the SQLite record store:

```json
{
  "storage": {
    "enabled": true,
    "path": "jev-records.sqlite3",
    "capture_content": true,
    "max_requests": null,
    "busy_timeout_ms": 5000,
    "queue_size": 4096
  }
}
```

When enabled, the gateway queues the inbound request, decision evidence,
upstream outcome, and active config snapshot. A dedicated `jev-record-writer`
thread performs all SQLite I/O. Request threads enqueue without waiting for disk;
`queue_size` is bounded (default 4096) and a full queue returns
`503 storage_unavailable`. `record_store.flush()` waits for queued writes to
commit; `close()` drains the queue on orderly shutdown. A successful enqueue
does not guarantee persistence if the process crashes before the writer commits.
Worker errors appear in `/healthz` as `storage.error` and reject new submissions.
A stream outcome failure after headers were sent can only be logged.

`capture_content: false` stores a prompt digest and signal counts instead of
prompt text. `max_requests: null` keeps all records; setting a number opts into
pruning. The gateway also queues malformed JSON and requests rejected by
Pydantic, but requests rejected before the handler for authorization are not
stored.

## Run

For local installation choices, persistent runtime data, Homebrew-assisted setup, and Docker, see [`docs/local-install.md`](docs/local-install.md).

For repository development:

```bash
uv sync --all-groups
uv run jev-gateway
```

The gateway provides `GET /healthz`, `GET /v1/models`,
`GET /v1/routing/policy`, `GET /v1/routing/strategies`,
`POST /v1/routing/preview`, `GET /v1/routing/decisions/{decision_id}`,
`GET /v1/routing/sessions/{session_id}`, and OpenAI-compatible
`POST /v1/chat/completions`.

Use `model: "auto"` for routing. To select a concrete catalog model manually,
send its provider-qualified ID:

```json
{
  "model": "openai/gpt-5.6-sol",
  "messages": [{"role": "user", "content": "设计一个高并发订单系统。"}]
}
```

Responses include `X-JEV-Route` (catalog model ID), `X-JEV-Provider`,
`X-JEV-Model` (provider-native upstream model), `X-JEV-Task-Type`,
`X-JEV-Reason`, `X-JEV-Strategy`, `X-JEV-Request-Id`, `X-JEV-Session-Id`, and
`X-JEV-Decision-Id`.

To select a strategy for one request, add `?strategy=<name>` or the
`X-JEV-Strategy: <name>` header.

## Reload

```bash
curl -X POST http://127.0.0.1:8000/v1/routing/reload
```

Reload re-parses the same catalog, resolves only its declared key variables,
and preserves live sessions. If the selected model no longer exists, the next
turn falls back to an initial decision. A changed bind host or port requires a
process restart.

## Verification

```bash
uv run pytest -q
uv build
```

The detailed routing behavior is in
[`docs/routing-design.md`](docs/routing-design.md). The field-by-field
`models.json` reference is in [`docs/models-config.md`](docs/models-config.md).
