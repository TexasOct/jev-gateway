# Current problems and target ownership

| Module | Current problem | Target interaction and layout |
| --- | --- | --- |
| Settings | GatewayCredentialForm exists but is not mounted in the readable working tree; Settings only shows appearance/default model. | Access and security section uses existing gateway mutation, presence and bootstrap flags. Explain immediate rotation and Dashboard's shared Bearer. |
| Workflow | Strong native canvas foundation, but no context menus, selected deletion or history. Inspector/advanced controls are fragmented. | Unscaled contextual menu, semantic add/delete commands, bounded draft/layout history, status information and one grouped inspector. |
| Suppliers | Current staged ProviderView is an extensive form redesign; IDs, env references and branding still occupy ordinary fields. | Preserve this baseline. Preset/method selection, display name/address/API key, generated identity, credential keep/replace/clear and disclosed compatibility options. |
| Models | Import-only inline fields and manual confirmation; no existing-model edit operation or task-focused page. | Model workspace with list/import preview and one scrollable accessible model Dialog. Discovery chains to metadata; previews show per-item evidence state. |
| Metadata | Existing Models.dev/OpenRouter/LiteLLM/native evidence supports exact matching, conflict and unknown values. Runtime model transactions only import. | Extend existing owner with atomic update_model and optional cache-price/model display/enabled fields. Retain strict import confirmation and serving applicability. |

# Contracts and boundaries

The existing `ProviderConfiguration.command` transaction remains the sole baseline writer. Add `{action: "update_model", model_id: "provider/upstream_model", model: ImportModel}`. A model edit replaces the complete validated record atomically, preserves its provider and qualified identity, and retains tags/priority/quality and source evidence unless explicitly edited. Existing models expose a read-only upstream identity if changing it would break references. New imports still require explicit runtime prices, capability booleans and confirmed limit decisions. Unknown import fields remain pending, with per-field explanations.

Optional model fields: `display_name: string|null`, `enabled: boolean` (legacy omission means true), and `cost.cache_read_per_million` / `cost.cache_write_per_million` (optional nullable USD/M tokens). Disabled models remain manageable but cannot be selected by normal, explicit, default or pinned routing. Changes must be traced through parsing, projection, strategy selection and tests. Cache fields extend evidence names, preserve absent/unknown versus zero and retain conditional prices; request cost estimation keeps its established input/output meaning.

Add authenticated nonmutating `POST /v1/provider-connection-test`, accepting the existing LLM `ProviderSelector`. Return `{provider_id, status, scope: "model_listing", model_count, warnings}`. `status` is `success|authentication_error|address_error|network_error|unsupported|incomplete`. It exercises the model-list endpoint using the discovery service's bounded, validated network boundary and states that this does not establish generation availability. Decision-only connections may provide explicit configuration-only validation if their protocol has no safe listing probe. Never send credentials to public metadata sources.

Native cloud setup also needs direct transport credential entry. Extend LLM `upsert` and candidate selectors with optional `transport_credentials`, mapping a declared `param_env` parameter to an existing `keep|set|clear` credential action. The UI generates missing stable references and preserves existing ones. Mutations use the same protected credential store, revision, immutable snapshot and rollback transaction. Sharing checks exclude exactly the edited transport binding and retain every other consumer, including the same supplier's primary key or another parameter; recheck the complete candidate after all operations. Safe supplier projections add optional `transport_credential_presence` booleans keyed by parameter. No response contains values. Candidate tests apply these actions only in memory. Vertex service-account credentials and Bedrock access ID/secret/session token receive ordinary direct controls; server/default authentication and existing-reference compatibility remain explained choices.

The contract worktree owns `frontend/src/shared/api/types.ts` and `client.ts`. The supplier worktree consumes the connection-test types/API and may leave compilation to integration if that contract is absent in its isolated base. The model worktree owns `ModelManagementView`, `ProviderModels`, `ModelFields`, pure draft helpers, configuration manager additions and the reusable Dialog. The parent wires a distinct models navigation destination and passes the selected supplier context.

Dialog uses native modal semantics with controlled open state, Escape/outside close callbacks, focus restoration, a scrollable content body and a persistent footer. Parents own draft/discard decisions; failed writes leave the draft intact. Navigation guards aggregate active settings, supplier, model and workflow dirty state. No new frontend framework or remote asset dependency is introduced.

# Parallel ownership

| Worktree | Primary files | Integration dependency |
| --- | --- | --- |
| Settings | new Settings access component, GatewayCredentialForm and settings browser tests | parent AppShell mount |
| Canvas | routing editor/canvas/model helpers and canvas browser tests | parent dirty-navigation callback if needed |
| Suppliers | ProviderView, setup/identity helpers, symbol asset and supplier browser tests | contract connection-test API; parent open-models callback |
| Contracts | catalog/provider_config/model_metadata/discovery/gateway, API types/client, backend tests/docs | consumed by supplier/models UI |
| Models | ProviderModels/ModelFields/model helpers/useProviderManagement, ModelManagementView/Dialog and model tests | contract update_model/schema; parent navigation |

Locale catalogs can be extended by each isolated worktree. The parent merges those independent keys and resolves overlapping translated terminology. Existing staged provider/select/spec changes are included in a private baseline snapshot, so workers develop against the actual worktree without committing unrelated operator work.

Every task has an independent acceptance agent, with a fresh context separate from the implementer and a task-owned acceptance report. Parent integration receives its own acceptance context. Resume the assigned context for rechecks when the harness retains it. If a finished context has been removed by the harness, start a separate successor for that task, carry forward its acceptance artifacts and record both context IDs; never inherit an implementation conversation. Developer self-checks do not establish acceptance.

# Compatibility, migration and rollback

Frontend Provider source follows the [directory design](research/provider-directory-design.md).
Connection editing, setup, credential controls and candidate probes live in
`frontend/src/features/providers/suppliers/`. Model workspace, import preview,
Dialog, fields and draft/evidence helpers live in `frontend/src/features/providers/models/`.
The configuration manager, profile helpers, identity rendering, icons, constants
and asset credits live in `frontend/src/features/providers/shared/`. Shared modules
do not import supplier or model UI. `GatewayCredentialForm.tsx` lives beside
`AccessSecurity.tsx` in `frontend/src/features/settings/`. The twelve Provider unit
test files live in `frontend/src/features/providers/__tests__/`; root `assets/`
retains its files and bytes. Application, Settings and standalone fixtures consume
these owners directly. Existing transaction and payload bodies remain unchanged;
`profileForWrite`, `searchProfiles` and `newPresetInstanceID` retain their exact
bodies in `shared/profiles.ts`. Historical baseline paths and acceptance assertions
retain their recorded identities.

The Settings move changes no credential bytes. Supplier identity stays stable on name changes; generated references are chosen once for new instances and existing shared references are preserved. Optional model fields preserve legacy parsing; atomic model updates use the existing expected revision and recovery transaction. Routing/layout saves retain separate files and guards. There is no destructive migration. Reverting the task source changes leaves old catalogs usable; retain backups when model fields are written.

# Required and optional changes

## Supplier-owned model lists (latest direction)

Remove the Models navigation destination and its App-owned provider-selection state. Each saved LLM supplier renders a bound model list with Edit buttons beneath its connection row. Reuse ModelManagementView in an embedded mode without provider selection, page heading or separate details action. Disclose discovery/import controls under the same supplier. The shared manager continues to own queries and transactions. Model-specific errors must reach this content while the shell destination is Suppliers. Reuse the existing model editor Dialog and guard registry. Filtering, kind changes and supplier-edit actions must consult aggregate dirty/pending ownership before unmounting model lists; late queries remain bound to their actual supplier. Settings and setup links lead to Suppliers. Backend and record identities do not change.

All acceptance rows in the PRD are required. Optional enhancements are extra canvas shortcuts and convenience sorting beyond the specified base interactions. They must not delay required functionality or widen public routing semantics. A generated question/fallback/pool/model node is not independently deletable when existing graph rules make it mandatory; its menu explains the restriction.
