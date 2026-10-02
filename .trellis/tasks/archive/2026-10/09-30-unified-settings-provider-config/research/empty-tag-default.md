# Empty-tag global default routing

This is the first routing implementation report. Later rework refined its
literal-`default` and reasoning behavior: explicit `defaulted` source distinguishes
global fallback from a configured label, and global reasoning always uses the
policy fallback before clamping. See `backend-source-stream-rework.md` and the
current initialization spec for that contract. The 238-test count below covers
this earlier synthetic snapshot; current full gates are in `post-rework-gates.md`.

The user's clarification makes the global default authoritative for every
strategy. Per-strategy defaults are deferred. The implementation consumes
`Catalog.defaults.default_model`, supplied by the separate global configuration
work. It adds no strategy override fields or record migration.

`PolicyStrategy._default_model()` resolves the configured canonical model ID
exactly. An empty matched label pool, or a selection request for the reserved
`default` result, uses that model without applying strategy selection, matrix
fallback selection, capability widening, exclusions or context relaxation. If
the global default is unset, the strategy raises `SetupIncompleteError` and the
existing HTTP mapping returns `503 setup_incomplete` before generation. Assigned
label pools still route without a global default, and their existing capability
widening and manual override behavior is preserved.

The final label is `default`, even when the selected model belongs to another
label. Initial reasons contain `empty_tag_default`; fresh continuation reasons
append that evidence. Matrix results preserve their matched rule prefix.
Sticky, cached and escalate sessions recognize the default marker. Fresh mode
can change the final label without changing the model. The global marker has no
strategy label rank, so escalation starts at rank zero and visits the existing
ordered labels. Selection requests for `default` resolve the global model
without indexing a missing label. A default-labelled pin retains its ordinary
`session_pinned` or `session_sticky` reason.

`SetupIncompleteError` now lives in `strategy/contracts.py` and is exported by
the strategy facade. `decision.py` imports and re-exports the same class, keeping
the existing gateway and caller imports valid. Its no-model guards are retained.

Default reasoning uses the existing reasoning policy contract: when no
configured label supplies an effort for `default`, use `reasoning.fallback` and
clamp it to the selected model's declared ladder. Tests cover an accepted medium
fallback, upward clamping to high, and an undeclared ladder. No reasoning contract
change was needed.

## Verification

The final focused run passed 238 tests:

```bash
uv run pytest -q tests/test_empty_tag_default.py tests/test_custom_labels.py tests/test_decision_matrix.py tests/test_decision_strategy.py tests/test_routing_strategies.py tests/test_gateway.py tests/test_task_aware_matrix.py tests/test_setup.py::test_empty_generation_and_preview_never_reach_upstream
```

The new synthetic cases prove that policy, quality, economy, classifier and
matrix strategies inherit the global model. Unequal costs and qualities, distinct
first pools, a populated matrix fallback and a model tagged elsewhere prevent
accidental catalog ordering or per-strategy fallback from satisfying the tests.
Both implicit scoped tags and custom tags are covered. Other cases verify exact
global selection despite a capability mismatch, controlled failure when the
global default is omitted or null, default continuation and escalation, and a
fresh matrix changing to default while retaining its model and rule evidence.

An ASGI test with a fake completion provider verifies default in preview, route
headers, logged decisions, session snapshots and events, live session listings,
and retained SQLite decision evidence. Preview makes no generation call and
creates no session. Another ASGI test verifies empty matched pools without a
global default return 503 and make no generation call. The existing no-model
test verifies the catalog guard still prevents upstream execution.

The focused type check reported zero errors, warnings or informational findings:

```bash
uvx pyright jev_gateway/strategy jev_gateway/decision.py tests/test_empty_tag_default.py tests/test_custom_labels.py tests/test_decision_matrix.py
```

The scoped `git diff --check` passed. These checks used synthetic fixture
documents and fake providers. Full regression, setup-readiness integration,
frontend localization, installed-wheel acceptance and publication belong to the
parent's remaining verification. This agent did not commit or publish.
