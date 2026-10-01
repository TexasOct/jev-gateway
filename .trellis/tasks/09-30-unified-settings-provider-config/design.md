# Design: unified settings and provider configuration pages

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