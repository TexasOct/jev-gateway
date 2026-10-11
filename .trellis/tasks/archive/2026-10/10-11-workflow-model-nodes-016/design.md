# Design and ownership

Current management imports require all runtime fields although the catalog parser already accepts omissions. The model seam will validate only fields supplied, persist omissions, and expose unknown values accurately in management/editing. Catalog backward-compatible routing defaults remain distinct from stored factual metadata.

The runtime registry already supports named decision-matrix strategies. The current management endpoint is fixed to `task_aware`, and both policy overlay and layout sidecars hold one strategy. Extend these existing owners with versioned multi-strategy storage rather than moving supplier records or credentials into routing configuration.

## Strategy state

- Use a strict v2 routing sidecar with per-name workflow definitions/overrides, explicit ordered `selected_models`, and deletions of baseline strategies. Carry existing v1 global model overrides only for compatibility. Existing baseline bytes remain unchanged by routing APIs.
- Load v1 unchanged. On migration preserve its questions, rules, fallback, model overrides and other baseline strategy definitions. Seed absent selections from models referenced by reachable rules/default/fallback pools, including explicit lists or matching tags and a genuinely referenced default edge. Unreferenced catalog models stay outside the graph.
- A v2 strategy definition uses the actual catalog/registry schema for named `decision_matrix` policies. New strategies start with a valid editable empty workflow and no selected models. Their routing path reports the existing unavailable/setup error until configured; it must not escape the selected set via the global default model.
- Keep the runtime default safe during deletion. Reject deleting it and expose the reason; this UI switches the edited strategy, not the global runtime default. Reject unknown, duplicate, empty, reserved and catalog-conflicting names through existing catalog validation.
- Restrict every runtime pool/default/fallback candidate path to selected models when selection is explicit. Legacy absence retains old runtime behavior until management seeds/saves selection. Disabled models remain ineligible. Explicit empty means empty, not all models.
- Connections and pool membership become strategy-local explicit references. New edits must not mutate global supplier tags or another strategy's membership. Legacy tags still seed memberships, and v1 global tag/priority overrides remain readable.
- Removing a node removes its selected ID and pool references, preserves other strategy state and supplier identity, and leaves incomplete draft edges visibly repairable where appropriate. Supplier deletion must reconcile the new selected references through the existing protected transaction owner.

## APIs and drafts

- Add an optional strategy selector to configuration read/validate/apply/reset and layout read/write. Calls without a selector retain the legacy default. Preserve existing auth, write availability, reload locking, rollback and error envelopes.
- Add named editable strategy listing/create/delete through routing-owned endpoints. Baseline and provider/credential fields remain unreachable from these bodies. Exact v2 shape should reuse actual catalog validators and atomic helpers; document it before delivery.
- Keep the configuration model library available for choosing nodes; graph/draft projection filters by the strategy's explicit IDs. API types may add optional fields for compatibility with existing callers/fixtures, but the live backend emits the complete new management metadata.
- Store canvas positions/viewport by strategy in the existing sidecar with a versioned migration. Policy and layout remain independently owned. Switching uses independent draft/history/layout initialization and request identities; capture the strategy when sending writes, settle/block pending work, and ignore stale responses.
- Existing shared supplier ModelDialog remains the global model-editing owner; importing/removing a workflow node has no provider/credential write.

## UI

Top-left controls select/create/delete a workflow strategy; use a real native select and accessible buttons/dialogs. Provide a model chooser sourced from imported supplier models. Selected nodes support the existing shared model dialog, selection, connection editing and local removal.

Remove the old heading/help/source/version/status copy, canvas-info section, advanced editor and footer container. Put actions in a compact bottom-right floating panel; preserve review-before-commit, reset confirmation, errors/recovery, readonly/pending reasons, undo/redo and fit/pan/select controls. Node inspectors remain available. Use existing shared shadcn controls, semantic palette and locales.

## Boundaries

This is multi-seam work: model import, strategy state and workflow interaction have separate child owners and gates. They run sequentially in the same checkout so shared API/spec/locale files have one writer at a time. Each writer delivers a source/diff-bound report before a fresh independent review. The integration owner starts only after those handoffs and owns validation/limited evidenced reconciliation, not another broad implementation.

No dependency/framework replacement, OS popup workaround, credential simplification, unrelated Monitoring redesign or operator runtime mutation is included. Old E1/manual and public-install acceptance reports remain historical.
