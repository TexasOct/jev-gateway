# JEV provider and model routing design

## Identity model

JEV separates provider transport from concrete model metadata.

| Layer | Identity | Owns |
| --- | --- | --- |
| Provider | `provider.id` | OpenAI-compatible base URL and `api_key_env` |
| Model | `provider/upstream_model` | Capabilities, context and output limits, quality, priority, and cost |
| Tier | `policy.tier_models[tier]` | Ordered set of eligible catalog models |

`provider/upstream_model` is the canonical model ID. JEV rejects a bare
upstream model name for manual selection because multiple providers may expose
the same model label.

## Catalog schema

```json
{
  "providers": [
    {
      "id": "openai",
      "api_base": "https://provider.example/v1",
      "api_key_env": "OPENAI_PROXY_KEY"
    }
  ],
  "models": [
    {
      "provider": "openai",
      "upstream_model": "gpt-5.6-sol",
      "priority": 20,
      "quality": 0.95,
      "context_window": 1000000,
      "max_output_tokens": 128000,
      "capabilities": {
        "reasoning": true,
        "temperature": false
      },
      "cost": {
        "input_per_million": 2.0,
        "output_per_million": 10.0
      }
    }
  ],
  "policy": {
    "tier_models": {
      "simple": ["openai/gpt-5.6-sol"],
      "standard": ["openai/gpt-5.6-sol"],
      "complex": ["openai/gpt-5.6-sol"]
    }
  }
}
```

Every provider requires `id`, `api_base`, and `api_key_env`. Every model
requires `provider` and `upstream_model`. The loader rejects duplicate provider
IDs, duplicate canonical model IDs, missing provider references, unknown tier
candidate IDs, and literal `api_key` fields.

## Selection

For an inferred tier, JEV starts with that tier's `tier_models` set. It filters
models by required tools, vision, JSON mode, reasoning, context capacity, and
output capacity. The remaining models are ranked by `policy.selection`:

- `cheapest_adequate` prioritizes estimated request cost.
- `quality_first` prioritizes model quality.
- `balanced` combines normalized cost and quality, then priority.

If no model in the tier can satisfy a hard constraint, JEV widens the search to
the complete model catalog. The decision reports the actual selected model tier
when a widened fallback selects a model configured for another tier.

This permits both same-provider selection, such as choosing a faster and a
stronger model from one proxy, and cross-provider fallback, such as switching
from a provider-local small model to a different provider's reasoning model.

## Re-routing modes

`policy.mode` decides what happens after the first turn, when a session already
has a model:

| Mode | Later-turn behavior |
| --- | --- |
| `sticky` (default) | Hold the first turn's model until a reason listed in `policy.pin.break_on` releases it |
| `escalate` | Follow hard requirements and escalation signals, and never lower the tier on complexity alone |
| `adaptive` | As `escalate`, and return to a lower tier once `escalation.settle_window` turns score below `scoring.standard_threshold` |
| `fresh` | Re-run selection every turn, ignoring the session's model |

The default pin keeps a conversation on one model, so it does not lose the
reasoning state a provider binds to the model that produced it. Only the reasons
in `pin.break_on` release the pin:

```json
{
  "policy": {
    "mode": "sticky",
    "pin": {
      "break_on": ["capability_gap", "context_pressure", "output_limit"]
    }
  }
}
```

| Reason | Meaning |
| --- | --- |
| `capability_gap` | The request needs tools, vision, or JSON mode the pinned model lacks |
| `context_pressure` | The conversation plus the requested output no longer fits the pinned model's window |
| `output_limit` | The requested output exceeds the pinned model's output cap |
| `upstream_failures` | `escalation.max_consecutive_failures` upstream errors accumulated |
| `output_truncated` | `escalation.max_consecutive_truncations` responses stopped at the output cap |
| `user_correction` | The user corrected the previous answer |
| `reasoning_required` | The prompt asks for step-by-step reasoning the pinned model cannot do |
| `complexity_spike` | The inferred tier rose above the session's tier |
| `budget_pressure` | `budget.max_cost_per_session_usd` was reached |
| `complexity_settled` | `adaptive` only: recent scores fell below the standard threshold |

The default lists the first three because holding them back would send a request
the pinned model cannot serve. The rest are escalation signals, so listing one
lets a quality or cost change end the pin as well. An unlisted reason leaves the
session on its model, the decision reports `session_pinned`, and the pin stays.
`mode: "escalate"` restores switch-on-signal behavior for a strategy that should
not pin.

## Strategies

A strategy is the unit that owns the selection rules above. `PolicyStrategy` is
the built-in implementation; it wraps one complete `RoutingPolicy` and answers
one question per request: which catalog model serves this turn.

The top-level `policy` block is registered under the name `default`. The optional
top-level `strategies` object adds named definitions and chooses the default:

```json
{
  "strategies": {
    "default": "default",
    "definitions": {
      "quality": {
        "description": "Re-evaluate every turn and prefer the highest quality model.",
        "policy": {
          "mode": "fresh",
          "selection": "quality_first",
          "tier_models": {
            "simple": ["openai/gpt-5.6-sol"],
            "standard": ["openai/gpt-5.6-sol"],
            "complex": ["openai/gpt-5.6-sol"]
          }
        }
      }
    }
  }
}
```

`strategies.default` may name `default` or a definition. Definitions may not
redefine `default`, because the top-level `policy` owns that name. When
`strategies` is present and `default` names a definition, the top-level `policy`
block may be omitted, and the chosen definition's policy becomes the catalog's
active policy.

A request picks its strategy in this order: the `?strategy=` query parameter,
the `X-JEV-Strategy` header, the session's pinned strategy, then the default. An
explicit unknown name is a `400 unknown_strategy`. A non-explicit name that is no
longer registered falls back to the default, so a session pinned to a strategy
removed by a reload keeps working.

The engine deep-copies the session state before handing it to a strategy, so a
custom strategy cannot mutate the live store. The `Catalog` dataclass is frozen,
but its nested policy dictionaries and tier tuples are ordinary Python objects;
a strategy must treat them as read-only. `RoutingRequest` and `StrategyOutcome`
are frozen dataclasses.

`GET /v1/routing/strategies` lists the registered strategies and their policies.
`POST /v1/routing/preview` compares all strategies for the same chat request
by default. The body may contain `"strategy": ["default", "quality"]` to select a
subset, and `?strategy=quality` previews one. The response is
`{"default": "default", "preview": [...]}`. It never serves an upstream call,
writes a decision, or mutates session state.

## Sessions and observability

Sessions store the selected canonical model ID, so provider and model changes
stay visible in session state. In the default `sticky` mode the first turn's
model is also the session's pin: later turns keep it until a reason in
`policy.pin.break_on` releases it. A strategy configured with `mode:
"escalate"`, `"adaptive"`, or `"fresh"` reconsiders the model on its own terms.

Decision records and response headers distinguish the catalog model from the
provider-native model:

| Field | Meaning |
| --- | --- |
| `X-JEV-Route` | Canonical catalog model ID, such as `openai/gpt-5.6-sol` |
| `X-JEV-Provider` | Provider ID, such as `openai` |
| `X-JEV-Model` | Exact `upstream_model` sent to the provider |
| `X-JEV-Strategy` | Strategy that produced the decision |
| `X-JEV-Request-Id` | Stored request row that links to the decision and outcome |

## Evidence storage

The optional top-level `storage` object configures a SQLite store:

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

When enabled, the gateway queues an inbound request, a decision with its
signals and candidate evidence, and the upstream outcome. A config-version
snapshot records the routing policy used for that decision; SQLite's
`decision_evidence` view joins these records by request and decision ID. The
gateway also queues malformed JSON and requests rejected by Pydantic.

The enabled SQLite recorder uses a dedicated `jev-record-writer` thread.
Request threads only enqueue immutable snapshots into a bounded queue and do not
wait for disk writes. The worker opens the database and writes records in queue
order, so config snapshots precede the decisions that reference them. Use
`engine.record_store.flush()` when a caller needs confirmation that all earlier
writes have committed. Shutdown calls `close()` to drain the queue. A full
queue or failed worker rejects new submissions with `503 storage_unavailable`;
a successful enqueue does **not** guarantee the record survived a crash. Later
worker failures appear in `/healthz` under `storage.error`, and subsequent
submissions fail. Stream outcomes are enqueued after the stream ends; at that
point HTTP status cannot change if enqueueing fails.

`queue_size` defaults to 4096. `max_requests: null` keeps every request; set a
number only if you explicitly want to prune old evidence. `capture_content:
false` keeps the prompt digest, character counts, and extracted signals while
dropping the prompt text and message payloads. SQLite initialization runs in
the writer thread at startup; the process waits once for it to finish.

## Reload

`POST /v1/routing/reload` reloads providers, models, strategies, storage
registration, and gateway settings from the current catalog file. Sessions
survive a successful reload. If a session's stored model ID no longer exists,
its next request receives a fresh initial selection. If its pinned strategy is
gone, it falls back to the default strategy. The record-store path is read at
startup; a reload re-registers the configuration snapshot but does not reopen
the database.
