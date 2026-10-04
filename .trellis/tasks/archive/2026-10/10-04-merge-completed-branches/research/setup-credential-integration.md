# Setup and managed credential integration

A read-only comparison of release `75b70c8`, initial main `dbcc14f`, and credential `4acfba2` found several contracts that a textual merge cannot combine by itself. This concerns backend initialization; the separate frontend conflict resolution is not part of this investigation.

## Confirmed adaptations

- Release `jev_gateway/setup.py` adds `ManagementSetup.configure()` and writes new management keys to `.env` with the fixed `MANAGEMENT_KEY_ENV`. Credential `ProviderConfiguration.gateway_credential()` owns the newer write-only path through `credentials.credential_update()` and `credentials.json`. The combined setup path must use that owner for new writes.
- Release `initialize_configuration()` creates `models.json` and `.env`. The managed credential contract also creates `credentials.json` from `credentials.example.json`, preserves existing files, and protects the credential file's mode.
- Combined startup, reload, and setup catalog reads must retain the credential branch's `allow_missing_credentials=True` semantics for incomplete first-run configuration. Readiness and serving errors remain explicit.
- Release `/v1/setup` and credential `/v1/gateway-credential` must use the same credential storage and local-bootstrap authorization rules. Preserve both existing endpoint contracts, including their safe response projections and established error envelopes, instead of removing a completed feature's API.
- Preserve release global-default and routing readiness projection. Resolve credential presence from the same effective catalog/credential snapshot used by provider management. Keep existing configured environment reference names; use the managed credential owner's default only when there is no declared reference.

## Existing test anchors

- `tests/test_setup.py`: first-run setup, readiness, revision checks, key rotation, local-only access, CLI/headless initialization, and incomplete serving.
- `tests/test_credentials.py`: immediate bootstrap/rotation activation without readback, untrusted-bootstrap refusal, invalid-secret refusal, and default-install bootstrap.
- `tests/test_credential_live_server.py`: actual local HTTP transport, JSON-only reload/restart behavior, and privacy.
- `tests/test_cli_managed_credentials.py`: CLI presence, validation, and environment semantics.
- `tests/test_install_local_script.py` and `tests/test_cli_install_state.py`: initialized credential files and preserved existing operator files.

The next merge should adapt release-only files and their tests to these combined contracts. These are integration repairs within the approved four-branch scope; no new endpoint or storage policy is proposed.
