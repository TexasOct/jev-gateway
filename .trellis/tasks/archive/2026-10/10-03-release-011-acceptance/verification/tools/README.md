# Public release acceptance tools

These tools prepare and execute acceptance of downloaded 0.1.1 assets. The retained 0.1.0 helpers in `/tmp/jev-v010-macos-acceptance/` were read for the public checksum and installer lifecycle flows and remain untouched. Historical successes are not imported.

The replacement public assets have been verified. Public-wheel smoke, isolated installer acceptance, the complete installed-wheel browser suite and installed backend regressions passed; their native evidence and scope are recorded in the task's final public-install and public-browser reports. Earlier failed attempts remain preserved.

Default-path operator acceptance also passed. The first upgrade could not start with the unchanged old configuration; that failed attempt and the verified public 0.1.0 recovery remain historical. After target-version validation, independent preview review and explicit user approval, the parent applied exactly the two-file preview and restored a valid running baseline. The ordinary public installer then passed 14 checks with all 16 child exits zero, installed all 52 matching public package files and preserved the complete approved baseline. Against the original, four other existing files and one absence remained unchanged; all original typed rows survived. See `../../check-final-operator.md` and `../final-operator-results.json` for the exact scope. The commands below require fresh evidence directories.

All Python drivers default to `--version 0.1.1`. Use fresh evidence directories for each attempt. Raw operator configuration, SQLite backups, PID records and argv belong under the private `.git/jev-release-011-acceptance/` directory. Share only reviewed counts, hashes, exit codes and screenshots. Installer command evidence contains labels and exits; it never stores child stdout or stderr. The configured gateway key is resolved in memory through the installed credential loader and supplied as Bearer authorization to health, shell and asset requests.

## Public asset and installation commands

Set the two release identity values to the final published commit and tag workflow run. The reference wheel below comes from that workflow's `release-assets` artifact, so all package files, including generated static files, can be compared with the public download.

```bash
umask 077
jev_acceptance_repo=/Users/texas/Workspace/jev-llmroute-test
jev_acceptance_tools="$jev_acceptance_repo/.trellis/tasks/archive/2026-10/10-03-release-011-acceptance/verification/tools"
jev_acceptance_evidence="$jev_acceptance_repo/.git/jev-release-011-acceptance/new-verification"
jev_release_commit='6fc0f0e19e31f52d8e831593e8c530aed7e73141'
jev_release_run='37132156378'

# Read-only download of the completed CI artifact; this does not publish.
gh run download "$jev_release_run" --repo TexasOct/jev-gateway \
  --name release-assets --dir "$jev_acceptance_evidence/ci-public-reference"

PYTHONDONTWRITEBYTECODE=1 python3 "$jev_acceptance_tools/verify-public-assets.py" \
  --version 0.1.1 --source-repo "$jev_acceptance_repo" \
  --expected-commit "$jev_release_commit" --run-id "$jev_release_run" \
  --reference-wheel "$jev_acceptance_evidence/ci-public-reference/jev_gateway-0.1.1-py3-none-any.whl" \
  --evidence-dir "$jev_acceptance_evidence/public-download"

jev_public_manifest="$jev_acceptance_evidence/public-download/public-assets-result.json"
jev_public_wheel="$jev_acceptance_evidence/public-download/public-assets/jev_gateway-0.1.1-py3-none-any.whl"

# Existing wheel smoke: only its actual --wheel/--version/--work-dir flags.
python3 "$jev_acceptance_repo/scripts/smoke-installed-release.py" \
  --wheel "$jev_public_wheel" --version 0.1.1 \
  --work-dir "$jev_acceptance_evidence/public-wheel-smoke"

# Downloaded public installer, isolated lifecycle, reinstall and uninstall.
PYTHONDONTWRITEBYTECODE=1 python3 "$jev_acceptance_tools/public-installed-acceptance.py" \
  --scope isolated --version 0.1.1 --assets-manifest "$jev_public_manifest" \
  --work-dir "$jev_acceptance_evidence/public-installer-isolated"

# Separate public installation retained solely for browser asset serving.
PYTHONDONTWRITEBYTECODE=1 python3 "$jev_acceptance_tools/public-installed-acceptance.py" \
  --scope browser --version 0.1.1 --assets-manifest "$jev_public_manifest" \
  --work-dir "$jev_acceptance_evidence/public-browser-install"

PYTHONDONTWRITEBYTECODE=1 python3 "$jev_acceptance_tools/public-wheel-browser.py" \
  --mode run --version 0.1.1 --source-repo "$jev_acceptance_repo" \
  --assets-manifest "$jev_public_manifest" \
  --installed-python "$jev_acceptance_evidence/public-browser-install/tools/jev-gateway/bin/python3" \
  --expected-tests 118 --workers 2 \
  --work-dir "$jev_acceptance_evidence/public-wheel-browser"

# Ordinary default-path upgrade. Missing public shims do not imply stopped.
# The confirmed preflight owner is running; recheck it immediately before install.
PYTHONDONTWRITEBYTECODE=1 python3 "$jev_acceptance_tools/public-installed-acceptance.py" \
  --scope operator --version 0.1.1 --assets-manifest "$jev_public_manifest" \
  --owner-cli /Users/texas/.local/share/uv/tools/jev-gateway/bin/jev \
  --operator-home /Users/texas/.jev-gateway \
  --operator-bin-dir /Users/texas/.local/bin \
  --operator-tool-dir /Users/texas/.local/share/uv/tools \
  --expect-initial-state running \
  --work-dir "$jev_acceptance_evidence/public-installer-operator"
```

An existing `uv` is required. The driver passes `--no-uv` to prevent bootstrap. Each installer invocation executes the verified downloaded script; that script downloads and checks its own pinned public wheel. A private PATH observer verifies the exact wheel SHA256 immediately before forwarding unchanged arguments to the real uv. If `direct_url.json` omits an archive hash, its local file URL must match that observed input. Every installed package file must also match the downloaded wheel. Generated `__pycache__` files are excluded from the wheel file set. The observer affects only the acceptance subprocess environment; install state does not persist a uv executable path.

Operator mode uses the baseline owner CLI from the uv tool environment when `.local/bin` has no shims. `--owner-cli` can name another explicitly validated installed owner CLI. The tool environment's `bin/python3` runs `native-owner.py`; live argv must match the exact module/home/token shape. An inaccessible, malformed or unrelated live PID blocks installation. The driver checks the initial fingerprint again immediately before the ordinary installer, then verifies that both public shims exist. Cleanup restores the initial running/stopped state through the installed CLI and repeats native ownership checks before lifecycle mutations. A failed ownership probe does not authorize signaling a process.

The operator snapshot retains original file bytes and modes, including `.env.backup`, `models.json.bak`, overlays, theme and canvas state. `acceptance_common.py` owns byte/row comparison; `native-owner.py` owns the private native probe; `authenticated-dashboard.py` runs under installed Python and keeps the credential inside that process; `wheel-dashboard-server.py` owns browser asset serving. It uses SQLite's backup API, preserves all original user-table row multisets on the original columns, and distinguishes NULL, text, BLOB, integer and real values. New columns and additional rows are allowed. No `rowid` identity is assumed. Backups are retained for review; the driver does not reset configuration or automatically replace operator databases on a failure.

## Browser configuration and evidence

The source browser config and fixtures require `http://127.0.0.1:4178`. The driver refuses a listener on that port, launches its own ASGI child, and requires a unique readiness token. It serves `jev_gateway.dashboard.DashboardStatic` from the installed wheel's site-packages and compares all served files with the public wheel. It uses no Vite or npm build.

The source specs are copied into a private derived test directory. Their assertions are unchanged. Fixtures and UI translation source are reused through symlinks. One historical fixed screenshot path in `canvas-connections.spec.ts` is redirected to `browser-results/canvas-repaired-draft.png`; the replacement and source hashes are recorded in `derived-config.json`. The generated config imports the existing `frontend/node_modules/@playwright/test/index.mjs` by absolute URL. Source `fullyParallel`, `forbidOnly` and `retries: 0` policies are retained; the driver uses two workers by default, without test filters.

Both existing fixture families block unexpected origins and unmocked APIs. Service workers are blocked. Chromium disables background networking and external DNS resolution; the ASGI process denies outgoing socket connections. Any API request that escapes a fixture gets a 409 from the ASGI app and fails the final acceptance. Browser tests exercise synthetic API behavior; actual persistence, authentication and lifecycle are covered by the wheel smoke and installer driver. There are no generation or provider discovery requests from these drivers.

Durable browser evidence is under the selected work directory:

- `discovery.json`, `derived-config.json`, `served-wheel.json` and `escaped-api-requests.json`.
- `browser-results/results.json`, `browser-results/html/index.html`, and `browser-results/artifacts/` for test screenshots, contrast/geometry JSON, failure screenshots and retained failure traces.
- `browser-results/canvas-repaired-draft.png`, `playwright.log`, `asgi.log`, and `browser-result.json`.

A successful browser result requires exactly 118 executed cases, one passed result per case, zero retries, zero skipped cases and no escaped API traffic. The driver stops only the ASGI child it created. The separate isolated browser installation remains available for review; it has no managed gateway process. Once review is complete, its own `bin/jev --json uninstall` can remove that isolated tool while preserving its runtime data.

For preparation or collection without installing or starting a server, use a fresh directory:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 "$jev_acceptance_tools/public-wheel-browser.py" \
  --mode list --source-repo "$jev_acceptance_repo" \
  --work-dir "$jev_acceptance_evidence/browser-discovery-next"
```

`--mode prepare` generates the configuration only. Neither preparation mode needs a public asset manifest. `--mode run` refuses to proceed without a successful manifest and existing installed Python.

## Installed backend regressions

After browser acceptance, `installed-backend-regression.py` can reuse that isolated public installation. It adds pytest as acceptance tooling, copies the existing decision-matrix, routing-overlay, canvas-layout and gateway tests, and runs them with the installed Python under `-I`. Product imports must resolve to site-packages and match all public wheel files. Test assertions remain unchanged; the dashboard fixture uses installed assets instead of rebuilding. Socket connections and DNS resolution are disabled. Native results and package provenance remain private.

```bash
PYTHONDONTWRITEBYTECODE=1 python3 "$jev_acceptance_tools/installed-backend-regression.py" \
  --source-repo "$jev_acceptance_repo" \
  --installed-python "$jev_acceptance_evidence/public-browser-install/tools/jev-gateway/bin/python3" \
  --assets-manifest "$jev_public_manifest" \
  --work-dir "$jev_acceptance_evidence/public-installed-backend"
```

## Verification completed during preparation

Python syntax checks passed for all seven tools, and the three driver CLIs passed `--help` checks. `node --check` passed for the generated Playwright config. Discovery collected all 118 current browser tests with retries set to zero; evidence is in `.git/jev-release-011-acceptance/browser-discovery/`. The original source config and all ten spec hashes were rechecked; the private copy changes only the historical screenshot destination.

Synthetic database checks covered consistent backups, schema additions, additional rows, duplicate loss, NULL conversion and typed value hashes; evidence is in `.git/jev-release-011-acceptance/automation-selfcheck/`. Whole-package parity checks rejected changed Python bytes and stale package files while allowing generated caches. The installed credential loader passed synthetic export/interpolation checks. An intercepted transport verified Bearer headers on health, shell, JS and CSS requests and confirmed that probe stdout contains no credentials. Those checks blocked outbound sockets and started no server; their results are in the private `package-parity-selfcheck/`, `credential-loader-selfcheck/` and `authenticated-probe-selfcheck/` directories.

The preparation checks above are separate from actual execution. The replacement public download, complete package comparisons, authenticated isolated probes, 118 installed browser cases and 133 installed backend cases passed. Default-path 0.1.1 acceptance subsequently passed on the approved running baseline. Each report identifies its own commit, run, Release, wheel and data scope. Curated screenshots and geometry were reviewed before copying into `verification/final/`; original logs and failed attempts remain private. The operator recovery and preview reports retain their historical limits and are not rewritten as upgrade successes.

Public reference comparison is optional in the verifier CLI, but the command above supplies it. Omit it only if the report explicitly records the resulting static-source parity gap.
