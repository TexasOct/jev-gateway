# Design

Own ModelManagementView, ProviderModels, ModelFields, model helpers, useProviderManagement additions, reusable shared Dialog and model browser/unit tests. Parent owns AppShell/App integration. Expose `ModelManagementView({manager, t, providerId?, onProviderChange?})` with selectable saved supplier and existing-model list/import surface. Reuse existing manager/API without independent configuration writes.

Consume Contracts' `update_model`, optional display_name/enabled/cache cost types and connection API without editing shared types/client. Legacy existing record values remain editable but must never be mislabeled as source-verified; persisted manual metadata controls refresh precedence. Preserve old fetched evidence on failed/unknown refresh, expose conflicts and explicit restore-auto diffs. Native modal owns focus trapping/restoration; parent owns discard prompts and navigation guard. No nested modal in the base flow.

## Latest supplier-owned presentation

Production mounts the model list under each saved LLM supplier, bound to its provider ID. Reuse the workspace component in embedded mode without a provider selector, page title or View details action. Each configured model has one Edit button opening the existing record Dialog. Keep discovery and batch import mounted inside a disclosed section so collapsing it preserves drafts. App owns four destinations and no model-specific navigation state. Supplier controls consult the shared unsaved-change registry before unmounting model groups. Latest-query ownership must identify the initiating selector even when discovery fails before a source response exists.
