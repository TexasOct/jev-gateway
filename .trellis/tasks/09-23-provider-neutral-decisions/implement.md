# Implementation plan

1. Add provider-neutral immutable decision settings and provider values to the catalog model; parse canonical `decision`, translate legacy `jev`, and reject both keys together.
2. Introduce a provider-neutral decision protocol contract, normalized result, adapter registry, and the initial `system_one` adapter. Preserve source ordering, preferred provider behavior, timeout, bearer auth, and safe failure continuation.
3. Refactor strategy construction and decision execution to use the generic settings/client while preserving compatibility exports or wrappers for existing imports.
4. Update `models.json`, `models.example.json`, strategy description serialization, English and Chinese user docs, and config examples to the canonical generic key and explicit protocol. Do not add vendor-specific example values.
5. Add tests for canonical parsing/serialization, legacy migration/default behavior, ambiguity rejection, unsupported protocol validation, adapter protocol calls, failover on network and invalid answers, local fallback, cached/manual bypass, and secret redaction.
6. Run focused catalog and strategy tests, then the full test suite, Pyright, and package build.

## Validation

```bash
uv run pytest -q tests/test_catalog.py tests/test_jev_strategy.py tests/test_jev_matrix.py tests/test_routing_strategies.py
uv run pytest -q
uvx pyright
uv build
```

## Review gates

- Verify old `jev` configuration still constructs the same classifier and sends the same effective model value.
- Verify canonical configuration never receives a vendor-specific model default.
- Verify failures and secret values do not leak through descriptions, errors, or logs.
- Search shipped docs/config for stale references to the old top-level configuration name; retain references only where documenting the deprecated migration alias.
- Confirm no vendor-specific example name or configuration appears in code, tests, docs, or examples.
