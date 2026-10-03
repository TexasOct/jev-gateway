# Replacement public installed acceptance

The assigned installed acceptance passed against the replacement public v0.1.1 publication: commit `6fc0f0e19e31f52d8e831593e8c530aed7e73141`, [workflow run 37132156378](https://github.com/TexasOct/jev-gateway/actions/runs/37132156378), Release ID `402565482`. Both requested commands used fresh directories under `.git/jev-release-011-acceptance/replacement/` and exited 0. Both reported success, and their independent cleanup checks passed.

| Run | Native exit | Success | Cleanup | Checks | Duration |
| --- | --- | --- | --- | --- | --- |
| Downloaded public wheel smoke | 0 | true | true | 59 | 142.225 seconds |
| Downloaded public installer, isolated scope | 0 | true | true | 23 | 108.203 seconds |

The wheel smoke ran from `2026-10-03T15:28:33.663976+00:00` to `2026-10-03T15:30:55.889142+00:00`. The installer acceptance followed from `2026-10-03T15:30:55.934112+00:00` to `2026-10-03T15:32:44.136486+00:00`. The successful public-assets manifest and downloaded files matched these requested SHA256 values before execution and remained unchanged afterwards:

| Asset | SHA256 |
| --- | --- |
| `jev_gateway-0.1.1-py3-none-any.whl` | `2598f5ab58d1c90c1cb4b788bbf2d2193a28f247fc6d6b6ae01ec7e8fd6a2038` |
| `install.sh` | `bbd06b07d7e8f5ead47540bc4d52c2dc24a524eb850911f12682d1ba28e56cd5` |

The wheel contains 52 package files. An independent read-only comparison captured all 52 installed smoke-package files while that installation was present; its file set and bytes matched the public wheel. The installer driver also compared all 52 installed files before uninstall. Each of its three public installer invocations exited 0, and the observer recorded the exact replacement wheel SHA256 and size of 355988 bytes immediately before forwarding the original uv arguments. Installed `direct_url.json` omitted an archive hash, so the driver joined its local file URL to the observed verified input. The observer is enabled for all helper scopes; this assignment exercised isolated scope.

The wheel smoke covered managed Python 3.12, installed identity, the recorded runtime home containing spaces, isolated file operations, background and foreground startup outside the checkout, proxy-independent readiness, SQLite integrity/schema, bundled dashboard assets, authenticated provider and routing API writes, running/stopped updates, and uninstall preservation. The installer acceptance covered execution of the downloaded public script and its pinned wheel download/checksum, authenticated local health and assets, explicit restart, running and stopped reinstalls, foreground startup, and uninstall preview/removal/preservation.

The installer preserved seven protected files, including configuration, credentials and backups, routing overlay, theme and canvas state. Credential files retained mode `0600`; SQLite integrity remained `ok`, and the original configuration-version row remained present. The smoke runtime ended with two configuration-version rows from its configuration API checks. Both runtimes contained zero request, decision, upstream-request, outcome and continuation rows. No generation or provider discovery requests were made.

Postflight at `2026-10-03T15:37:00.569510+00:00` found no remaining acceptance process among 676 processes belonging to this user, with no inaccessible metadata in that set. Both native ownership probes exited 0 and reported `stopped`; both configured loopback ports were available to bind. Neither runtime retained a PID record, and both isolated command shims were removed. The two native command processes and capture runner had exited.

The first postflight inspection stopped on metadata denials from eight protected processes belonging to other users. Its private log and exit-1 record remain under the replacement evidence root. The completed inspection enumerated this user's PIDs before reading native argv. This inspection error did not affect either acceptance command, and no product, test or helper repair was made.

All 123 protected file hashes matched the preflight snapshot, including tracked Python package/test/script files, release metadata, task helpers, the replacement input assets and historical installed evidence. Eleven historical evidence files were compared explicitly. The first-publication reports, original failed installer directory and successful retry directory remain intact. The private evidence root has mode `0700`; native logs have mode `0600`.

Actual commands:

```bash
PYTHONDONTWRITEBYTECODE=1 /Users/texas/Workspace/jev-llmroute-test/.venv/bin/python3 \
  /Users/texas/Workspace/jev-llmroute-test/scripts/smoke-installed-release.py \
  --wheel /Users/texas/Workspace/jev-llmroute-test/.git/jev-release-011-acceptance/replacement/public-download/public-assets/jev_gateway-0.1.1-py3-none-any.whl \
  --version 0.1.1 \
  --work-dir /Users/texas/Workspace/jev-llmroute-test/.git/jev-release-011-acceptance/replacement/public-wheel-smoke

PYTHONDONTWRITEBYTECODE=1 /Users/texas/Workspace/jev-llmroute-test/.venv/bin/python3 \
  /Users/texas/Workspace/jev-llmroute-test/.trellis/tasks/10-03-release-011-acceptance/verification/tools/public-installed-acceptance.py \
  --scope isolated --version 0.1.1 \
  --assets-manifest /Users/texas/Workspace/jev-llmroute-test/.git/jev-release-011-acceptance/replacement/public-download/public-assets-result.json \
  --work-dir /Users/texas/Workspace/jev-llmroute-test/.git/jev-release-011-acceptance/replacement/public-installer-isolated
```

The capture environment also selected private temporary and uv cache directories under the replacement root. Each child ran with inherited JEV, UV and Python environment overrides cleared. The existing scripts and helpers were executed unchanged. Installer command evidence records 21 child exits: the three installer commands exited 0, and the one stopped-status exit 4 matched the expected `not_running` contract.

[final-public-install-results.json](verification/final-public-install-results.json) contains sanitized identity, results, timestamps, durations, preservation counts, observer inputs, postflight findings and SHA256 references to the native evidence. Raw logs, numeric exits, native result records, cleanup records, runtime files and databases remain under `.git/jev-release-011-acceptance/replacement/`. Each run has adjacent `<run>-native.log`, `<run>-native-exit.txt`, `<run>-native-result.json` and `<run>-cleanup.json` files.

This report completes the assigned replacement wheel and isolated installer acceptance. Preservation applies to the synthetic isolated runtimes. The parent separately owns the default-path operator upgrade and existing operator-history preservation. This worker made no operator/global service or installation changes, product/test/helper edits, real upstream calls, commits or publication changes, and did not repeat frontend/backend main tests or browser suites. Overall release acceptance remains with the parent.
