# Initialization audit

The clean source audit found that ProviderConfiguration already edits file-backed models.json with a revision token, injected credentials, recoverable file replacement and runtime reload. Its UI disables writes when write_available is false. gateway.py:require_config_write rejects management writes when gateway.api_key_env has no resolved value, while installation only copies a populated example and does not establish a management key.

catalog_from_document requires nonempty provider/model lists; Catalog.validate and _validate_policy also reject empty models and tag pools. These constraints prevent saving the first provider before importing models and assigning strategy tags. Preserve all schema and explicit reference checks while permitting valid incomplete configuration as an onboarding state.

install_state.py:init_runtime is the current absent-file copier and preserves existing bytes. Default foreground startup calls load_gateway_config, which reads runtime models.json without initialization. The shared absent-file copier must be usable without writing installation provenance. Existing explicit invalid/missing configuration remains an error.

The packaged models.example.json includes task_aware, quality, economy, a sample policy, decision-example, deepseek/openai and sample models; env.example includes sample upstream key assignments. Remove instances and sample-only policy from defaults, retain the real strategy questions/rules/labels, and make descriptions supplier-neutral. Provider presets remain optional forms.

scripts/smoke-installed-release.py assumes a populated template and indexes routing.models[0]. It must onboard a synthetic provider/model explicitly before exercising populated routing checks. Behavior tests using the old template must use the existing populated tests/fixtures/task_aware_matrix.json rather than repopulating the production default.

The current public v0.1.0 exists with exactly four assets and stable flags. User explicitly requested republishing that version. docs/releasing.md and .github/workflows/release.yml require build plus installed-wheel smoke on Ubuntu and macOS before publishing. Capture and privately back up release/tag/assets before replacement; never count local tests as proof of public publication.
