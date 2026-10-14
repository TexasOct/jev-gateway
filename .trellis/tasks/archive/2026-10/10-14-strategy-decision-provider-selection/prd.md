# Strategy decision provider selection

## Goal

Let operators choose which configured decision provider handles decision requests for each strategy, from within that strategy’s workflow, without duplicating provider/model configuration.

## Background

- Decision providers are configured globally in `decision.providers`; each may have its own configured model.
- Strategies are independently represented in the workflow overlay. The operator confirmed that a strategy should select one existing decision provider and use that provider’s configured model.
- The main worktree contains unrelated uncommitted changes. Implementation and integration will stay in `/Users/texas/Workspace/jev-gateway-decision-selection` until a reviewed merge.

## Requirements

- In the strategy workflow, allow selecting one configured decision provider for that strategy.
- Decision requests made for that strategy must use the selected provider and its configured model. Existing behavior remains for strategies without a selection (backward-compatible default resolution).
- Persist only the minimal provider reference in the strategy workflow data; do not copy decision-provider credentials/configuration or model settings into strategy records.
- Validate provider references against configured decision providers; handle deletion or missing references safely and clearly.
- Keep other strategies and provider-owned configuration unchanged when a strategy selection is edited.

## Out of Scope

- Selecting or overriding a model independently of the selected provider’s configured model.
- Adding/editing decision providers or credentials in the strategy workflow.
- Changing policy rule semantics or the shape of decision-provider requests/responses.

## Acceptance Criteria

- [ ] An operator can select a configured decision provider in a strategy workflow and persist/reload that selection.
- [ ] A decision request for that strategy is sent through the selected provider using its configured model.
- [ ] An unconfigured/stale provider reference is rejected or handled by an explicit, non-silent safe fallback; unrelated strategies are unaffected.
- [ ] Existing strategy configurations without the new reference continue to load and behave compatibly.
- [ ] Tests cover storage shape/validation, workflow UI/API round-trip, and runtime provider/model selection.
- [ ] The change is verified in the isolated worktree, then merged into `main` without overwriting pre-existing main-worktree changes.

## Key Decisions

- One configured decision provider per strategy; runtime uses that provider’s configured model.
- The strategy stores only a provider ID reference. No duplicated credentials/configuration or separate model override.
- Existing workflows with no selected provider retain current resolution behavior.
- Work is isolated from the main checkout’s pre-existing changes and will be merged only after verification.
