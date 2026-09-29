# Current decision flow

## Configuration

- `jev_from_dict()` in `jev_gateway/catalog.py` parses `enabled`, source ordering, timeout, and an optional source `model`; omission currently supplies `typesafe/jev-1.13`.
- The resulting `JevSettings` and `JevSource` are stored on `Catalog` and serialized from strategy descriptions through `as_dict()`.
- The top-level key currently appears in `models.json`, `models.example.json`, and the `jev` section of `docs/models-config.md`.

## Runtime

- `JevClient.evaluate()` in `jev_gateway/strategy/jev.py` posts `{model, state, questions}` with a Bearer token to each configured source in order.
- Network errors, non-success responses, malformed envelopes, and caller-supplied answer validation failures continue to the next source.
- `JevClassifier.refine()` consumes one typed `choice`; `JevMatrixStrategy.decide()` consumes all configured typed choices and evaluates local rules.
- Matrix requests bypass the decision call for manual models and cached continuations. An exhausted provider chain uses the strategy's configured fallback.

## Relevant tests and docs

- Configuration: `tests/test_catalog.py`
- Single-answer classifier: `tests/test_jev_strategy.py`
- Multi-answer strategy: `tests/test_jev_matrix.py`
- Strategy/configuration descriptions: `tests/test_routing_strategies.py`
- User contract: `docs/models-config.md`, `README.md`, and `README.zh-CN.md`
- Backend rules: `.trellis/spec/backend/index.md`, `directory-structure.md`, `quality-guidelines.md`, and `error-handling.md`

## Implementation implications

- Keep the compatibility mapping at catalog parsing, not spread through strategies.
- Keep response parsing and transport behavior inside a protocol adapter selected by a registry/facade.
- Normalize successful provider responses to a provider-neutral typed-answer result before the classifier or matrix consumes them.
- Keep credentials as environment variable references and ensure strategy descriptions expose no resolved secret.
- The existing codebase uses frozen dataclasses, strict catalog validation, a flat provider adapter package, and network-free mocked tests.
