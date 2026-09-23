# Provider-neutral decision provider configuration

## Goal

Expand decision-engine configuration so callers configure decision providers through provider-neutral terminology rather than treating `jev` as a model/provider name. Preserve current routing behavior and do not add vendor-specific names, settings, or examples.

## Background

- `jev.sources[]` currently configures ordered HTTP sources with `id`, `api_base`, `api_key_env`, and an optional `model` defaulting to `typesafe/jev-1.13`.
- `JevClient` posts the System One request shape and retries later sources after transport, response, or validation failures.
- `jev_matrix` consumes typed `choice` answers and maps them through local rules; current decision strategies do not consume `score` or `noul` answer values.
- The existing `task_aware` configuration relies on `jev_matrix` and must continue to route as before.
- The canonical top-level configuration name will be `decision`; legacy `jev` remains accepted as a deprecated alias during migration.

## Requirements

- Canonical configuration naming and types must be provider-neutral and describe decision engines/providers, not a specific vendor or model.
- The configured decision provider list must support ordered failover and secret references through environment-variable names.
- The canonical provider protocol must be explicit, and the canonical schema must not inject a vendor-specific model name when one is omitted.
- When both `decision` and legacy `jev` are present, parsing must reject the ambiguous configuration instead of silently choosing one.
- Strategy logic must consume a normalized decision result rather than depend directly on one provider protocol.
- Existing `task_aware` behavior, local fallback behavior, and manual-model bypass behavior must remain intact.
- Documentation and shipped example configuration must use generic terminology and must not include vendor-specific content.
- Keep current functionality limited to the answer types and decision rules supported by the repository; expanding the decision DSL is out of scope.

## Acceptance Criteria

- [x] A generic configuration schema can describe the current System One-compatible source without vendor-specific names or implicit vendor model defaults.
- [x] Legacy `jev` configuration remains readable as a deprecated alias; ambiguous documents containing both keys fail validation.
- [x] The decision client/adapter boundary allows additional decision-provider protocols to be added without coupling provider-specific request/response handling to routing strategies.
- [x] Multiple decision providers are tried in configured order, and malformed or failed results fall through to the next provider and then existing local fallback.
- [x] The shipped `task_aware` strategy and its routing decisions remain behaviorally compatible.
- [x] Tests cover configuration validation, successful decision response, failover, malformed response, local fallback, and manual bypass.
- [x] Documentation and sample config describe only generic decision-provider configuration, without vendor-specific examples.
