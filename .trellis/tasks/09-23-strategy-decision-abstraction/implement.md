# Implementation plan: strategy decision abstraction

1. Remove the legacy catalog path: `JevSettings`, `JevSource`,
   `jev_from_dict`, `Catalog.jev`, the `DecisionSettings` legacy accessors,
   and the `legacy` parsing branch. Keep canonical decision parsing unchanged.
   Replace legacy-translation tests with a case asserting the old top-level
   `jev` key fails as unknown. Search for callers before editing.
2. Define `DecisionMaker` in `strategy/contracts.py` and add `enabled` plus a
   redacted `describe()` to `DecisionClient`. Preserve the existing
   `DecisionResult` shape and `evaluate(..., valid=...)` semantics. Test a
   non-HTTP fake decision maker, its structural compatibility, and the existing
   provider failover suite.
3. Rename `strategy/jev.py` to `strategy/classifier.py` and replace the public
   types with `DecisionClassifier` and `DecisionStrategy`, taking a
   `DecisionMaker`. Delete `JevClient`, `JevClassifier`, and `JevStrategy`. Use
   the `decision:` prefix for decision evidence. Update strategy tests to cover
   provider-backed labels, failover, cached mode, and configured fallback.
4. Move `jev_gateway/decision_provider/` to
   `jev_gateway/strategy/decision_provider/` with no compatibility shim. Update
   runtime imports, tests, docs, and package references. Keep protocol lookup lazy
   in catalog parsing, concrete client construction at the registry seam, and
   verify imports do not cycle.
5. Rename the matrix implementation to `DecisionMatrixStrategy`, move
   `build_decision_matrix_strategy` into `strategy/registry.py`, and remove
   `JevMatrixStrategy` and `build_jev_matrix_strategy` from `strategy/matrix.py`.
   Use `decision_matrix` in the description type, the reason prefix, and the
   validation messages. Update decision matrix tests for rule matching,
   malformed-answer failover, fallback, manual bypass, and cached continuation.
6. Register kinds `decision` and `decision_matrix` in `strategy/registry.py` and
   drop `jev` / `jev_matrix`. Update `strategy/__init__.py` exports. Update
   `tests/test_strategy_package.py` for the canonical module path and add a case
   proving an old kind now fails with the unknown-kind error. Change the kind in
   `models.json` and `models.example.json` to `decision_matrix`.
7. Delete `jev_gateway/signals.py` and remove its local detector/scoring
   behavior without replacement. Remove `ScoringPolicy`, `RequestSignals`,
   top-level `signals`, policy `scoring`, label `score`, and the local-only
   escalation/reasoning triggers from catalog models, parsing/serialization,
   shipped configs, responses, tests, and docs. Preserve structural request
   facts needed for external decision questions, capability/context/output
   checks, session IDs, and request records. Decision/preview responses omit
   `signals`; new decision rows store `{}` in existing `signals_json`.
8. Update `docs/routing-design.md`, `docs/models-config.md`, both README
   mirrors, and `.trellis/spec/backend/directory-structure.md` plus
   `decision-providers.md`: canonical names, the registry injection boundary,
   the reason-prefix change, and the removed strategy kinds, Python names, and
   catalog legacy aliases as breaking changes.
9. Run the focused suite (update test targets after removing signal-only tests),
   then `uv run pytest -q`, `uvx pyright`, and `uv build`. Confirm there are no
   runtime/test imports of `jev_gateway.signals` or `jev_gateway.decision_provider`,
   and no local scoring configuration remains. Review the diff for accidental
   gateway header changes, leaked secrets, or edited deployment endpoints, and
   leave unrelated uncommitted Trellis work untouched.



## Review and rollback points

- After step 2, confirm the abstract contract is satisfiable without concrete
  provider settings and that provider failover tests still pass.
- After step 6, run the strategy-focused suite before touching docs. A failure
  in `task_aware` model, label, mode, or fallback selection is a blocker.
- No persistent-data migration is required. Revert the rename, factory mapping,
  and shipped kind together if the full suite fails.
