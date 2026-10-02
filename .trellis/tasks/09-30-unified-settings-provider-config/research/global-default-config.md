# Global default model configuration

The user's clarification, `我们的default默认继承全局的，每个策略的单独配置可以延后`, selects one global default model. The backend configuration work is implemented in `catalog.py`, `provider_config.py`, and `cli/providers.py`. Routing and frontend integration remain with their respective owners.

## Configuration contract

`models.json` accepts an optional top-level `defaults` object with one field, `default_model`. Its value is an exact configured `ModelProfile.name`, such as `provider/vendor/model`, or null. Omitting the object or field gives null. Explicit `defaults: null`, other object shapes, unknown fields, non-string non-null values, blank strings, upstream-only names, strategy aliases, unknown IDs, and IDs with surrounding whitespace fail validation.

`CatalogDefaults` is frozen and `Catalog.defaults` is appended with a default factory to preserve existing constructors. `Catalog.as_dict()`, `Catalog.routing_snapshot()`, and `ProviderConfiguration.project()` always project `defaults: {default_model: ...}`. The catalog parser and `Catalog.validate()` enforce the reference. This configuration does not interpret model capabilities or add strategy overrides. The packaged template remains without a default ID because it contains no models.

The existing authenticated Provider configuration routes accept the revisioned operation `{action: "set_default_model", model: string | null}`. The operation has exactly those keys. Null explicitly clears the value. Validation uses the existing injected credentials, baseline parser, effective-overlay parser, and registry preparation. Apply uses the existing recoverable configuration replacement and runtime activation. Dry validation writes nothing. No storage file, API, or routing-overlay field was added.

CLI addition seeds omitted provider/model arrays only in its in-memory document and preserves rejection of explicit invalid array types. Its candidate retains those arrays before append. CLI forced provider removal refuses a provider containing the selected global default and asks the operator to clear `defaults.default_model` first. Other invalid references still fail candidate validation. Removing a provider from a document with an omitted model array now works as an empty array.

The original `_resolve_api_key` trimming behavior was preserved. This work did not edit `setup.py`, strategy modules, frontend, templates, existing tests, or release assets.

## Verification

`tests/test_global_defaults.py` adds 45 cases covering parser strictness, immutable defaults, canonical references, safe snapshots, dry validation, apply and explicit clear, stale revisions, registry and write failures, activation rollback, unchanged overlays and credentials, model import plus default in one transaction, blocked referenced-provider deletion, forced CLI removal after clear, omitted-template CLI addition, preservation of existing data, authenticated HTTP validation/apply, file-based reload, and rejection of a dangling default on reload while preserving active state.

The fresh-template CLI regression runs in a separate Python process, blocks imports of the gateway and operator configuration, uses synthetic credentials and `.invalid` endpoints, and confirms that CLI addition and safe Provider reads preserve the process environment. Its literal credential round trip uses the existing dotenv marker. No upstream calls were made.

Latest focused command:

```sh
PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true uv run pytest -q \
  tests/test_global_defaults.py tests/test_catalog.py tests/test_provider_config.py \
  tests/test_provider_config_regressions.py tests/test_cli_providers.py \
  tests/test_cli_templates.py tests/test_cli_config_ops.py tests/test_routing_overlay.py \
  tests/test_provider_onboarding_integration.py tests/test_empty_tag_default.py \
  tests/test_provider_management_api.py \
  -k 'not test_get_validate_apply_and_revision_conflict'
```

Result: **214 passed, 1 deselected**, exit 0. The earlier unfiltered subset returned 193 passed and one failure: `tests/test_provider_management_api.py:51` still asserts the old exact response field set. The parent owns existing tests and needs to add `defaults` to that assertion. The new HTTP regression exercises the same endpoint with default configuration, auth, activation and rollback.

Scoped and full `uvx pyright` both returned 0 errors, 0 warnings, 0 informations, exit 0. The active LSP probe found no type errors in the four owned files. Its auxiliary ast-grep findings on existing `is False` and `is True` expressions are strict boolean checks unrelated to this implementation; they were preserved.

No commit, push, publication, real operator configuration access, or full-suite/release acceptance was performed by this implementation owner.
