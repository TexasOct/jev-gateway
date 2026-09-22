# JEV Gateway

JEV Gateway is a session-aware OpenAI-compatible model-routing gateway. `models.json` defines the
providers, concrete models, routing policy, and gateway runtime. A request is
routed to a catalog model, not directly to an endpoint.

## Provider and model identity

The catalog has three layers:

1. `providers` declare a LiteLLM `type` plus the transport settings that type
   needs. `id` names the JEV catalog entry and is independent of `type`.
2. `models` name a provider and its exact `upstream_model`, then define model
   capabilities, limits, quality, cost, and scoped routing tags.
3. `policy.labels` defines each strategy's ordered score boundaries. A label gets
   its model pool from tags such as `task_aware/quick` or `quality/critical`.

A catalog model is indexed only by its provider-qualified identity:

```text
<provider>/<upstream_model>
```

For example, a model declared as:

```json
{
  "provider": "deepseek",
  "upstream_model": "deepseek-flash",
  "tags": ["task_aware/quick", "economy/budget"]
}
```

has the catalog model ID `deepseek/deepseek-flash`. This ID is used for
OpenAI-compatible manual model selection, session state, `X-JEV-Route`, and
records. Its `tags` place it in strategy-local model pools. Bare upstream names such as
`deepseek-flash` are not valid manual selections because they are not globally
unique.

```json
{
  "providers": [
    {
      "id": "deepseek",
      "type": "deepseek",
      "api_base": "https://api.deepseek.com/v1",
      "api_key_env": "JEV_DEEPSEEK_API_KEY"
    },
    {
      "id": "openai",
      "type": "openai",
      "api_base": "https://claude.texasoct.tech/v1",
      "api_key_env": "JEV_OPENAI_API_KEY"
    }
  ],
  "models": [
    {
      "provider": "deepseek",
      "upstream_model": "deepseek-flash",
      "tags": ["task_aware/quick", "task_aware/working"],
      "context_window": 1000000,
      "max_output_tokens": 384000,
      "capabilities": {
        "reasoning": true,
        "reasoning_effort": ["none", "minimal", "low", "medium", "high", "xhigh", "max"]
      },
      "cost": {"input_per_million": 0.3, "output_per_million": 1.2}
    },
    {
      "provider": "openai",
      "upstream_model": "gpt-5.6-sol",
      "tags": ["task_aware/deep"],
      "context_window": 1000000,
      "max_output_tokens": 128000,
      "capabilities": {
        "reasoning": true,
        "temperature": false,
        "reasoning_effort": ["none", "low", "medium", "high", "xhigh", "max"]
      },
      "cost": {"input_per_million": 2.0, "output_per_million": 10.0}
    }
  ],
  "policy": {
    "labels": {
      "quick": {"score": 0, "description": "Short requests", "reasoning_effort": "low"},
      "working": {"score": 0.35, "description": "Multi-step work", "reasoning_effort": "medium"},
      "deep": {"score": 0.65, "description": "Architecture and audit", "reasoning_effort": "high"}
    },
    "reasoning": {"mode": "cap"}
  }
}
```

Several models may reference one provider, so they share its transport settings
without duplication. `type` is a LiteLLM provider prefix: `deepseek` uses its
native adapter, while `openai` works with custom OpenAI-compatible endpoints.
Optional `api_base`, `api_key_env`, `params`, and `param_env` supply the arguments
LiteLLM needs. For example, Azure can specify `params.api_version` and Vertex AI
can specify `params.vertex_project` and `params.vertex_location`; secret arguments
belong in `param_env`. `type` does not change the catalog model ID. Tags use `/`
as a scope separator and are matched exactly.
For the default strategy, label `quick` resolves `task_aware/quick`; label `critical`
in strategy `quality` resolves `quality/critical`. A label may set `tag` to use a
different exact tag. JEV filters the matching models by capabilities, context
window, and output limit, then applies the configured cost, quality, and priority rules.

The `capabilities.reasoning_effort` ladder is what one route accepts, in the
upstream's own vocabulary, so it is filled in per model and verified against the
route: the OpenAI-compatible route above answers `502` for `minimal` while the
DeepSeek route accepts every level. `policy.reasoning` then picks the level once
the model is known, clamped into that model's ladder. A route that declares no
ladder is left untouched. See [docs/models-config.md](docs/models-config.md#reasoning)
for the modes and the measured values.

## Configuration and secrets

`models.json` is the only static configuration source. It contains providers,
models, strategy labels, scoring, re-routing policy, and gateway runtime settings. The
process does not read fixed `JEV_API_BASE`, `JEV_API_KEY`, `JEV_ROUTES`,
`JEV_MODELS_FILE`, route override, or policy override variables.

`.env` contains only secrets whose names are explicitly declared as
`api_key_env` or in `providers[].param_env` in the catalog. Secret resolution
uses only those declared environment-variable names:

```python
os.getenv(api_key_env)
```

`api_key` literals are rejected in both `providers` and `models`. The policy
endpoint returns environment-variable names, never the resolved secrets.

The optional `gateway.api_key_env` protects JEV's inbound HTTP API. It follows
the same rule: JSON names the environment variable and `.env` supplies its
value.

## Gateway runtime

The optional `gateway` object has `host`, `port`, `api_key_env`,
`session_strategy`, `session_ttl_seconds`, `max_sessions`, `decision_log_size`,
`echo_requested_model`, `logging_level`, `log_format`, and `access_log`. Host, port, and logging
settings apply when the process starts; the other gateway settings apply after a
successful reload. By default, `jev-gateway` logs routing decisions and outcomes
at INFO in grouped, multi-line `pretty` format and skips per-request Uvicorn access
lines. Set `gateway.log_format` to `json` for one JSON object per log event, or
to `compact` for single-line `key=value` output. Set `gateway.access_log` to `true` for HTTP request lines, or
`gateway.logging_level` to `DEBUG` for stream-start and traceback details.
LiteLLM's provider-list debug print is disabled; warnings remain visible. Uvicorn's
lifecycle logger is displayed as `uvicorn`, not `uvicorn.error`; terminal output
uses level colors and redirected output remains plain text.

## Routing strategies

The top-level `policy` block contains fields inherited by named strategies.
`strategies.task_aware` is required and is the default virtual model. Other
entries add sibling virtual models and override only the routing fields they need:

```json
{
  "strategies": {
    "task_aware": {},
    "quality": {
      "selection": "quality_first",
      "labels": {
        "routine": {"score": 0, "description": "Routine answers"},
        "critical": {"score": 0.65, "description": "Critical work"}
      }
    },
    "economy": {
      "selection": "cheapest_adequate",
      "labels": {
        "budget": {"score": 0, "description": "Bounded tasks"},
        "extended": {"score": 0.35, "description": "Extended tasks"}
      }
    }
  }
}
```

Each strategy inherits every unspecified field from the top-level `policy`.
Declaring `labels` replaces the inherited set as a whole; `economy` does not inherit `quick`, `working`, or `deep`. Add any
number of sibling strategy names, but keep `task_aware` defined. Each name is
also an OpenAI-compatible model name.

`mode` defaults to `sticky`, which holds the first selected model until a reason
in `pin.break_on` requires a switch. `cached` has the same hard-constraint
switching behavior, but a JEV-backed strategy calls JEV only on the first turn
of a live session. Later turns reuse the stored tier and model, improving
upstream prompt-cache stability. `escalate` and `adaptive` reconsider a session
on routing signals; `fresh` re-runs selection on every turn.

`kind` is optional. `auto` uses JEV when JEV sources are configured and the
plain policy strategy otherwise. Explicit built-in kinds are `jev`, `policy`, and
`jev_matrix`.
The old `default`/`definitions` wrapper remains supported for compatibility and
custom strategy kinds.

`jev_matrix` sends multiple typed choice questions to System One and maps the
answers to a strategy-local label and selection rule. Define strategy-specific parameters
under `options` (available in both compact and `definitions` formats). Each
question needs `type: "choice"`, `instructions`, and a `criteria` object with at
least two labeled descriptions. Rules are checked in order; `when` matches an
answer label or a list of labels. The first match sets `label` and/or `selection`.
If JEV is unavailable or returns invalid answers, `fallback` applies. If no
rule matches, the strategy uses the local score mapped to its labels and policy selection.

```json
{
  "strategies": {
    "task_aware": {
      "kind": "jev_matrix",
      "mode": "fresh",
      "labels": {
        "draft": {"score": 0, "description": "Drafts", "reasoning_effort": "low"},
        "review": {"score": 0.35, "description": "Review", "reasoning_effort": "medium"},
        "engineering": {"score": 0.65, "description": "Engineering", "reasoning_effort": "high"}
      },
      "options": {
        "questions": {
          "workload": {
            "type": "choice",
            "instructions": "What work is requested?",
            "criteria": {"docs": "Documentation and prose", "coding": "Implement or fix code"}
          }
        },
        "rules": [{"when": {"workload": "coding"}, "select": {"label": "engineering"}}],
        "fallback": {"label": "draft"}
      }
    }
  }
}
```

Here `task_aware` states its own `labels` block, so the
label a rule selects also fixes the thinking level: docs and small edits run on
the small model at low effort, and coding or reverse-engineering work on the
top model at high effort. A strategy that omits these fields inherits them from
the top-level policy. Local policy selection still checks model capabilities,
context, output limits, and session switching rules. With `mode: "fresh"`, JEV
is queried on every turn so a session that changes purpose changes model;
`cached` queries only the first live session turn. The question/answer state
contains the prompt, extracted requirements, and a small session summary; do
not put sensitive material in question descriptions. `reason` records the
source and matching rule, not the full answers. Restart the gateway after
changing Python strategy code; JSON configuration can be reloaded through the
routing reload endpoint.

Each named strategy is exposed as an OpenAI-compatible virtual model. Send the
strategy name through the standard request-body `model` field. The default is
`task_aware`:

```json
{"model": "quality", "messages": [{"role": "user", "content": "Review this design."}]}
```

`GET /v1/models` lists `task_aware`, the other strategy names, and concrete
catalog model IDs. A strategy model name runs that strategy's normal selection;
a concrete catalog model ID manually locks the request to that model.

The request body is the only strategy-selection interface. A registered
strategy name in `model` selects that strategy. A concrete model ID uses the
strategy pinned to the session, or `task_aware` when no valid pin exists. The
retired `auto` and `jev-auto` names return `404 model_not_found`. The
`?strategy=` query parameter returns `400 unsupported_parameter`, and the
`X-JEV-Strategy` request header does not affect selection. `X-JEV-Strategy`
remains a response header that reports the strategy used.

The engine passes each strategy a detached copy of the session state, so a
strategy cannot mutate live session state. The catalog dataclass itself is
frozen, but its nested policy dictionaries and tier tuples are ordinary Python
objects. A custom strategy must treat them as read-only.

Strategy code lives under `jev_gateway/strategy/`:

```text
strategy/
├── contracts.py  # RoutingStrategy, RoutingRequest, StrategyOutcome
├── policy.py     # policy-based selection, escalation, hysteresis
├── jev.py        # JevClient, JevClassifier, and JevStrategy
├── matrix.py     # multi-question JEV strategy and local rules
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
request by default. Send `{"model": "task_aware", "strategy": ["task_aware", "quality"], "messages": [...]}` to
compare a subset. To preview one strategy, put its name in `model` and omit
`strategy`. It returns
`{"default": "task_aware", "preview": [{"strategy": "task_aware", "route": "...", ...}]}`
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
    "max_continuations_per_session": 40,
    "max_continuation_sessions": 2048,
    "busy_timeout_ms": 5000,
    "queue_size": 4096
  }
}
```

When enabled, the gateway queues the inbound request, decision evidence,
upstream outcome, active config snapshot, and provider continuation metadata. A dedicated `jev-record-writer`
thread performs all SQLite I/O. Request threads enqueue without waiting for disk;
`queue_size` is bounded (default 4096). A full queue or failed writer drops the
record and writes a structured warning; neither case changes the gateway
response. `record_store.flush()` waits for queued writes to commit; `close()`
drains the queue on orderly shutdown. A successful enqueue does not guarantee
persistence if the process crashes before the writer commits. Worker errors
appear in `/healthz` as `storage.error`. A stream outcome follows the same
best-effort rule.

`capture_content: false` stores a prompt digest and signal counts instead of
prompt text. `max_requests: null` keeps all request records; setting a number opts
into pruning. Provider continuation rows contain a session ID, an assistant
message hash, the source provider type, and an opaque provider-owned JSON payload.
They do not contain the public assistant message, tool arguments, or prompt.
`max_continuations_per_session` and `max_continuation_sessions` bound this state.
Provider adapters decide how to capture and restore their payload, which lets the
same store support DeepSeek reasoning content and future provider signatures
without provider-specific gateway code. All `storage` settings are process-start
settings. `/v1/routing/reload` rejects storage changes with `restart_required`;
restart the gateway to apply retention, path, queue, or capture changes. The
gateway also queues malformed JSON
and requests rejected by Pydantic, but requests rejected before the handler for
authorization are not stored.

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

Use `model: "task_aware"` for the default routing behavior. To select a
concrete catalog model manually, send its provider-qualified ID:

```json
{
  "model": "openai/gpt-5.6-sol",
  "messages": [{"role": "user", "content": "设计一个高并发订单系统。"}]
}
```

Responses include `X-JEV-Route` (catalog model ID), `X-JEV-Provider`,
`X-JEV-Model` (provider-native upstream model), `X-JEV-Route-Label`, `X-JEV-Task-Type` (alias),
`X-JEV-Reason`, `X-JEV-Strategy`, `X-JEV-Request-Id`, `X-JEV-Session-Id`, and
`X-JEV-Decision-Id`. When the gateway decided a thinking level, the response also
carries `X-JEV-Reasoning-Effort` and `X-JEV-Reasoning-Source`.

To select another strategy for one request, put its registered name in the JSON
body's `model` field. Query parameters and request headers do not select
strategies.

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
