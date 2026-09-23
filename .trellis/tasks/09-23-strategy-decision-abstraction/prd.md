# Decouple strategies from concrete decision implementations

## Goal

Give routing strategies one abstract decision-maker interface so strategy code
exposes no JEV or concrete decision-provider details. Vendor-specific strategy
names, kind identifiers, and reason prefixes are replaced outright rather than
kept as compatibility aliases.

## Background

The prior task (`09-23-provider-neutral-decisions`) extracted decision
transport into `jev_gateway/decision_provider/`, with a protocol registry,
normalized `DecisionResult`, ordered failover, and credentials resolved from
`api_key_env`. Configuration is canonical under `decision`, but legacy `jev`
is still accepted; this task removes that legacy path.

What remains coupled:

- `strategy/jev.py` and `strategy/matrix.py` import the concrete `DecisionClient`
  and take `DecisionSettings` (or a `DecisionClient`) in their constructors.
- `JevClassifier.refine()` calls `self.client.evaluate(...)`; `describe()` reads
  `self.client.settings.as_dict()` / `self.classifier.settings.as_dict()`.
- Vendor naming leaks into the strategy layer: `JevStrategy`, `JevClassifier`,
  `JevClient`, `JevMatrixStrategy`, kinds `jev` / `jev_matrix`,
  `describe()["type"]` values `"jev"` / `"jev_matrix"`, evidence prefixes
  `jev:<source>:<tier>` and `jev_matrix:<source>:<reason>`, and matrix validation
  error text.

Current reference points: `jev_gateway/strategy/contracts.py`,
`jev_gateway/strategy/jev.py`, `jev_gateway/strategy/matrix.py`,
`jev_gateway/strategy/registry.py`, `jev_gateway/decision_provider/__init__.py`.

## Decisions taken

- Scope is interface decoupling plus neutral strategy-layer naming. Gateway,
  record-store, and Python package identity (`X-JEV-Session-Id`,
  `jev-records.sqlite3`, `jev_gateway`) are out of scope.
- No compatibility aliases. Old Python names, the `jev` / `jev_matrix` kinds,
  the legacy top-level `jev` configuration key, and its `JevSettings` /
  `JevSource` / `jev_from_dict` helpers are removed, not deprecated. A catalog
  that still declares an old kind fails at startup with the existing
  unknown-kind error; one that declares the old `jev` key fails with the
  existing unknown-key error.
- `strategy/registry.py` remains the sole strategy-side composition point allowed
  to construct `DecisionClient`. Moving construction into `decision.py` or
  `gateway.py` is out of scope.
- The shipped `models.json` / `models.example.json` use the canonical
  `decision_matrix` kind.

## Requirements

- Canonical strategy implementations depend on one abstract decision-maker
  contract in `strategy/contracts.py`. Only `strategy/registry.py` may reference
  `DecisionSettings`, `DecisionProvider`, or `DecisionClient`.
- Asking for typed answers takes state, questions, and an optional strategy-owned
  answer validator, and returns either normalized typed answers with their source
  identity or nothing.
- Strategies can report whether decision making is active and can describe their
  decision configuration without reading provider settings directly.
- The classifier, the single-question strategy, the matrix strategy, their
  builder, their module path, their kinds, `describe()["type"]`, and the
  evidence/reason prefixes all use neutral names. No `Jev*` name and no `jev` /
  `jev_matrix` kind remains in the strategy layer.
- `catalog.py` exposes one configuration path only: canonical `decision`. The
  legacy `jev` top-level key, the `legacy` parameter of `decision_from_dict`, the
  `JevSettings` / `JevSource` dataclasses, `jev_from_dict`, and the `Catalog.jev`
  accessor are deleted. Legacy migration logic and its tests go with them.
- Routing behavior is unchanged: question construction, rule matching, fallback
  selection, local signal refinement, cached-session reuse, and manual-model
  bypass all keep their current semantics.
- Strategy descriptions keep exposing a `decision` object and must not expose
  resolved secrets.
- Documentation and the backend spec state the new canonical names and record
  the removed ones as breaking changes.

## Acceptance Criteria

- [ ] `strategy/contracts.py`, the classifier strategy module, and
      `strategy/matrix.py` import no concrete decision implementation and no
      `DecisionSettings` / `DecisionProvider` / `DecisionClient`.
- [ ] An abstract decision-maker contract exposes active state, a description, and
      a typed-answer request with an optional validator; the concrete client
      satisfies it structurally.
- [ ] Strategies are constructed only through the registry composition seam,
      which is the only place that builds a concrete decision implementation.
- [ ] Canonical names are `DecisionClassifier`, `DecisionStrategy`,
      `DecisionMatrixStrategy`, `build_decision_matrix_strategy`, and kinds
      `decision` / `decision_matrix`; descriptions report `type`
      `"decision"` / `"decision_matrix"`.
- [ ] Reason prefixes are `decision:<source>:<tier>` and
      `decision_matrix:<source>:<rule_N|default|fallback>`. No `jev:` or
      `jev_matrix:` prefix is produced anywhere in the strategy layer.
- [ ] No `Jev` symbol or legacy `jev_matrix` kind remains in
      `jev_gateway/strategy/`, and no `Jev*` strategy name is importable from
      `jev_gateway.strategy`.
- [ ] `models.json` and `models.example.json` declare `kind: "decision_matrix"`;
      a catalog declaring `kind: "jev_matrix"` fails registry construction with
      the unknown-kind error.
- [ ] A catalog declaring the legacy top-level `jev` key fails parsing, and
      `JevSettings`, `JevSource`, `jev_from_dict`, and `Catalog.jev` no longer
      exist.
- [ ] For `task_aware`, model, label, mode, and fallback decisions are unchanged;
      only the reason prefix and config kind spelling change.
- [ ] `docs/routing-design.md`, `docs/models-config.md`, both README mirrors,
      `.trellis/spec/backend/directory-structure.md`, and
      `.trellis/spec/backend/decision-providers.md` describe the canonical names
      and list the removed ones as breaking changes.
- [ ] `uv run pytest -q`, `uvx pyright`, and `uv build` pass.

## Out of scope

- Renaming the HTTP layer: `X-JEV-*` headers, `X-JEV-Reason`, session header.
- Renaming the SQLite record store or its default path.
- Renaming the `jev_gateway` package or `jev-gateway` entry point.
- Adding new answer types, new rules vocabulary, or new decision protocols.
- `RESERVED_STRATEGY_MODEL_NAMES` handling of the retired `jev-auto` name.
