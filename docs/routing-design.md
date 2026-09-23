# JEV provider and model routing design

## Identity model

JEV separates provider transport from concrete model metadata.

| Layer | Identity | Owns |
| --- | --- | --- |
| Provider | `provider.id` | LiteLLM `type` and its transport parameters |
| Model | `provider/upstream_model` | Capabilities, context and output limits, quality, priority, cost, and scoped tags |
| Label | `policy.labels[label]` | Score boundary, decision description, and the tag that selects eligible models |

`provider/upstream_model` is the canonical model ID. JEV rejects a bare
upstream model name for manual selection because multiple providers may expose
the same model label.

## Catalog schema

```json
{
  "providers": [
    {
      "id": "openai",
      "type": "openai",
      "api_base": "https://provider.example/v1",
      "api_key_env": "OPENAI_PROXY_KEY"
    }
  ],
  "models": [
    {
      "provider": "openai",
      "upstream_model": "gpt-5.6-sol",
      "tags": ["task_aware/quick", "task_aware/deep"],
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
    "labels": {
      "quick": {"score": 0, "description": "Bounded work"},
      "deep": {"score": 0.65, "description": "Deep analysis"}
    }
  }
}
```

Every provider requires `id` and a LiteLLM-supported `type`. The provider `id`
names the catalog identity; `type` selects LiteLLM's adapter. Optional
`api_base`, `api_key_env`, `params`, and `param_env` supply that adapter's
completion arguments. For `type: "openai"`, both `api_base` and `api_key_env` are
required. Other types may use LiteLLM's defaults or additional arguments such
as `params.api_version`; `param_env` resolves secret arguments without exposing
them in the policy response. Every model requires `provider` and
`upstream_model`. Tags use `/` for scope and match only
as complete strings. The default strategy label `deep` resolves `task_aware/deep`;
strategy `quality` label `critical` resolves `quality/critical`. A label can set
`tag` to override that convention. The loader rejects duplicate provider IDs,
duplicate canonical model IDs, missing provider references, labels whose tag
matches no model, malformed tags, and literal `api_key` fields.

## Selection

The strategy maps the local score to its ordered `labels` (markers select the last label). It starts with models carrying that label's scoped tag. It filters
models by required tools, vision, JSON mode, reasoning, context capacity, and
output capacity. The remaining models are ranked by `policy.selection`:

- `cheapest_adequate` prioritizes estimated request cost.
- `quality_first` prioritizes model quality.
- `balanced` combines normalized cost and quality, then priority.

If no model in the label can satisfy a hard constraint, JEV widens the search to
the complete model catalog. The decision reports the actual selected model label
when a widened fallback selects a model configured for another label.

This permits both same-provider selection, such as choosing a faster and a
stronger model from one proxy, and cross-provider fallback, such as switching
from a provider-local small model to a different provider's reasoning model.

## Reasoning effort

The model decides which route; the route decides which thinking levels exist. Only
the second of those is a fact:

- `models[].capabilities.reasoning_effort` is the ladder one route accepts, in the
  upstream's own vocabulary. It is per model because it differs per route: a live
  OpenAI-compatible route answers `502` for `minimal`, while the DeepSeek route
  accepts all seven levels.
- `policy.reasoning` is a preference, and it lives on the strategy, so `economy`
  can ask for `low` where `quality` asks for `high` against the same catalog.

The engine derives the level **after** the strategy names a model, because the
answer has to be clamped by that model's ladder, which the strategy cannot know
while it is still comparing candidates. The strategy contract therefore does not
change: `StrategyOutcome` still returns a model, and a custom strategy gets a
sensible level for whichever model it picked without doing anything.

The order is `on_user_correction`, `on_reasoning_request`, `labels.*.reasoning_effort` or `effort_by_label[label]`,
then `fallback`, clamped into the ladder by walking up first and then down. The
label is the one the router committed to, not the locally scored one: the two
differ whenever a classifier refines the label inside a strategy or a pinned
session keeps an earlier one. Using the committed label keeps the level from
contradicting the `X-JEV-Route-Label` (`X-JEV-Task-Type` remains an alias) the client is told. A model that declares no
ladder is left alone entirely: no field is sent and nothing is overridden, which
keeps a catalog that has not opted in byte-identical to one without this feature.

The two text triggers, `on_reasoning_request` and `on_user_correction`, read the
request-intent detectors. `signals.intent_patterns_enabled` controls those
separately from the scoring patterns and defaults to following
`patterns_enabled`, so keeping scoring patterns off while leaving intent
detection on is a supported combination: the detectors feed both the escalation
and the effort triggers without moving the tier, because their score weights stay
behind `patterns_enabled`.

`policy.reasoning.mode` decides what happens to a level the client sent itself.
`override` replaces it, `cap` lowers but never raises it, `fill` speaks only when
the client stayed silent, `preserve` keeps it and clamps it into the ladder, and
`off` never touches the field. The applied level and its source are recorded with
the decision, so a derived level is distinguishable from a clamped one.

## Re-routing modes

`policy.mode` decides what happens after the first turn, when a session already
has a model:

| Mode | Later-turn behavior |
| --- | --- |
| `sticky` (default) | Hold the first turn's model until a reason listed in `policy.pin.break_on` releases it |
| `cached` | As `sticky`, but a decision-backed strategy classifies only the first turn of a live session and reuses its stored tier and model afterward |
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

The top-level `policy` block contains fields inherited by every strategy.
`strategies.task_aware` is required and is the default virtual model. The same
object may define any number of sibling model-routing strategies:

```json
{
  "strategies": {
    "task_aware": {},
    "quality": {
      "mode": "cached",
      "selection": "quality_first",
      "labels": {
        "routine": {"score": 0, "description": "Routine answers"},
        "critical": {"score": 0.65, "description": "Critical work"}
      }
    },
    "economy": {
      "mode": "cached",
      "selection": "cheapest_adequate",
      "labels": {
        "budget": {"score": 0, "description": "Bounded work"},
        "extended": {"score": 0.35, "description": "Extended work"}
      }
    }
  }
}
```

Each strategy inherits unspecified policy fields. Declaring `labels` replaces
the label set, and its pools resolve from tags such as `quality/routine` and
`economy/budget`. A strategy that does not declare `labels` keeps the top-level
labels and resolves their implicit pools under its own strategy name. A request
with `model: "quality"` or `model: "economy"` uses that strategy. The old
`default`/`definitions` wrapper and `tier_models` remain readable for existing
catalogs.

Each named strategy is exposed as an OpenAI-compatible virtual model. A request
with `model: "task_aware"` uses the default strategy; `model: "quality"` selects
the strategy named `quality`; and a provider-qualified catalog model ID manually
selects that concrete model. `GET /v1/models` includes all strategy names and
catalog model IDs. The retired `auto` and `jev-auto` names remain reserved and
return `404 model_not_found` when requested.

The request body's `model` field is the only strategy-selection input. A
strategy name there takes precedence over session state. A concrete model ID
uses the session's pinned strategy, then falls back to `task_aware` when the pin
is absent or no longer registered. `?strategy=` returns
`400 unsupported_parameter`; the `X-JEV-Strategy` request header is ignored.
The same header remains in responses to report the strategy that ran.

The engine deep-copies the session state before handing it to a strategy, so a
custom strategy cannot mutate the live store. The `Catalog` dataclass is frozen,
but its nested policy dictionaries and tier tuples are ordinary Python objects;
a strategy must treat them as read-only. `RoutingRequest` and `StrategyOutcome`
are frozen dataclasses.

`GET /v1/routing/strategies` lists the registered strategies and their policies.
`POST /v1/routing/preview` compares all strategies for the same chat request
by default. The body may contain
`"strategy": ["task_aware", "quality"]` to select a subset. Put one strategy
name in `model` and omit `strategy` to preview only that strategy. The response
is `{"default": "task_aware", "preview": [...]}`. It never serves an upstream call,
writes a decision, or mutates session state.

The optional strategy `kind` defaults to `auto`: it constructs `JevStrategy`
when decision providers are configured, otherwise `PolicyStrategy`. Explicit built-in
kinds are `policy`, `jev`, and `jev_matrix`; the latter two retain compatibility names.
Top-level `decision` configures ordered providers, an optional `default_provider`,
and an explicit protocol (`system_one` is currently supported). A provider's
`model` is optional and is sent only when specified. Legacy `jev` documents are
normalized to `decision`, retaining their former model default; declaring both
keys is invalid. Decision protocols normalize typed choice answers before routing
rules inspect them. This configuration value is separate
from the retired request model name `auto`. Strategy-specific `options` work in
both compact and `definitions` configuration formats.

`jev_matrix` sends the prompt, extracted requirements, and a small session summary
as question state to the configured decision provider. Do not put sensitive material in question
descriptions. Its `reason` records the source and matching rule, not the full
answers. When a strategy declares label-specific reasoning levels, its chosen
label also determines the target effort; omitted reasoning fields inherit from
the top-level policy. `fresh` evaluates every turn, while `cached` reuses the first
live turn's label and model to keep the upstream prompt cache more stable.

### Custom strategy kinds

Strategy code lives under `jev_gateway/strategy/`:

```text
strategy/
├── contracts.py  # RoutingStrategy, RoutingRequest, StrategyOutcome
├── policy.py     # policy-based selection, escalation, hysteresis
├── jev.py        # JevClient, JevClassifier, and JevStrategy
├── matrix.py     # multi-question decision strategy and local rules
└── registry.py   # kind factories, registration, name resolution
```

Implement `RoutingStrategy`, expose a `StrategyFactory`, and register it before
the gateway constructs its strategy registry:

```python
from jev_gateway.strategy import register_strategy_kind

register_strategy_kind("my-kind", build_my_strategy)
```

A definition can then set `"kind": "my-kind"`. The factory receives the parsed
`StrategyDefinition` and active `Catalog`, must return a strategy with the same
`name`, and must not mutate either input. Restart the gateway after changing
Python strategy code; JSON configuration can be reloaded through the routing
reload endpoint.

## The shipped `task_aware` table

The repository's `task_aware` strategy asks a decision provider three questions: `workload`
(research, docs, small_change, coding, reverse), `scale` (bounded, moderate,
large, cross_domain), and `rigor` (draft, exacting). Seven ordered rules map those
answers onto five labels:

| Label | Reached when | Pool | Effort |
| --- | --- | --- | --- |
| `draft` | coding at `draft` rigor; or research/docs/small_change at `draft` rigor | `deepseek-flash` | `low` |
| `review` | research/docs/small_change at `exacting` rigor | `deepseek-flash` | `medium` |
| `craft` | coding at `exacting` rigor with bounded or moderate scale | `gpt-6-luna` | `medium` |
| `engineering` | `reverse`; or coding with `large` scale | `gpt-6-sol`, with `gpt-6-luna` as the constraint fallback | `high` |
| `ultra` | `cross_domain` scale with a `coding` or `reverse` workload | `gpt-6-astra` | `xhigh` |

The split gives each model one job. DeepSeek takes research, documentation,
review, and the coding that does not have to ship. Luna takes small and mid-sized
coding that does. Sol takes large coding and reverse engineering. `ultra` is
reachable only from the cross-domain rule, so a hard single-domain task stays on
Sol however large it is.

Rule 1 also requires a `coding` or `reverse` workload, so researching or
documenting a cross-domain subject stays on DeepSeek instead of being promoted by
the topic alone.

`gpt-5.6-terra` carries no `task_aware` tag. It remains in the `quality/analysis`
pool only for compatibility. The GPT-6 family has no Terra tier, and returning
this old route to a task-aware pool would let it compete with Luna on cost.

### Reserving Astra

The configured provider serves `gpt-6`, `gpt-6-astra`, `gpt-6-sol`, and
`gpt-6-luna`, although its collection endpoint currently omits the GPT-6 aliases.
The catalog therefore records the explicit aliases, not the incomplete list.

Astra has only the `task_aware/ultra` tag. `ultra` selects with `quality_first`,
but no everyday label includes that tag. Only rule 1, which requires a
cross-domain coding or reverse-engineering workload, can select Astra.

## Sessions and observability

Sessions store the selected canonical model ID, so provider and model changes
stay visible in session state. In the default `sticky` mode the first turn's
model is also the session's pin: later turns keep it until a reason in
`policy.pin.break_on` releases it. `cached` follows the same pin rule and avoids
per-turn decision classification. A strategy configured with `mode: "escalate"`,
`"adaptive"`, or `"fresh"` reconsiders the model on its own terms.

Decision records and response headers distinguish the catalog model from the
provider-native model:

| Field | Meaning |
| --- | --- |
| `X-JEV-Route` | Canonical catalog model ID, such as `openai/gpt-5.6-sol` |
| `X-JEV-Provider` | Provider ID, such as `openai` |
| `X-JEV-Model` | Exact `upstream_model` sent to the provider |
| `X-JEV-Strategy` | Strategy that produced the decision |
| `X-JEV-Request-Id` | Stored request row that links to the decision and outcome |
| `X-JEV-Reasoning-Effort` | Applied `reasoning_effort`, when the gateway decided one |
| `X-JEV-Reasoning-Source` | `client`, `clamped_client`, `derived`, `capped`, or `invalid_client` |

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
signals and candidate evidence, a sanitized copy of the final LiteLLM request,
and the upstream outcome. The LiteLLM record is created after provider message
preparation and reasoning-effort selection, immediately before the upstream
call, so failed calls retain the submitted request evidence. Resolved API keys,
authorization and header fields, credential-shaped fields, and every parameter
sourced from `providers[].param_env` are redacted before enqueueing. Unsupported
runtime values become type markers without calling `repr()`.

A config-version snapshot records the routing policy used for that decision;
SQLite's `decision_evidence` view joins request, decision, and outcome records.
The gateway also queues malformed JSON and requests rejected by Pydantic.

Requests rejected by the authorization check before routing are not stored.

Provider continuation rows contain a session ID, an assistant message hash, the
source provider type, and an opaque provider-owned JSON payload. They do not
contain the public assistant message, tool arguments, or prompt. Provider adapters
capture and restore their own payload, supporting DeepSeek reasoning content and
future provider signatures through the same store without provider-specific
gateway branches. `storage.max_continuations_per_session` defaults to `40`, and
`storage.max_continuation_sessions` defaults to `2048`; these bound the retained
continuation state independently of request retention.

The enabled SQLite recorder uses a dedicated `jev-record-writer` thread.
Request threads only enqueue immutable snapshots into a bounded queue and do not
wait for disk writes. The worker opens the database and writes records in queue
order, so config snapshots precede the decisions that reference them. Use
`engine.record_store.flush()` when a caller needs confirmation that all earlier
writes have committed. Shutdown calls `close()` to drain the queue. A full
queue or failed worker drops new submissions and writes a structured warning;
it never changes the gateway response. A successful enqueue does **not**
guarantee the record survived a crash. Later worker failures appear in
`/healthz` under `storage.error`, and subsequent submissions are dropped.
Stream outcomes are enqueued after the stream ends under the same rule.

Upstream errors return a fixed `502` message (`Upstream provider request failed.`)
with `error.code: upstream_error` and a bounded exception `error.type`. The
outcome retains `error_type` but not upstream exception wording:
`outcomes.error_message` is NULL for new upstream failures, and the dashboard
does not serialize that column. DEBUG logs keep traceback locations but omit
untrusted exception messages and source lines. Credential-shaped text is
masked by the gateway formatter. Existing databases may contain raw upstream
error messages from earlier gateway versions; no migration scrubs those rows.

`queue_size` defaults to 4096. `max_requests: null` keeps every request; set a
number only if you explicitly want to prune old evidence. `capture_content:
false` keeps the prompt digest, character counts, extracted signals, models,
timing, and safe structural metadata. It drops inbound prompt and message
content and replaces content-bearing LiteLLM fields with omission descriptors.
SQLite initialization runs in the writer thread at startup; the process waits
once for it to finish.

## Session dashboard

`GET /dashboard` serves a self-contained HTML, CSS, and JavaScript shell with no
session evidence embedded in it. The shell fetches three Bearer-protected data
endpoints:

- `GET /v1/routing/sessions` lists every non-expired session in the current
  process and enriches it with the latest retained request and routed decision.
- `GET /v1/routing/sessions/{session_id}/requests` returns the live session
  snapshot and all retained requests newest first, with nullable decision,
  sanitized upstream request, and outcome stages.
- `GET /v1/routing/providers/summary` returns every configured provider and
  retained attempts submitted to LiteLLM in a fixed rolling 15-minute window.
  The window is inclusive at the start and exclusive at the end, using
  `upstream_requests.created_at`. It has no range parameters.

`MemorySessionStore` remains the authority for what is current. SQLite-only,
expired, and evicted sessions are not listed. Session evidence reads run on the
record-store writer thread behind earlier queued writes. When storage is disabled
or degraded, the list falls back to the live canonical route and catalog provider
metadata; the detail response contains the live snapshot, an empty request list,
and the storage state. The provider summary reads through the same writer queue
and merges its results with the active provider catalog, including providers
with no retained traffic. It counts completed, successful, failed, and
incomplete-evidence attempts. Average observed duration covers completed
outcomes with recorded latency; streams include their full lifetime. A missing
outcome is not evidence of an active request. Its neutral observed condition
describes retained results only: no recent data, all observed attempts
succeeded, mixed outcomes, or all observed attempts failed. The data is best
effort and may have gaps after retention pruning, queue loss, or process
failure. Disabled or degraded storage returns null metrics and condition rather
than zero; configured provider metadata stays visible.

The dashboard asks for the gateway API key only after a 401 response. It keeps
the key in JavaScript memory and sends it in the `Authorization` header. It does
not use query-string credentials, cookies, local storage, or session storage.
Refresh is manual.

## Reload

`POST /v1/routing/reload` reloads providers, models, strategies, storage
registration, and gateway settings from the current catalog file. Sessions
survive a successful reload. If a session's stored model ID no longer exists,
its next request receives a fresh initial selection. If its pinned strategy is
gone, it falls back to the default strategy. The record-store path is read at
startup; a reload re-registers the configuration snapshot but does not reopen
the database.

All `storage` fields require a restart, including retention, capture, and queue
settings; reload rejects changes with `400 restart_required`. Gateway host, port,
and logging settings also require a restart. See the [HTTP API reference](http-api.md)
for reload responses and failure codes.
