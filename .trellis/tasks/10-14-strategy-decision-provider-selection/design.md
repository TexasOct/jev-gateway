# Design: per-strategy decision provider selection

## Boundary

The behavior gap is that decision provider resolution is currently global/catalog-owned, while workflows already persist per-strategy definitions in `routing-overrides.json`. Add one optional provider ID reference to each strategy definition and thread the resolved strategy context into decision execution. Render selection in the existing strategy workflow controls. Do not duplicate provider configuration or change LLM routing/model selection.

## Data flow and contracts

1. The configuration response exposes configured decision-provider IDs and display-safe metadata needed by the workflow selector (never credentials).
2. A workflow draft may hold an optional selected decision-provider ID. Its v2 persistence stores only that ID in the strategy definition; absent remains compatible with legacy data.
3. Validation checks the ID against the active catalog's decision providers before persistence/activation. No provider selection means current default resolution.
4. At request time, strategy execution resolves the selected ID to the already configured decision-provider object, which supplies protocol, endpoint, credential environment name and configured model.
5. Editing one strategy replaces only that strategy's workflow record. Provider configuration writes remain owned by provider configuration.

## Change boundary (confirmed against existing contracts)

The smallest behavior gap is global decision provider resolution where decision selection actually runs. The runtime resolver belongs in `jev_gateway/strategy/registry.py`, while the workflow record belongs in the v2 routing overlay. The frontend already owns per-strategy drafts and controls.

Expected owners:

- `jev_gateway/routing_overlay.py`: permit the optional strategy provider reference in the v2 definition and validate/merge it without changing provider-owned configuration.
- `jev_gateway/gateway.py` and configuration projection: provide credential-free provider choices and validate against the current catalog before activation.
- `jev_gateway/strategy/registry.py` and decision-provider client boundary: create per-strategy provider resolution while retaining configured model and immutable request ownership.
- `frontend/src/shared/api/types.ts`, routing draft/model and `RoutingEditor` workflow controls: typed state, serialization and localized selector.
- Existing routing overlay, decision-provider/strategy, gateway and workflow UI tests: compatibility, isolation, runtime selection/model and UI round-trip.

Explicitly excluded: SQLite/database changes, baseline `models.json` writes, provider management/credential editing, selection of LLM models, and unrelated canvas changes. Runtime selection must not mutate shared catalog/provider state across concurrent requests.

## Compatibility and safety

- Keep the workflow storage version unchanged if the optional field can be added compatibly; absent field is the legacy behavior. Avoid adding it to baseline `models.json` or provider-owned settings.
- Never expose secrets in API projections or persist provider credentials.
- A stale/missing reference must not silently route to a different provider; validation should block saving and runtime should fail safely or use only the explicitly defined legacy no-selection resolution.
- Provider deletion/config changes must not mutate unrelated strategy entries.

## Integration reconciliation

Retain the independent global enable/disable control from the runtime diagnosis
task. Selecting a supplier is not consent to enable external calls. A strategy
selection is exclusive; global default-provider preference keeps legacy ordered
failover. Clear selection by omitting the key from the complete replacement
definition, including when the opened definition had a provider. Legacy null
decision settings remain valid for unselected workflows. These boundaries have
red-first regression coverage before integration.

## Risks / rollback

The runtime decision-provider factory may currently be built once from global catalog state; strategy scoping must not leak between concurrent requests. Keep the selected ID on immutable per-strategy runtime objects/request context, not mutable shared provider state. Rollback consists of removing the optional workflow field and its UI/runtime plumbing; legacy records remain valid.
