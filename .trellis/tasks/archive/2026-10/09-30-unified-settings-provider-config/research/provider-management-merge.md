# Provider management task merge

## Disposition

The user asked to merge the planning task `09-30-unified-provider-management-ui` into the in-progress receiver `09-30-unified-settings-provider-config`. This is a merge, not a declaration that every source criterion has passed. The receiver remains responsible for verifying coverage, recording deferred capabilities and completing user review where still needed.

## Requirement-to-receiver map

| Source task requirement | Receiver work / evidence | Current disposition |
| --- | --- | --- |
| Survey provider data model, backend APIs, dashboard entry points, validation and error handling | Reconcile the source task's `research/current-provider-surfaces.md` with current frontend/backend code and the archived Provider configuration experience artifacts | Initial survey is stale: it predates the provider configuration, validation, discovery and metadata APIs. Re-verify against current sources. |
| Design a unified management information architecture and flows for create/edit, enable/disable, credentials and validation | Receiver PRD's merged Provider scope and acceptance items 7 through 9; `design.md` and `implement.md` document boundaries and remaining verification | Create/edit/configuration/discovery flows exist in the product evidence. Explicit enabled/disabled lifecycle and active connection-test semantics need verification. Do not assume these APIs exist. Record unavailable behaviors as deferred. |
| Make common configuration fast by reusing types, model definitions and defaults | Receiver acceptance item 8; current Provider presets/onboarding implementation and the source task's `research/current-provider-surfaces.md` | Verify that defaulting and autofill are evidence-backed and preserve stable instance/model IDs. Source task only planned this work; no separate implementation evidence found in it. |
| Define success, field error, connection failure and missing-credential feedback while keeping credentials safe | Receiver acceptance item 7; archived Provider task's `api-contract.md`, `acceptance.md` and browser evidence | Provider task records configuration, credential keep/set/clear, validation/discovery errors and safe credential projections. Determine whether active connection testing and its feedback are in scope/supported. |
| Produce PRD, design and execution plan; have user review before implementation | Receiver owns cross-page/design reconciliation and records whether the prior Provider configuration approval/review covers these decisions | Do not infer approval from task overlap. Inspect the archived parent decisions and acceptance record; note any remaining decision explicitly. |

## Acceptance ownership and unchanged boundaries

The receiver already owns the Monitoring-level Provider & models entry and system Settings placement, including moving Theme under Settings. It now also owns the merged Provider management IA and the verification of which source-plan features the existing implementation actually supports. The archived source task is not reactivated.

Keep the existing boundaries: provider instance, protocol and brand identity remain distinct; credentials are never returned in clear text or persisted in browser preferences; Theme remains in its independent theme API/store; Provider configuration uses the existing write guard; discovery is distinct from configured/routable models and import requires explicit user confirmation and metadata review. Do not add provider deletion, lifecycle toggles, OAuth, batch import, active health checks or any other capability merely because the old planning PRD mentioned maintenance. First confirm product authorization and actual API support. The source plan also excludes unconfirmed new provider types, batch import and automatic probing/detection. Keep these exclusions while reusing the explicit model discovery/import flow already approved in the later Provider task; that approval does not authorize unrelated extensions.

The source research's existing behavior and safety boundaries remain inputs to the receiver: routing edits use `routing-overrides.json` beside `models.json`, do not edit the catalog, retain gateway-key authorization and roll back failed apply. Catalog parsing rejects literal API keys, unknown fields/types, invalid references and malformed fields. Provider deletion affects referenced models and must retain existing guards if evaluated; no new delete UI is authorized here. Decision providers remain distinct from chat/catalog providers, with `.trellis/spec/backend/decision-providers.md` as their contract. Observed provider traffic and credential presence cannot be presented as an active health check.

## Source acceptance and decision coverage

| Source acceptance or open question | Receiver owner and next step | Closure status |
| --- | --- | --- |
| PRD, design and execution plan must reflect current data structures and interfaces | Receiver owns `prd.md`, `design.md`, `implement.md` and this map; compare the source survey with archived API contracts and current code before editing product code | Retained, not marked complete by this merge |
| Design must explain page/region structure, core flows, quick setup and state feedback | Receiver design/data-flow boundaries and acceptance items 7-9; document supported actions and feedback, including missing credentials and validation failures | Retained; current feature support needs criterion-level evidence |
| Unsupported backend capabilities must be identified as deferred or prerequisites | Receiver acceptance item 7 and Open questions; distinguish config validation, model discovery and live connection testing; verify enable/disable support | Retained; do not invent APIs or silently waive requirements |
| User must review the final plan before deciding on implementation | Receiver acceptance item 9 and Open questions; check whether saved Provider implementation approval covers each flow and seek a decision on any uncovered behavior | Prior approval evidence may be reused when it matches; merge alone is not implementation approval |
| Preferred management entry/workflow still required investigation or confirmation | Receiver's top-level Provider workspace is established; reconcile browse/preset/custom flows with saved user decisions, and leave any remaining workflow choice explicit | Do not treat scope overlap as proof the original decision is resolved |

Original sources: [source PRD](../../09-30-unified-provider-management-ui/prd.md) and [source surface research](../../09-30-unified-provider-management-ui/research/current-provider-surfaces.md). The receiver's implementation and check manifests retain these sources and this map as context.

## Evidence and remaining work

The archived `09-30-provider-configuration-experience` task records AC1-AC13 complete and final mock-backed checks (including 720 backend tests, 210 frontend unit tests and 81 browser cases after the theme follow-up). This is relevant implementation/verification evidence, not proof that every item in the older management plan was separately delivered. Official provider artwork coverage was recorded as 1/3; OpenAI and Anthropic have neutral fallbacks. No real credentials or live upstream accounts were used.

The receiver must compare current code and this evidence against each row above, update its design/implementation artifacts and test the actual Settings/Provider navigation, locale, responsive behavior and credential/write guards. The source planning task required user review before implementation; record whether existing user-approved Provider implementation decisions satisfy that gate or ask before making new product decisions.

## Current continuation: verified support boundaries

The active user Goal expressly authorizes continued implementation, business-flow
verification, replacement publication after passing checks, and actual local
configuration reset/reinstall. It supplies the execution authorization for this
continuation. The page, preset, credential and confirmed-import decisions remain
documented in the receiver artifacts and final acceptance report.

Current source was rechecked directly in `provider_from_dict()`,
`decision_from_dict()`, `ProviderConfiguration.command()` and `ProviderView`:

- Create/edit uses revisioned `upsert`; editing locks the existing instance ID.
  Presets initialize a new draft and do not rename existing model references.
- Credential actions are `keep`, `set` and `clear`. Dry validation precedes apply;
  protected local dotenv writes retain existing credential bindings and backups.
  Credential presence denotes configuration, not provider health.
- Explicit discovery queries a supported provider's model listing. It does not
  probe chat generation or decision endpoints. Manual import requires explicit
  model metadata and `confirmed: true`; public metadata remains distinct from
  operator-confirmed estimates and capabilities.
- Neither provider field allowlist has an enabled flag. Global `decision.enabled`
  is an existing classifier setting, distinct from per-instance lifecycle.
  No management command or Provider-view lifecycle switch is implemented.
- The supported management actions are `upsert`, guarded `delete`, confirmed
  `import`, and global `set_default_model`. No new provider-delete UI is introduced.
  There is no separate upstream health/connection-test API. Gateway `/healthz`
  reports gateway state rather than upstream health.

Per-instance lifecycle switches and a separate active-health UI remain deferred
features under the source plan's exclusions. Their absence is recorded explicitly;
configuration validation, real discovery and real generation are accepted only
for the behavior each actually verifies. Current full frontend/browser suites
exercise the existing navigation, guards, presets and state feedback. Native,
installed/public and real evidence retain their separate scopes.
