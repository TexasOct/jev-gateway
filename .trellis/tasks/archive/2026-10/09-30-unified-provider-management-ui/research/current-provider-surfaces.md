# Current provider surfaces

## Confirmed behavior

Provider setup is currently split between the CLI/static catalog workflow and dashboard routing configuration.

- Dashboard navigation currently exposes Monitoring, Strategy workflow, and Theme in `frontend/src/app/AppShell.tsx`.
- Monitoring's provider table in `frontend/src/features/monitoring/components/SessionInspector.tsx` displays active-provider configuration/key presence and retained request evidence. It is observational data, not a live provider health check.
- Strategy workflow in `frontend/src/features/routing/RoutingEditor.tsx` edits decision questions, rules, fallback, and catalog-model routing membership/priority.
- Frontend API/type definitions in `frontend/src/shared/api/client.ts` and `frontend/src/shared/api/types.ts` include provider summary reads and routing configuration validate/apply/delete. Routing model overlays are limited to tags and priority.
- Backend provider summary is implemented in `jev_gateway/dashboard.py`; routing configuration APIs are implemented in `jev_gateway/gateway.py`.
- Routing edits are persisted as `routing-overrides.json` beside the active `models.json`. They do not modify the catalog. Writes require the configured gateway API key; failed application rolls back the previous overlay.
- Provider and model schemas are defined in `jev_gateway/catalog.py`. Providers own LiteLLM type, endpoint, credential environment-variable name, params, and environment-backed params. Models inherit provider connection details and own routing/quality/capability/cost metadata.
- Catalog provider/model CRUD is available through CLI helpers in `jev_gateway/cli/providers.py`, not through dashboard APIs. CLI currently has presets for OpenAI, Anthropic, and DeepSeek.
- Catalog parsing rejects literal API keys, unknown fields/types, invalid references and malformed fields. Provider credential values are supplied through environment configuration rather than stored in the catalog.
- Decision providers are a separate concept from chat/catalog providers; see `.trellis/spec/backend/decision-providers.md`.

## Relevant references

- `frontend/src/app/AppShell.tsx`
- `frontend/src/features/monitoring/components/SessionInspector.tsx`
- `frontend/src/features/routing/RoutingEditor.tsx`
- `frontend/src/shared/api/client.ts`
- `frontend/src/shared/api/types.ts`
- `jev_gateway/dashboard.py`
- `jev_gateway/gateway.py`
- `jev_gateway/catalog.py`
- `jev_gateway/cli/providers.py`
- `jev_gateway/routing_overlay.py`
- `models.example.json`
- `docs/http-api.md`
- `docs/models-config.md`
- `docs/routing-design.md`
- `.trellis/spec/backend/decision-providers.md`

## Design constraints for planning

1. A dashboard-only provider CRUD experience requires new backend APIs and a persistence/security design; existing routing overlay endpoints cannot safely stand in for catalog editing.
2. Provider secrets must remain outside `models.json` and dashboard responses. The current catalog stores environment variable names, not secret values.
3. Provider summary evidence must be labeled as recent observed traffic, not an active health check.
4. Provider deletion affects models that reference it; the existing CLI uses guarded removal semantics when models exist.
5. Fast setup can build on existing provider presets and CLI validation rules, but the UI scope and credential-entry mechanism are product decisions.

## Test references

- `tests/test_catalog.py`
- `tests/test_cli_providers.py`
- `tests/test_gateway.py`
- `tests/test_routing_overlay.py`
- `frontend/src/features/routing/__tests__/RoutingEditor.test.tsx`
- `frontend/tests/browser/routing-editor.spec.ts`
