# Design: unified settings and provider configuration pages

## Actual local reset and real-stream acceptance

The latest user authorization extends synthetic checks with installed-artifact
real upstream tests. Read only relevant existing-agent connection/auth fields
privately; copy credentials solely to protected acceptance files. Normal provider
configuration, discovery/confirmed import, global default and reload own activation;
no fake transport is permitted in real-stream results. Capture stream event counts,
termination, timing, usage, headers and retained-success counts without private
response/request content or token values.

After prepublication gates and public download verification, snapshot actual local
runtime config/credentials and a consistent SQLite backup under a private 0700
directory. Verify and stop the owned running service. Remove configuration files
at its resolved home while preserving records and retaining the private rollback
copy. Run the pinned public installer with normal local uv tool/state paths, verify
packaged-file parity, and exercise absent-file initialization, setup, model import,
editing/reload and real streaming through installed commands outside the checkout.
The final local runtime remains available with configured management access and a
verified provider/global model; originals stay recoverable from the private backup.

## Authorized initialization continuation

The user goal extends this in-progress task across catalog parsing, runtime initialization, management setup, the existing dashboard, and replacement publication. Reuse the existing provider transaction, credential snapshot, overlay and authorization owners. The baseline remains models.json; credentials remain in its adjacent protected .env. Preserve existing files and do not add obsolete schema migration.

Catalog parsing treats omitted providers/models as empty lists and permits empty tag-based pools. Shape, duplicate identity, provider credential, explicit model-reference, strategy and policy checks remain enforced. The packaged template retains task_aware/quality/economy plans, removes the sample-only policy/provider/model/decision-provider entries, and makes its description provider-neutral. Requests with no routable models fail with a fixed setup_incomplete 503 error before upstream execution; pool selection errors remain controlled.

A shared initialization owner copies absent packaged files under the configuration lock; install_state calls it and retains its separate installation-state responsibility. Default foreground loading initializes absent files; explicit missing file paths keep the established strict error contract. Existing malformed files are never repaired by overwriting.

HTTP contract for frontend/backend coordination:

- GET /v1/setup returns {required, local_setup_available, revision, has_providers, has_models, routing_ready, next_step}. next_step is gateway_key|provider|model|routing|ready. routing_ready includes the strategy's usable default selection even when individual tag pools are empty. With a configured key, the existing Bearer guard applies; a 401 leads to the current Connect form.
- POST /v1/setup accepts exactly {expected_revision, api_key}, with 16 to 8192 printable ASCII characters and no surrounding whitespace. This prevents native Fetch Authorization normalization from changing a new key. It requires loopback peer plus loopback Host and, when Origin is present, exact same origin, and is only allowed before a management key exists. It never honors forwarding headers as loopback proof. The setup transaction rechecks key absence and revision under reload-lock then configuration-lock, stores the reference in gateway.api_key_env and the supplied value in .env, prepares/activates the candidate with rollback through replace_configuration, and returns the safe setup projection. Existing configured references and upstream credentials cannot be overwritten by selecting a conflicting environment name.
- CLI jev setup --secret-stdin|--secret-env NAME uses the shared setup service, preserves the same one-time/revision/transaction contracts, and does not import gateway.py. CLI installation/status can show nonsecret initialization guidance.

App.tsx loads setup status before monitoring on first mount. A present key follows the existing Connect behavior. Missing key renders an accessible first-run key form; submission stores the submitted key only in client module memory, clears its draft, and reloads authorized data. Incomplete provider/model/routing status displays optional steps with buttons opening existing Provider and Strategy workspaces. Providers and models can be configured later; console access and process startup never require those steps. Saving and reloading enables configured connections. Refresh after provider and routing mutations updates progress. Reuse current shell, components, palette, localizations and styles without a redesign.

Release replacement keeps 0.1.0. Preserve a private backup of release JSON, four assets, their hashes, annotated tag object and Git bundle; record remote ref lease and release ID. Commit verified source/specs, push the authorized branch, replace only v0.1.0 using its captured lease, and run the existing gated publisher. Verify exact workflow commit and public download parity, run isolated installed-wheel/public-installer acceptance, then execute the newly authorized actual local configuration reset and reinstall.

## Empty matched tag and inherited global default

The user requires empty matched tag pools to inherit one global default model
and display default. Add an optional top-level defaults object containing
default_model: a canonical provider/upstream_model ID or null. All strategies
read Catalog.defaults; per-strategy overrides are deferred. Validate the ID
against the current catalog and preserve the existing strict schema rules.
Omission means no global model is configured. If fallback is needed while this
value is absent, return setup_incomplete before generation; keep the configuration
editable. A valid nonempty tag pool still routes normally without a global default.

Expose the value in catalog and safe provider configuration projections. Use the
existing authenticated revisioned ProviderConfiguration command operation
{action: set_default_model, model: string|null} to validate, save, prepare and
activate through the baseline transaction owner. It belongs in models.json,
never the per-strategy overlay. Settings provides one global model selector
using existing model records, write guards, pending/error states and read/write
ownership. CLI forced provider deletion cannot leave a dangling global reference.

For this specific empty-pool path, report the final tier/label as default without
inferring a differently tagged label from the chosen model. Preserve the matched
rule evidence in reason and identify the empty-tag default in that reason.
Handle default-labelled sessions in pinning, cached/fresh modes and escalation
without label lookup or rank failures. Reasoning must follow a documented default
choice instead of indexing a missing label. A catalog with no models retains
setup_incomplete before decision or generation provider execution.

Preview, route headers, retained decisions/traces and session projections consume
the final outcome label. Localize the reserved default result as Default/默认
in every dashboard result surface; user-defined labels keep their literal names.
The new defaults field requires no record-storage migration. A configured global
default makes routing ready even if specific tags have no assignments. If it is
unset, readiness still permits a fully populated default strategy. Setup remains
optional for console access. Existing padded credential-file values retain legacy
runtime trimming without rewriting the stored bytes; Connect trims pasted padding.

## Architecture and boundaries

The dashboard remains a single-page React application with view selection owned by `App.tsx` and navigation rendered by `AppShell.tsx`. Add `settings` and `providers` as top-level views alongside `monitoring` and `strategy`; remove `appearance` as a top-level view. `settings` owns application-level preferences, including locale and appearance controls. `providers` is the entry point for provider and model management. The user merged `09-30-unified-provider-management-ui` into this task, which now owns its planning requirements and remaining acceptance. Reuse the delivered Provider configuration flows rather than creating a second management API or configuration source. The requirement and acceptance map is in `research/provider-management-merge.md`.

Extract or compose presentational views with typed props and keep data loading, API calls, preference persistence, and request state at the existing orchestration boundary. Reuse the current appearance editor within Settings rather than recreating theme behavior. Preserve its preview, save/reset states, and accessibility behavior.

## Data flow and contracts

- Theme seed continues to use `GET/PUT/DELETE /v1/dashboard/theme` and the independent `dashboard-theme.json` file. It does not enter `models.json`, provider catalog, or routing overlay.
- Scheme selection remains the existing runtime `system/light/dark` behavior unless existing implementation provides a dedicated persistence contract; this work must not add browser theme persistence.
- Locale remains stored under the existing validated `jev-dashboard-locale` localStorage key. No new persistent preference key is introduced.
- Dashboard Bearer credentials remain module-memory-only; provider secrets are write-only and use the existing configuration/credential service. Provider and routing configuration writes retain their gateway-key guard. Theme saves/resets follow the later approved contract: they work without a configured gateway key and require valid Bearer authorization when one is configured.
- The providers view reuses the configuration, validation, discovery and metadata APIs documented by the archived Provider configuration task. Verify create/edit, credentials, quick setup and error feedback against that contract. Record whether lifecycle enable/disable and active connection testing are supported, unavailable or need a new user decision; configuration validation and retained observations do not prove live connectivity.
- Keep catalog writes separate from `routing-overrides.json`. Retain overlay authorization, atomic apply/rollback, stable instance/model references, catalog parsing constraints and the distinction between chat providers and decision providers.

## Navigation and visual behavior

Top-level navigation contains Monitoring, Strategy workflow, Provider & models, and Settings, localized in English and Chinese. Monitoring and Provider & models are peers in the primary navigation. Settings contains locale and the existing appearance/theme controls. Follow the active dashboard shell visual system, keyboard behavior, responsive navigation, `data-scheme` handling, and existing Tailwind/CSS ownership rules.

## Compatibility and migration

No backend schema or endpoint changes are required. Existing theme files and locale storage remain readable without migration. Existing links or internal state that target `appearance` must be redirected or mapped to `settings` if such references exist. Provider configuration APIs and UI were delivered in the archived Provider configuration task. Compare the older management plan with that implementation before further changes; do not expose unsupported lifecycle, connection-test or deletion affordances. Preserve the source plan's user-review requirement for unresolved flows. A merge authorizes task consolidation, not new product behavior.

## Risks and rollback

The merged scope and concurrent sessions may involve overlapping navigation files. The shell visual task has been archived by user decision with incomplete acceptance retained; use its requirements as context without treating archive status as proof of complete integration. Confirm ownership and inspect the shared dirty worktree before editing. Keep changes isolated to view registration, navigation, settings composition, and focused tests. If integration causes regressions, revert the view/navigation change while leaving theme APIs, storage, and provider management untouched.
