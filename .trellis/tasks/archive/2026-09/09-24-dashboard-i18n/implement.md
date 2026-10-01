# Implementation plan

1. Inventory user-visible strings in `App.tsx`, `RoutingEditor.tsx`, date/status helpers, and API fallback errors.
2. Add typed English and Chinese dictionaries, locale selection/resolution, parameter substitution, and dictionary parity tests.
3. Add a React locale provider and toolbar selector; persist only validated `en`/`zh-CN` locale IDs under one fixed key and update `document.documentElement.lang`.
4. Localize monitoring UI and dates; preserve raw evidence and identifiers. This provides the locale API consumed by the session-list and workflow child tasks.
5. Localize routing configuration and workflow UI, including dynamic labels and validation/review states.
6. Update security tests to assert every persistent-storage write uses only the fixed locale key and only supported locale values; verify credentials remain absent from all storage APIs, URLs, cookies, shell HTML, and logs.
7. Add tests for persistence, fallback, switching without losing drafts/selection, both-language copy, and accessibility labels.
8. Run `npm --prefix frontend run lint`, `npm --prefix frontend run test`, `npm --prefix frontend run build`, `scripts/build-frontend.sh --check`, `uv run pytest -q`, `uvx pyright`, and `uv build`.

## Rollback point

Localization can be reverted independently by removing the provider/dictionaries and selector. Never persist credentials; if locale storage security assertions cannot be made precise, stop and resolve the tests before merging.
