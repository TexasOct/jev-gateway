# Design: provider-neutral decision providers

## Boundaries

- `catalog.py` owns canonical configuration parsing, validation, immutable decision settings, and the one-time legacy-key translation.
- A new decision-provider package owns protocol contracts, protocol adapters, source failover, and normalized result validation.
- `strategy/jev.py` keeps the existing classifier and public compatibility names temporarily, but delegates transport to the generic decision client.
- `strategy/matrix.py` continues to consume typed answers and owns no protocol-specific behavior.
- `gateway.py` remains unchanged unless a configuration snapshot projection needs canonical serialization.

## Canonical configuration

Use top-level `decision` with `enabled`, `default_provider`, `timeout_seconds`, and ordered `providers`. Each provider has `id`, explicit `protocol`, `api_base`, `api_key_env`, and optional `model`. Initially register the `system_one` protocol, which preserves the current request/response contract. Do not add a default model value to the canonical configuration. The adapter includes `model` in its request only when configured.

The shipped runtime and example configuration use `decision` and provider-neutral protocol/type vocabulary. The live project endpoint/model may remain explicitly configured as its existing deployment values; no vendor-specific values or examples are introduced.

## Compatibility and migration

- Accept `jev` as a deprecated alias when `decision` is absent.
- Convert legacy sources to the `system_one` protocol and preserve the legacy effective model default so existing deployments keep working.
- Reject documents containing both `decision` and `jev` to prevent silent precedence changes.
- Keep deprecated Python names such as `JevSettings`, `JevSource`, `JevClient`, and strategy-facing imports as aliases or thin wrappers where practical; new code uses generic names.
- Expose canonical `decision` terminology in strategy/API configuration descriptions. If a legacy document is loaded, do not expose secrets; return the normalized generic snapshot rather than duplicating raw aliases.

## Provider contract and flow

1. Catalog parsing creates immutable `DecisionSettings` and `DecisionProvider` values.
2. `DecisionClient` iterates providers in configured order, honoring `default_provider` as the first attempt.
3. A protocol registry resolves `provider.protocol` to a request/response adapter.
4. The adapter sends the normalized state/questions payload and returns `DecisionResult` with source identity and typed answers.
5. Client-level validation rejects malformed envelopes and lets the next provider run; strategy-specific validation continues to reject incomplete or out-of-domain answers and can also trigger failover.
6. If no provider returns valid answers, existing local/matrix fallback behavior applies.

The first adapter implements the current System One wire shape. Adding a future protocol means adding and registering an adapter, not adding provider branches to strategies. This task does not add any other protocol or new answer type.

## Security and operational behavior

- Resolve credentials only from declared `api_key_env` variables.
- Never serialize the resolved secret in catalog or strategy descriptions.
- Keep current timeout, ordered failover, and local fallback semantics.
- Static configuration errors fail before catalog replacement; reload retains its existing all-or-nothing behavior.

## Risks and tradeoffs

- Supporting the old default model only in the `jev` migration path intentionally preserves legacy behavior; canonical configuration must state a model explicitly when its endpoint needs one.
- The `system_one` adapter can only normalize typed `choice` results in this change. Numeric and boolean decision primitives remain unsupported by routing rules.
- Compatibility aliases should not become permanent names in new docs or sample configuration.
