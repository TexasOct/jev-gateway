# Initialization quality check

This is the historical initialization-only review. Its remaining whitespace
finding led to the current 16–8192 printable ASCII setup-key contract and real
Fetch verification recorded in `native-initialization-acceptance.md`. Its default
selection gap was addressed by the later global-default implementation and
rework. Current integrated results are in `post-rework-gates.md`; this report's
809-test and attributed frontend counts remain evidence of its earlier scope.

Scope: the authorized initialization continuation. Reviewed the task PRD, design,
implementation plan, check manifest, archived context and applicable backend
contracts, including the complete initialization and dashboard-routing guides.
Reviewed current runtime, CLI, template, test, frontend and installed-smoke changes.
Publication and installed-wheel execution remain parent-owned.

## Fixes

- Removed explicit `kind: policy` from quality/economy. Their omitted kind parses
  as auto and selects the decision strategy when decision providers are configured.
  A fake decision client regression verifies classification dispatch for both plans.
- Omitted packaged provider/model arrays and decision-provider arrays, retaining
  disabled decision settings and explicit runtime/storage controls. A local parsed
  comparison against the original Git template confirmed all three strategy kinds,
  complete policies and options, default strategy, gateway and storage settings
  are unchanged. No sample top-level policy or supplier/model instances were restored.
- Fixed omitted-model assumptions in discovery preparation, routing configuration
  reads and empty model overlays. Regression coverage exercises candidate discovery
  without writes, safe missing-provider errors, empty routing reads, validation,
  apply and reload while preserving baseline bytes.
- Moved CLI setup initialization and configuration reads inside its fixed-error
  boundary, preventing invalid configuration values from appearing in setup output.
  Added read-error sanitization and noninteractive prompt-suppression regressions.
- Added a running-app regression for offline CLI setup, explicit reload, authenticated
  reads and subsequent provider creation before any model import.
- Updated the initialization spec for omitted template arrays and auto dispatch;
  corrected a missing inline-code delimiter in routing documentation.

Files edited by this check: `jev_gateway/templates/models.example.json`,
`jev_gateway/provider_config.py`, `jev_gateway/gateway.py`,
`jev_gateway/routing_overlay.py`, `jev_gateway/cli/main.py`,
`tests/test_cli_templates.py`, `tests/test_setup.py`,
`.trellis/spec/backend/initialization.md`, `docs/routing-design.md`, and this report.
No frontend source was edited by this check.

## Requirement evidence

The setup tests cover default absent-file initialization, strict explicit paths,
existing-invalid preservation, protected credential files, empty/omitted arrays,
invalid shapes and references, local Host/Origin/peer authorization, forwarding-header
rejection, stale revisions, shared references, repeat setup, concurrent setup writers,
preparation/replacement/activation rollback and unresolved recovery markers.
They also cover fixed no-model 503 responses before strategy execution, provider
save before import, confirmed first import, pool assignment, reload and restart parsing.
CLI tests verify environment isolation, stdin/environment secret sources, no credential
output, no gateway-module import and prompt suppression.

The shared transaction/read owners retain cooperative lock ordering and reject
unresolved recovery journals before reading partial files. No migration, supplier
lifecycle toggle or active connectivity probe was introduced. Existing provider
credential snapshots, advanced parameters, import confirmation and overlay ownership
remain under their original services.

Reviewed the parent's final installed-smoke changes: rejection probes precede valid
setup, cross-origin and forwarding requests require 403/setup_local_only and unchanged
hashes, stale setup requires 409, and valid setup sends the matching Origin. The script
then follows empty startup, management setup, provider creation, import, assignment,
reload, lifecycle and preservation checks. This review did not execute installed smoke.

## Validation

Final commands on the initialization changes:

| Command | Result |
| --- | --- |
| `PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true uv run pytest -q` | Exit 0; 809 passed in 42.45s |
| `uvx pyright` | Exit 0; 0 errors, 0 warnings, 0 informations |
| `git diff --check` | Exit 0; no output |

Earlier review iterations found one optional-call annotation issue in the new fake
client and two overly narrow expectations about the existing prompt-suppressed CLI
error. Those test issues were corrected before the final full run above.

Parent-reported frontend gates on the reconnect revision: lint exit 0 with four prior
warnings, 212 unit tests, 94 Playwright cases, production build and freshness exit 0.
No frontend edits from this check required a repeat. These are attributed parent
results, not independently rerun frontend gates.

Tests used synthetic credentials/configuration and mocked upstreams. The review made
no remote writes, commits, publication calls or real upstream probes.

## Remaining findings and boundaries

Credential whitespace remains an initialization finding. `ManagementSetup.configure`
accepts surrounding spaces, gateway parsing now preserves them and Bearer comparison
requires the exact bytes. Fetch `Headers` removes trailing header whitespace. A local
Node reproduction with a synthetic key confirmed the resulting Authorization differs
from `Bearer ${key}`. The reconnect browser test mocks the trimmed value and therefore
does not prove that an actual gateway accepts it. A setup key ending in spaces can
persist successfully and then fail the browser's authenticated follow-up read.
Resolve the supported key normalization/validation contract and add a real transport
regression before claiming complete initialization acceptance. Source changes for
this issue were left to the parent after requesting exclusive backend ownership.

The newly requested empty matched-pool fallback to a strategy default model, with
final distribution shown as default/默认, is outside this report's validation scope.
It remains pending separate implementation and integration checks. Existing catalog
widening behavior was not changed speculatively. Passing commands here do not verify
that new requirement or authorize publication.

Release build, Ubuntu/macOS installed-wheel gates, exact artifact/source parity and
public replacement/download/installer acceptance remain parent-owned and unverified
by this review. No completion, commit or publication claim is made.
