# Configuration initialization acceptance

## Scope

The current user goal authorizes editable file-backed configuration, implemented
first-run initialization, strategy-only defaults, optional later supplier/model
configuration, reload after configuration and replacement publication of v0.1.0.
The latest user authorization adds real upstream streaming using relevant existing
agent credentials, followed by public v0.1.0 replacement and deletion/recreation
of local application configuration through the published installer. Earlier local
gates use synthetic credentials and fake transports. Real and synthetic results
must be recorded separately. Credentials and raw request/record contents remain
private. The actual local runtime must be backed up before configuration reset;
existing records remain available after reinstallation.

## Verified local evidence

- Frontend lint passed with zero errors and four existing Fast Refresh warnings.
- Backend pytest after global defaults and transport fixes: 896 tests passed.
- Pyright passed with zero errors, warnings or informational diagnostics.
- Frontend unit tests: 32 files and 246 tests passed.
- Full Playwright suite after global defaults and transport fixes: 110 tests passed. First-run cases
  cover English/Chinese, desktop/320px, optional defer, authenticated reconnect,
  pasted-padding Connect normalization, transport-safe setup keys, remote CLI
  guidance and stale-revision retry. Global default cases cover Settings save,
  clear, stale revisions, permission, pending, both locales and narrow layout.
- TypeScript, production frontend build and bundle freshness passed. The existing
  bundle-size warning remains.
- uv lock check and installer/local-installer shell syntax passed.
- Fresh final wheel build and release validator passed. The actual macOS
  installed-wheel smoke passed in 129.83s, from the strategy-only production
  template through setup, guarded invalid-key/origin/forwarding rejection,
  provider-before-model save, confirmed import, global default inheritance across
  all three strategies, tag assignment/removal, reload, restart and running/stopped
  reinstall and uninstall preservation. Package/template/dashboard bytes match
  the tested wheel. No generation or upstream discovery occurred in this smoke.
- Private original-release backup was independently checked: all four files
  match API digests and sidecars, bundle verification passes and the original
  annotated tag object matches the captured remote lease. Details are in
  release-replacement.md.

Durable command results and full sanitized logs are under
`~/.cache/jev-release-acceptance/config-init-0.1.0/final-local-2/`,
`final-artifact-gates/` and `final installed smoke/evidence/`. These private paths are
evidence locations, not runtime configuration sources.

## Requirement audit to complete before publication

Real post-integration browser acceptance and the final independent integration
review are still running. Public/tag/workflow replacement has not begun. Local
passing artifacts are not evidence that the public release contains these changes.

| Requirement | Evidence needed |
| --- | --- |
| Defaults omit providers/models and contain no supplier instances/secrets | Final packaged template plus installed-wheel assertion |
| Existing strategy selection behavior survives | Catalog/registry regression and final quality report |
| Empty runtime starts and initialization is usable | Backend tests, actual browser flow and installed acceptance |
| Providers/models may be configured later | Optional defer browser cases and start-before-provider installed checks |
| File-backed provider save/import/pool assignment and reload work | Actual backend/browser operations and installed smoke |
| Empty matched tag inherits global default and displays default/默认 | Canonical global setting, guarded Settings edits, conflicting strategy pools/fallback tests, preview/headers/records/session evidence and bilingual UI checks |
| Bootstrap protects credentials and existing state | Local/origin/forwarding/revision/rollback/CLI tests and protected-file checks |
| Existing configuration and records survive updates | Installed running/stopped reinstall and uninstall preservation |
| Full local quality gates pass | Final pytest/Pyright/diff review and frontend results above |
| Final wheel contains matching code/templates/dashboard | Fresh build, validator and installed-package parity |
| v0.1.0 is republished through both operating-system gates | Exact source/tag/workflow head and every job conclusion |
| Public/latest assets and fresh installer are accepted | Four digests/sidecars, downloaded-wheel smoke and public-installer smoke |
| Real provider discovery/import, configuration edits/reload and stream work | Actual installed wheel, authorized credential source, successful stream chunks/finish/DONE and retained evidence, with no transport patch |
| Actual local config deletion and public reinstall work | Private backup, explicit config removal, public install, empty-template startup/setup, import/edit/reload/stream, installed parity and record preservation |
| Complete acceptance report is delivered | Requirement audit with exact commits/tag/workflow, hashes, command exits, real/synthetic distinctions and final local state |

## Inherited Provider-page boundaries

The earlier merged management plan distinguishes configured credentials,
configuration validation, model discovery and retained provider observations.
Those remain separate. Presets/custom create/edit, credential keep/set/clear,
confirmed model import and existing guarded deletion use the current delivered
interfaces. Explicit provider enable/disable, OAuth and a live generation-based
connection test remain unavailable/deferred; this continuation adds none of them.
Settings owns language and independent appearance preferences, while Provider
and Strategy remain peers of Monitoring in the top-level navigation.
