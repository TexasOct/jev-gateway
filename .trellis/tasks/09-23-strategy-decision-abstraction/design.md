# Design: abstract decision maker for routing strategies

## Boundary

`jev_gateway/strategy/contracts.py` defines `DecisionMaker`, a structural
`Protocol` for decision-backed strategies. Its `evaluate(state, questions,
*, valid=None)` operation returns `DecisionResult | None`, where
`DecisionResult` is the existing normalized, provider-neutral result type in
`decision_provider/base.py`. It also exposes `enabled: bool` and
`describe() -> dict[str, Any]`. Strategy implementations use only this contract,
not `DecisionClient`, `DecisionSettings`, adapters, protocol names, credentials,
or wire responses.

`DecisionClient` gains `enabled` and `describe()` by delegating to its settings.
`describe()` returns the existing redacted `settings.as_dict()` shape. Failover,
credential lookup, timeout, and per-provider answer validation stay inside
`decision_provider/`, unchanged.

`strategy/registry.py` is the sole strategy composition point. Its factories
create `DecisionClient(catalog.decision)` and pass it to `DecisionClassifier` /
`DecisionMatrixStrategy`. The registry still accepts custom two-argument
`StrategyFactory` values. `auto` resolves to the decision strategy when decision
providers are configured and to `PolicyStrategy` otherwise, using the existing
configured-provider test rather than `enabled`; `policy` is unchanged.

## Canonical names

`strategy/jev.py` is renamed to `strategy/classifier.py` and holds
`DecisionClassifier` and `DecisionStrategy`. `DecisionClassifier` takes a
`DecisionMaker`. `JevClient`, `JevClassifier`, and `JevStrategy` are deleted;
their tuple-returning adapter has no remaining caller once the strategy layer
stops using it.

`strategy/matrix.py` defines `DecisionMatrixStrategy`, which takes a
`DecisionMaker`. The builder `build_decision_matrix_strategy` moves into
`strategy/registry.py`, where construction belongs, so the matrix module has no
concrete implementation import and no builder that would need one.

Kinds `decision` and `decision_matrix` are registered in place of `jev` and
`jev_matrix`. An old kind now raises the existing unknown-kind error at
`StrategyRegistry.from_catalog`, before live state is replaced.

`strategy/__init__.py` exports only the canonical names. `models.json` and
`models.example.json` declare `kind: "decision_matrix"`.

Reason text changes to `decision:<provider>:<label>` for classification and
`decision_matrix:<provider|local>:<rule_N|default|fallback>` for matrix
selection, and `describe()["type"]` becomes `decision` or `decision_matrix`.
Matrix validation errors use `decision_matrix` terminology. This is an
intentional, observable change to the `X-JEV-Reason` value and to recorded
evidence; the HTTP header name is unchanged. Nothing in the repository parses
the old prefix, so no reader needs updating.

The `decision` field in a strategy description stays the existing redacted
settings object. The `DecisionMaker` contract lets a custom implementation
supply its own safe description. Question schema and answer checks stay owned
by the classifier and the matrix strategy, and the `valid` callback still drives
provider failover.

## Catalog migration

`catalog.py` accepts only the canonical top-level `decision` key. Remove the
legacy-aware branch in `catalog_from_document`, the `legacy` parameter and
translation logic in `decision_from_dict`, and `jev_from_dict`. Delete
`JevSettings`, `JevSource`, and `Catalog.jev` rather than leaving forwarding
aliases. `DecisionSettings.default_source` and `.sources` are legacy Python
accessors and are removed as well. Existing catalog unknown-key validation
rejects a top-level `jev` before live state replacement. The canonical parser
still requires explicit provider protocol and leaves `model` absent by default;
no vendor model is injected. Update tests to assert rejection rather than
translation.

## Migration and rollback

This is a breaking change for catalogs and Python callers that use the old
names. The shipped catalog is updated in the same change, so the repository's
own deployment is unaffected. Third-party catalogs declaring `kind: "jev"` or
`kind: "jev_matrix"` must be updated; they now fail fast at startup with the
unknown-kind error rather than routing differently. Catalogs with the legacy
top-level `jev` key must replace it with `decision` (using `providers`,
`default_provider`, and explicit `protocol`), or parsing fails as an unknown
key. `JevSettings`, `JevSource`, `jev_from_dict`, `Catalog.jev`, and
`DecisionSettings`' legacy accessors are gone.

Rollback is a revert of the rename, the factory mapping, the shipped kind, and
the docs. No persistent-data migration is involved, so a rollback needs no
database work. Evidence written under the new reason prefix stays valid because
the prefix is descriptive text, not a parsed key.

## Trade-offs

Removing the compatibility names keeps the strategy layer free of vendor
vocabulary and avoids carrying two names per concept. The cost is a one-time
breaking change for existing configuration.

Keeping concrete construction in `strategy/registry.py` leaves one deliberate
`DecisionClient` import inside the package. Moving it to `decision.py` or
`gateway.py` would broaden the engine's responsibility and change the registry
factory contract without improving isolation of the strategy algorithms.

Deleting `JevClient` removes a public name. Its tuple return value was already
superseded by `DecisionResult`, and nothing inside the repository calls it.
