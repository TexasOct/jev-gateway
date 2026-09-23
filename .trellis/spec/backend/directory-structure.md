# Directory structure

> How backend code is organized in this project.

## Overview

This repository contains one Python package, `jev_gateway`, in a flat layout at
the repository root. There is no `src/` directory and no separate application,
domain, or infrastructure package. Keep new code within the existing module
boundaries instead of introducing a second package layout.

The project separates HTTP transport, routing decisions, decision-provider protocols,
strategy extensions, provider-specific continuation handling, and evidence storage. `gateway.py` is
the composition root. It creates the FastAPI application, wires the routing
engine and record store, and performs upstream LiteLLM calls.

## Directory layout

```text
jev_gateway/
├── __init__.py              # Package metadata only
├── catalog.py               # Catalog types and models.json parsing/validation
├── config.py                # Shared scalar and URL coercion helpers
├── decision.py              # Session-aware routing orchestration
├── decision_provider/       # Decision protocol adapters and failover facade
│   ├── __init__.py          # DecisionClient and protocol registry
│   ├── base.py              # DecisionAdapter and normalized DecisionResult
│   └── system_one.py        # System One wire adapter
├── gateway.py               # FastAPI schemas, routes, auth, streaming, reload
├── reasoning.py             # reasoning_effort derivation and clamping
├── records.py               # SQLite evidence store and writer queue
├── sessions.py              # Session identity and in-memory TTL state
├── signals.py               # Request signal extraction and local scoring
├── logging/
│   ├── __init__.py          # Logging facade
│   ├── catalog.py           # Logging settings parsed from gateway config
│   └── config.py            # Formatters and Uvicorn logging configuration
├── provider/
│   ├── __init__.py          # Provider adapter registry and facade
│   ├── base.py              # Generic conversation adapter contracts
│   └── deepseek.py          # DeepSeek continuation adapter
└── strategy/
    ├── __init__.py          # Strategy facade
    ├── contracts.py         # RoutingStrategy and immutable request/outcome types
    ├── registry.py          # Strategy kind registration and construction
    ├── policy.py            # Built-in policy strategy
    ├── jev.py               # Classifier and legacy JevClient wrapper
    └── matrix.py            # Typed-choice matrix strategy

tests/
├── conftest.py              # Shared pytest fixtures
├── helpers.py               # Catalog builders, prompts, and FakeClock
└── test_*.py                # Module-level and feature-level tests

docs/
├── routing-design.md        # Routing behavior and contracts
├── models-config.md         # models.json reference
├── http-api.md              # HTTP endpoints, headers, errors, reload
└── local-install.md         # Installation and operations
```

## Module ownership

| Module | Responsibility | Main entry points |
| --- | --- | --- |
| `catalog.py` | Immutable catalog-domain objects and strict configuration parsing | `Catalog`, `RoutingPolicy`, `StrategyDefinition`, `catalog_from_document()`, `load_catalog()` |
| `decision.py` | Turn-level routing, session interaction, strategy invocation, and best-effort evidence submission | `Decision`, `RoutingEngine` |
| `decision_provider/` | Decision-protocol transport, normalized answers, and ordered failover | `DecisionClient`, `DecisionAdapter`, `DecisionResult`, `registered_protocols()` |
| `gateway.py` | HTTP boundary, request models, route handlers, authentication, LiteLLM transport, streaming, and reload | `ChatCompletionRequest`, `GatewayConfig`, `create_app()`, `run_gateway()` |
| `signals.py` | Convert chat messages and request features into `RequestSignals` | `ScoringPolicy`, `RequestSignals`, `extract_signals()` |
| `reasoning.py` | Choose and clamp a legal reasoning effort after a model is selected | `derive_effort()`, `effort_for()`, `clamp_effort()` |
| `sessions.py` | Derive session IDs and hold bounded in-memory session state | `SessionState`, `MemorySessionStore`, `derive_session_id()` |
| `records.py` | Store requests, decisions, outcomes, configuration snapshots, and provider continuation state | `RecordStore`, `SqliteRecordStore`, `record_store_from_settings()` |

All FastAPI route declarations currently live inside `create_app()` in
`jev_gateway/gateway.py`. Request and response boundary models belong near those
routes. Routing behavior belongs in `decision.py` or `strategy/`, not in route
handlers.

## Extension points

### Add a routing strategy

1. Add a module under `jev_gateway/strategy/`.
2. Implement the `RoutingStrategy` contract from `strategy/contracts.py`.
3. Register its `kind` through `strategy/registry.py`.
4. Re-export public contracts from `strategy/__init__.py` when callers need them.
5. Add focused tests such as `tests/test_jev_strategy.py` or
   `tests/test_jev_matrix.py`.

`RoutingEngine` imports the `strategy` facade rather than concrete strategy
modules. A new strategy must not require strategy-specific branches in the
engine.

### Add a decision protocol adapter

1. Implement `DecisionAdapter` in `jev_gateway/decision_provider/`.
2. Register its protocol in `_ADAPTERS` in `decision_provider/__init__.py`.
3. Keep `registered_protocols()` aligned with that registry so catalog parsing
   rejects unsupported protocols before startup or reload swaps live state.
4. Add transport, malformed-response, and failover tests in
   `tests/test_decision_provider.py`.

`DecisionClient` owns provider ordering and credentials. Strategies consume
`DecisionResult` and must not parse a provider's HTTP response themselves.
The `provider/` package below is for chat continuation, not routing decisions.

### Add a provider continuation adapter

1. Add a module under `jev_gateway/provider/`.
2. Extend the contracts in `provider/base.py`.
3. Register the provider type in `_ADAPTERS` in `provider/__init__.py`.
4. Add cases to `tests/test_provider_adapters.py`.

`gateway.py` calls `provider.adapter_for()` and does not import concrete adapter
modules. Keep provider-specific continuation payloads behind this facade.

### Add an HTTP endpoint

Add the route inside `create_app()` in `gateway.py`. Reuse the existing
`authorize()` dependency for protected `/v1` endpoints and use `error_body()` or
`HTTPException` details that follow the OpenAI-compatible error envelope.
Business rules should be delegated to the engine, catalog, session store, or
record store.

## Import boundaries

- `strategy/*` may depend on catalog types because strategies compare catalog
  models and policy settings. Strategies call the `decision_provider` facade,
  not individual protocol adapters.
- `decision.py` consumes the public `strategy` facade.
- `gateway.py` consumes `RoutingEngine` and the public `provider` facade. It does
  not select concrete strategy or provider implementations directly.
- `logging/__init__.py`, `provider/__init__.py`, and `strategy/__init__.py` define
  their subpackage public surfaces with explicit `__all__` lists.
- The top-level `jev_gateway/__init__.py` contains package metadata only. Do not
  turn it into a broad re-export surface.

## Naming conventions

- Modules, functions, fields, and configuration keys use `snake_case`.
- Classes, dataclasses, Pydantic models, and protocols use `PascalCase`.
- Module constants use `UPPER_SNAKE_CASE`.
- Internal helpers and registries use a leading underscore, such as `_rank()`,
  `_resolve_storage_path()`, `_FACTORIES`, and `_ADAPTERS`.
- Canonical model IDs use `provider/upstream_model`.
- Strategy `kind` values use lowercase snake case, for example `policy` and
  `jev_matrix`.
- Tests use `tests/test_<module-or-feature>.py` and function names beginning with
  `test_` that state the expected behavior.

## Reference examples

- Extension registry: `jev_gateway/strategy/registry.py`
- Stable extension facade: `jev_gateway/strategy/__init__.py`
- HTTP composition root: `jev_gateway/gateway.py:create_app`
- Module-to-test mapping: `jev_gateway/records.py` and `tests/test_records.py`
