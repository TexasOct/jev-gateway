# Decision-provider contracts

## 1. Scope / trigger

Use this contract when changing decision-engine configuration, adding a decision protocol, or changing the behavior of typed answers before routing. Decision providers answer typed routing questions; `providers[]` in the model catalog serves chat completions through LiteLLM and is a separate concern.

## 2. Signatures

- `catalog_from_document(document, source) -> Catalog` parses canonical `decision` at startup/reload and rejects unknown top-level keys, including `jev`.
- `decision_from_dict(value, source) -> DecisionSettings` validates canonical static settings.
- `registered_protocols() -> tuple[str, ...]` lists the adapter registry's supported protocol identifiers.
- `DecisionAdapter.evaluate(provider, api_key, timeout_seconds, state, questions) -> DecisionResult | None` in `jev_gateway/strategy/decision_provider/base.py` owns one protocol's request and response handling.
- `DecisionMaker.evaluate(state, questions, *, valid=None) -> DecisionResult | None` is the strategy-facing protocol; it also exposes `enabled` and a safe `describe() -> dict[str, Any]`. A fake decision maker can satisfy this contract without provider settings.
- `DecisionClient.evaluate(state, questions, *, valid=None) -> DecisionResult | None` implements the protocol, owns ordered failover, and calls a strategy-specific answer validator before accepting a result. Only `strategy/registry.py` constructs it for strategies.

## 3. Contracts

Decision protocol contracts and adapters live in `jev_gateway/strategy/decision_provider/`; the former `jev_gateway/decision_provider/` Python import path has been removed. Keep protocol discovery lazy from catalog validation to avoid package initialization cycles.

Canonical `models.json` uses `decision: {enabled, default_provider, timeout_seconds, providers}`. Each `providers[]` entry has `id`, explicit `protocol`, full `api_base` request URL, `api_key_env`, and optional `model`. Initially only `protocol: "system_one"` is registered. Omitted `model` is `None` and is omitted from the outgoing request; no vendor model is inferred. Credentials are read through the declared environment-variable name at call time. `DecisionProvider.as_dict()` exposes only `api_key_env` and `has_api_key`, never the resolved secret.

`DecisionResult` contains the provider ID and normalized typed-choice answers. The System One adapter sends `state` and `questions`, plus `model` only when configured, and accepts an `answers` object whose entries contain string `choice` values. The strategy checks required question names and allowed criteria before using the result. `decision_matrix` currently has no score or boolean rule vocabulary.

The old top-level `jev` key and its Python helpers `JevSettings`, `JevSource`, `jev_from_dict`, and `Catalog.jev` have been removed. Migrate to `decision`, replacing `sources` with `providers`, `default_source` with `default_provider`, and supplying each provider's explicit `protocol`. Legacy endpoints that relied on an implicit model also need an explicit `model`; the canonical schema does not infer one. The old strategy kinds `jev` and `jev_matrix` are replaced by `decision` and `decision_matrix`, with no aliases. `JevClient`, `JevClassifier`, `JevStrategy`, `JevMatrixStrategy`, and `DecisionSettings.default_source` / `.sources` are removed as well. Strategy descriptions and routing snapshots serialize canonical `decision` terminology.

## 4. Validation & error matrix

| Input or failure | Required behavior |
| --- | --- |
| Legacy `jev` top-level key (alone or alongside `decision`) | Reject as an unknown key before startup/reload state replacement. |
| Missing or unsupported canonical protocol, duplicate provider ID, unknown key, invalid timeout/default provider | Raise a descriptive static configuration error. |
| Missing `api_key_env` value at runtime | Skip that provider and try the next one. |
| HTTP error, invalid JSON, malformed typed answer, or strategy-invalid choice | Try the next provider; return `None` if exhausted. |
| No accepted decision result | Use the first-label classifier fallback or the matrix's configured fallback; when its label is omitted, the matrix also uses the first label. |
| Removed `jev` or `jev_matrix` strategy kind | Reject at registry construction as an unknown kind, before replacing live state. |
| Manual model or cached matrix continuation | Do not call the decision provider. |

## 5. Good / base / bad cases

- Good: a valid typed-choice response from the preferred provider becomes a `DecisionResult`; the matrix matches its first applicable local rule.
- Base: an unavailable first provider leads to the second provider, then the deterministic configured fallback if all fail.
- Bad: a provider returning an out-of-criteria choice must not be accepted or choose a model ID directly; the next provider gets a chance.
- Wrong: import `DecisionClient` in `strategy/classifier.py` or `strategy/matrix.py`. Correct: inject `DecisionMaker` there and construct the client only in `strategy/registry.py`.

## 6. Tests required

- In `tests/test_catalog.py`, assert canonical parsing without a model default, rejection of the removed `jev` key, protocol validation, and secret-free `as_dict()`/snapshot output.
- In `tests/test_decision_provider.py`, assert outgoing payload and bearer header, successful normalization, preferred order, transport failure, malformed answers, missing credentials, and exhausted failover.
- In `tests/test_decision_matrix.py` and `tests/test_decision_strategy.py`, assert label mapping, deterministic fallback, cached-session reuse, and manual-model bypass. Tests mock HTTP; no external decision API calls.
- Run `uv run pytest -q`, `uvx pyright`, and `uv build` after integration changes.

## 7. Wrong vs correct

Wrong: add a provider-specific response branch inside `strategy/matrix.py`, or give every canonical provider a fixed vendor model default. Correct: implement and register a `DecisionAdapter`, normalize its output to `DecisionResult`, validate the protocol in `catalog.py`, and require explicit model selection when an endpoint needs one.
