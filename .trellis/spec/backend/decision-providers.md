# Decision-provider contracts

## 1. Scope / trigger

Use this contract when changing decision-engine configuration, adding a decision protocol, or changing the behavior of typed answers before routing. Decision providers classify requests; `providers[]` in the model catalog serves chat completions through LiteLLM and is a separate concern.

## 2. Signatures

- `catalog_from_document(document, source) -> Catalog` parses canonical `decision` or legacy `jev` at startup/reload.
- `decision_from_dict(value, source, *, legacy=False) -> DecisionSettings` validates static settings and translates legacy keys once.
- `registered_protocols() -> tuple[str, ...]` lists the adapter registry's supported protocol identifiers.
- `DecisionAdapter.evaluate(provider, api_key, timeout_seconds, state, questions) -> DecisionResult | None` owns one protocol's request and response handling.
- `DecisionClient.evaluate(state, questions, *, valid=None) -> DecisionResult | None` owns ordered failover and calls a strategy-specific answer validator before accepting a result.

## 3. Contracts

Canonical `models.json` uses `decision: {enabled, default_provider, timeout_seconds, providers}`. Each `providers[]` entry has `id`, explicit `protocol`, full `api_base` request URL, `api_key_env`, and optional `model`. Initially only `protocol: "system_one"` is registered. Omitted `model` is `None` and is omitted from the outgoing request; no vendor model is inferred. Credentials are read through the declared environment-variable name at call time. `DecisionProvider.as_dict()` exposes only `api_key_env` and `has_api_key`, never the resolved secret.

`DecisionResult` contains the provider ID and normalized typed-choice answers. The System One adapter sends `state` and `questions`, plus `model` only when configured, and accepts an `answers` object whose entries contain string `choice` values. The strategy checks required question names and allowed criteria before using the result. `jev_matrix` currently has no score or boolean rule vocabulary.

Legacy top-level `jev` with `sources` and `default_source` is accepted only when `decision` is absent. Its missing source model retains the historical `typesafe/jev-1.13` effective default. Legacy Python names are compatibility interfaces, while strategy descriptions and routing snapshots serialize canonical `decision` terminology.

## 4. Validation & error matrix

| Input or failure | Required behavior |
| --- | --- |
| Both `decision` and `jev` top-level keys | Reject ambiguous configuration before startup/reload state replacement. |
| Missing or unsupported canonical protocol, duplicate provider ID, unknown key, invalid timeout/default provider | Raise a descriptive static configuration error. |
| Missing `api_key_env` value at runtime | Skip that provider and try the next one. |
| HTTP error, invalid JSON, malformed typed answer, or strategy-invalid choice | Try the next provider; return `None` if exhausted. |
| No accepted decision result | Preserve the classifier's local signals or use the matrix's configured fallback. |
| Manual model or cached matrix continuation | Do not call the decision provider. |

## 5. Good / base / bad cases

- Good: a valid typed-choice response from the preferred provider becomes a `DecisionResult`; the matrix matches its first applicable local rule.
- Base: an unavailable first provider leads to the second provider, then the existing local fallback if all fail.
- Bad: a provider returning an out-of-criteria choice must not be accepted or choose a model ID directly; the next provider gets a chance.

## 6. Tests required

- In `tests/test_catalog.py`, assert canonical parsing without a model default, legacy model-default preservation, ambiguous-key rejection, protocol validation, and secret-free `as_dict()`/snapshot output.
- In `tests/test_decision_provider.py`, assert outgoing payload and bearer header, successful normalization, preferred order, transport failure, malformed answers, missing credentials, and exhausted failover.
- In `tests/test_jev_matrix.py` and `tests/test_jev_strategy.py`, assert label mapping, local fallback, cached-session reuse, and manual-model bypass. Tests mock HTTP; no external decision API calls.
- Run `uv run pytest -q`, `uvx pyright`, and `uv build` after integration changes.

## 7. Wrong vs correct

Wrong: add a provider-specific response branch inside `strategy/matrix.py`, or give every canonical provider a fixed vendor model default. Correct: implement and register a `DecisionAdapter`, normalize its output to `DecisionResult`, validate the protocol in `catalog.py`, and require explicit model selection when an endpoint needs one.
