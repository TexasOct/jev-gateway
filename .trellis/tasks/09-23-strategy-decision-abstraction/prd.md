# Decouple strategies from concrete decision implementations

## Goal

Keep routing strategies provider-neutral, remove the local request-signal
implementation and its configuration without replacement, and move the
provider implementation under the strategy package. Do not retain old Python
import paths or configuration aliases.

## Background

The existing task's provider-neutral names and decision-maker protocol are
already implemented in `jev_gateway/strategy/`. The current provider package
still lives at `jev_gateway/decision_provider/`; `catalog.py` imports its
protocol registry lazily. The current `jev_gateway/signals.py` supplies local
prompt detectors, scoring, `RequestSignals`, and generic message helpers.
`decision.py`, the strategies, `reasoning.py`, `gateway.py`, and `sessions.py`
consume parts of it. `signals_json` is a required SQLite column, while HTTP
decision and preview responses currently expose a `signals` object.

## Decisions taken

- Existing provider-neutral strategy naming is retained. The gateway response
  contract changes only to remove the `signals` object; the record store keeps
  its existing schema. HTTP header names, storage path, and `jev_gateway`
  package identity are unchanged.
- `jev_gateway/signals.py` is to be removed as part of this task. Its prompt
  detection, local scoring, and `RequestSignals` model will not be migrated or
  replaced. The user explicitly confirmed removing the related configuration
  options too. A future strategy-owned implementation is a separate task.
- No compatibility aliases. Old Python names, the `jev` / `jev_matrix` kinds,
  the legacy top-level `jev` configuration key, and its `JevSettings` /
  `JevSource` / `jev_from_dict` helpers are removed, not deprecated. The
  `decision_provider` package moves under `jev_gateway.strategy`; the old
  `jev_gateway.decision_provider` import path is removed without a shim. Old
  config keys and kinds fail with the existing strict unknown-key / unknown-kind
  errors.
- `strategy/registry.py` remains the sole strategy-side composition point allowed
  to construct `DecisionClient`. Moving construction into `decision.py` or
  `gateway.py` is out of scope.
- Provider protocol contracts, adapters, and client live under
  `jev_gateway/strategy/decision_provider/`. The strategy facade does not
  re-export the concrete client, and imports must avoid a catalog/strategy
  package initialization cycle.
- Shipped catalogs use the canonical `decision_matrix` kind. Decision and
  preview responses drop the `signals` object, while the required SQLite
  `signals_json` column stores `{}` for new decisions without migration.

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
- Decision-strategy behavior unrelated to local signals remains: question
  construction, rule matching, decision-provider labels, configured fallback,
  cached-session reuse, and manual-model bypass. Local prompt-pattern detection,
  scoring, and score/intent-triggered routing and reasoning behavior are removed.
- Remove top-level `signals`, policy `scoring`, label `score` thresholds, and
  configuration options whose only effect depends on local score or intent
  detectors. Remove these options from parsers, serialization, shipped catalogs,
  examples, docs, and tests; old keys should fail strict parsing rather than be
  silently ignored.
- Keep raw request facts needed for provider questions, capability/context/output
  checks, session identity, and inbound request recording. This is not a new
  local signal scorer or a strategy-owned replacement.
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
- [ ] Provider package files reside under `jev_gateway/strategy/decision_provider/`;
      no `jev_gateway.decision_provider` package or compatibility shim remains.
      Imports and tests use the new path without circular initialization.
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
- [ ] For `task_aware`, provider-backed model, label, mode, and configured
      fallback decisions remain valid. Prompt-derived label/score/intent
      decisions intentionally change because the local detectors are removed.
- [ ] `docs/routing-design.md`, `docs/models-config.md`, both README mirrors,
      `.trellis/spec/backend/directory-structure.md`, and
      `.trellis/spec/backend/decision-providers.md` describe the canonical names
      and list the removed ones as breaking changes.
- [ ] `jev_gateway/signals.py` is deleted and no runtime/test imports of
      `jev_gateway.signals` remain.
- [ ] Shipped catalogs and strict parsers expose no `signals`, `scoring`, or
      label `score` config; obsolete local detector/scoring triggers under
      `policy.escalation` and `policy.reasoning` are absent. Unknown removed keys
      fail validation.
- [ ] Structural request facts still enforce model capability, context, and
      output constraints; decision providers still receive the request text and
      configured fallback remains deterministic.
- [ ] Existing tests and documentation reflect removed signal behavior and
      configuration. No replacement prompt scorer or intent detector is added.
- [ ] Decision and preview responses no longer expose a `signals` object. The
      required SQLite `signals_json` column remains and stores `{}` for new
      decisions; no database migration is introduced.
- [ ] `uv run pytest -q`, `uvx pyright`, and `uv build` pass.

## Out of scope

- Renaming the HTTP layer: `X-JEV-*` headers, `X-JEV-Reason`, session header.
- Renaming the SQLite record store or its default path.
- Renaming the `jev_gateway` package or `jev-gateway` entry point.
- Replacing the removed request-signal extraction or local scoring functionality;
  its future owner and behavior are deferred.
- Adding new answer types, new rules vocabulary, or new decision protocols.
- `RESERVED_STRATEGY_MODEL_NAMES` handling of the retired `jev-auto` name.
