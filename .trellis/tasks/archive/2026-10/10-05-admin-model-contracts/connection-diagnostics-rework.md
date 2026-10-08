# Connection diagnostic rework

Source base: `61a337478c8ee3b6826c00e22b9029d1ec6ea6e8`.

The implementation delta changes only warning prose in
`model_discovery.test_provider_connection`. Every path includes
`generation_unverified` and one fixed diagnostic code. The public mapping is in
`docs/admin-experience.md`. Response fields, statuses, scope, model counts,
classification precedence and credential projections retain their previous behavior.
No frontend consumer delta is required: `warnings` remains `string[]`, and the
supplier view renders localized status and scope.

The network owner already normalizes `DiscoveryNetworkError.code` through an
allowlist. Connection/TLS failures become `upstream_failed`; DNS and timeouts
already have network classifications. No classification change was needed or
made. This rework did not reproduce a missing classification.

New `tests/test_connection_diagnostics.py` exercises the real ASGI route and
listing owner for all six statuses, complete empty listing, absent declared
credential, partial pagination, hostile exception text and hostile exception
code. It checks exact fixed diagnostics, Dashboard HTTP 401 before probes,
upstream semantic HTTP 200, unique counts, zero generation calls, unchanged
file existence/bytes, process environment and active catalog/registry identity.
A decision-owner check ensures no listing probe runs.

The supplemental harness was retrieved unchanged from branch
`pi-agent-0fbe4a5d-34d8-4ec` at
`.trellis/tasks/10-05-admin-model-contracts/evidence/acceptance-successor/test_independent_boundaries.py`.
Its SHA256 is `dbd7eb6bd17635707fa68bf4a95264e93617c653cc5b239b899fd2df650b2d07`.
The frozen C4 regex and all other assertions are unchanged. Its restored copy is
verification material, not an implementation change to integrate over QA files.

Verification in this isolated checkout:

| Command | Result | Native exit |
| --- | --- | --- |
| `uv run pytest -q tests/test_connection_diagnostics.py tests/test_admin_model_contracts.py tests/test_model_discovery.py tests/test_discovery_network.py tests/test_provider_management_api.py .trellis/tasks/10-05-admin-model-contracts/evidence/acceptance-successor/test_independent_boundaries.py` | 122 passed | 0 |
| `PYTHONPATH=. uv run pytest -q tests/conftest.py .trellis/tasks/10-05-admin-model-contracts/evidence/acceptance-successor/test_independent_boundaries.py` | 6 passed | 0 |
| `uvx pyright` | 0 errors, 0 warnings, 0 informations | 0 |
| `git diff --check` | Clean | 0 |

The first focused run reported 104 passed and one failed test (exit 1): its
absent-credential fixture reused a reference inherited from the shared synthetic
environment. The fixture now uses a distinct absent reference. A standalone
harness invocation without test bootstrap failed collection (exit 2) because
`tests` was not importable; the explicit `PYTHONPATH` and conftest invocation above
passed all six cases and preserves isolated runtime setup.

These are implementer verification results. The remaining 58-row independent
matrix and acceptance verdict belong to the dedicated QA context after integration.
No live credentials, upstream services, manual commits, pushes or publication were used.
