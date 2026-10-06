# Goal

Implement every requirement in the repository-root `prompt.md`. Organize the Dashboard around gateway settings, supplier connections, model configuration and routing workflows. Preserve effective configuration, canonical identities, credentials, strategy references and the existing authorization boundary.

# Authorization and scope

The original development request authorizes implementation and verification. Apply only the latest effective Goal contract; earlier Goal objectives, IDs and rules are superseded. The user requires every task's acceptance to be managed in a separate agent context. The source request explicitly requires concurrent worktrees for the major modules. Planning is recorded before implementation; routine implementation choices are resolved from the source requirements and repository evidence. The user additionally requests Provider directory organization and publication of stable 0.1.3 after every current modification goal and acceptance is complete. Commit the completed work before publication. Use isolated release installation and synthetic verification; operator upgrades and real upstream generation remain outside this request.

# Requirements and acceptance

| ID | Requirement and observable acceptance | Owner |
| --- | --- | --- |
| IA1 | Settings owns gateway access/security; suppliers own connections; a model workspace owns individual model records; workflows own routing logic. | Integration |
| IA2 | Chinese UI consistently calls Provider 供应商; ordinary forms hide generated instance IDs, credential references and brand IDs. | Suppliers / Integration |
| IA3 | Retain the existing theme, local icon assets, control spacing, error styling and responsive geometry. | All |
| IA4 | Loading, empty, failed, saving and forbidden states provide an explanation and recovery action. Failed saves retain drafts. | All |
| IA5 | Forms work with keyboard; dialogs trap and restore focus; mobile content/footer remain accessible. Dirty dismissal and navigation require a discard choice. | All |
| GS1 | Gateway key initialization/replacement is available in Settings > access and security, absent from supplier/model editing. Existing configured values survive the UI move. | Settings |
| GS2 | Explain client-to-gateway credentials, gateway-to-upstream credentials, and the current Dashboard Bearer boundary. Show configured/unconfigured without returning secrets. | Settings |
| GS3 | Preserve bootstrap/current-key permissions, rotation handover and immediate activation. Explain effects before replacement and report success/failure. | Settings |
| WF1 | Blank-canvas right click offers all supported creatable node types; an explicit add button serves keyboard/touch. Coordinates account for zoom, pan, scrolling and content origin. New nodes become selected and editable. | Canvas |
| WF2 | Context menus stay in the window and close on outside click/Escape. Node and edge actions do not start a drag or connection. | Canvas |
| WF3 | Node context actions and Delete/Backspace remove supported selected objects. Text editing never deletes graph objects. Node removal updates related graph references and layout. Protected/generated nodes and edges explain restrictions. | Canvas |
| WF4 | Ordinary graph/layout edits support undo/redo; pan, zoom, fit and selection remain functional. History respects server-save and configuration-remount boundaries. | Canvas |
| WF5 | Nodes show type/name/configuration summary and selected/incomplete/invalid states. One inspector groups relevant fields; graph/JSON errors identify repair targets. | Canvas |
| WF6 | Workflow identity, explanatory copy, dirty/save/validation status are readable. Save/reopen retains node configuration, connections and layout. | Canvas |
| SP1 | Preset or connection method precedes ordinary connection fields. Appropriate defaults remain editable; advanced fields disclose their use. Same brand supports multiple named connections. | Suppliers |
| SP2 | Stable IDs/references are generated for new instances. Editing display name does not change model/strategy IDs. Existing environment/shared credential compatibility remains in an advanced path. | Suppliers |
| SP3 | Direct credential entry supports replacement, keep-by-default and explicit clear. Failed validation/write retains input. Sharing restrictions remain enforced. | Suppliers |
| SP4 | Connection testing distinguishes authentication, address and network failures; its result states the actual tested scope. Test/discovery never writes configuration. | Suppliers / Contracts |
| SP5 | DeepSeek uses a local symbol without its wordmark, verified in both themes. | Suppliers |
| MI1 | Discovery automatically queries existing metadata for model IDs; preview supports search, visible/batch selection and item editing without requiring one dialog per import. | Models |
| MI2 | Preview distinguishes reliable matches, partial/unknown, conflicts, fetch failure and existing-model skip. Duplicate import never creates duplicates or silently overwrites. | Models |
| MI3 | Prefill supported input/output/cache USD-per-million prices, context/output limits, tools/vision/JSON/reasoning/temperature/effort and other existing routing fields. Preserve price conditions and serving-channel applicability. | Contracts / Models |
| MI4 | Exact provider/model or evidenced aliases govern matching. Similar names and ID-only listings do not certify capabilities/prices. Unknown stays unknown and cannot create a zero-cost or assumed-capability route. | Contracts / Models |
| MI5 | Persist field evidence and retrieval/source dates. Manual overrides survive refresh; restore-auto explicitly previews changed manual values. Failed refresh preserves prior data and permits retry. Explain required confirmation before enabling/importing incomplete metadata. | Contracts / Models |
| ME1 | Model list, import preview and detail use one model Dialog with basic information, capabilities, limits, prices and relevant routing attributes. | Models |
| ME2 | Dialog distinguishes automatic/manual/unknown; capability controls are tri-state. Sources and times are inspectable. USD and per-million units are explicit. | Models |
| ME3 | Validate finite nonnegative prices, positive integer limits, range/relationships, identity and required fields near controls. Commit the whole record atomically with revision protection. | Contracts / Models |
| ME4 | Cancel writes nothing; save failure retains fields; successful save refreshes catalog. Scrollable body and reachable actions work on narrow windows. Avoid nested dialogs. | Models |
| DV1 | Deliver module problems, intended interaction/layout/field ownership, required changes versus optional enhancements, compatibility/migration and implementation dependencies. | Integration |
| DV2 | Browser acceptance covers key editing, native graph add/delete, credential replacement, batch import, metadata failure, manual override and model save. Provide inspectable screenshots/records and honest verification scope. | All / Integration |
| DV3 | Each child task has its own independent acceptance-agent context, separate from its implementer. That agent manages its requirement audit, execution evidence, verdict and rechecks. The parent has a separate integration-acceptance context. | Acceptance agents |
| OR1 | Organize frontend Provider source by responsibility, update all imports and source-backed references, and preserve API, credential and model identity contracts. Test the resulting layout against the integrated feature scope. | Integration |
| RL1 | Complete every modification goal and independent acceptance before the final commits and stable 0.1.3 publication. Verify version metadata, source and installed artifacts, publication workflow and public installer in isolated environments. | Integration / Release |

# Task map

## Latest supplier-owned model entry

The user's latest direction supersedes the separate Models navigation in IA1 and earlier layout plans. The Dashboard has Monitoring, Strategy workflow, Suppliers and Settings destinations. Each saved LLM supplier lists its own configured models directly beneath its connection row. A model row needs only an Edit button, which opens the shared model editor Dialog bound to that exact provider/model identity. Discovery and batch import remain under that supplier, with progressive disclosure for the dense import controls. Preserve canonical identities, confirmation, metadata and atomic-save contracts. Protect dirty drafts on close, filtering, supplier editing or kind changes; block departure during writes; restore focus to the model Edit button or a visible supplier fallback. Decision-only rows do not expose LLM model management. Regenerate current web renders after the change. No separate model detail entry or supplier-model-list modal is required by the latest instruction.

Five independent worktrees own Settings, Canvas, Suppliers, Model contracts and Model workspace. The parent owns shared shell integration, conflict resolution, source requirement auditing, product documentation and final verification. Model workspace consumes the contract worktree's API; Settings supplies a presentational access/security section for the parent shell. Supplier and model surfaces keep the shared configuration manager.

# Compatibility invariants

- Gateway and supplier secrets stay write-only and memory-only in the browser. Locale remains the only persisted browser preference.
- Gateway initialization, configured-key write guards, atomic baseline writes and conflict/recovery semantics remain effective.
- Existing catalogs without new optional fields retain their current runtime behavior. Model edits preserve qualified identities and routing references.
- Baseline supplier/model edits remain separate from routing-overlay edits and layout-only persistence.
- Source suggestions do not become routing facts until the import/save transaction validates confirmed runtime fields.
- Pre-existing supplier/select changes form the preserved development baseline. Unrelated staged work, archived-task moves and journals are preserved and excluded from task commits.

# Completion evidence

Acceptance requires inspected code/diffs, targeted regressions, frontend lint/unit/build/browser checks, full pytest, Pyright, bundle freshness and package asset checks. A final requirement audit records evidence for every row above. Implementer tests and main-session checks are supporting evidence; the independent task acceptance agent owns the acceptance verdict.
