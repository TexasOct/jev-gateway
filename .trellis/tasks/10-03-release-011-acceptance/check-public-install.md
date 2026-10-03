# Public installed acceptance

The assigned installed acceptance passed against the public v0.1.1 artifacts. The wheel smoke exited 0 with 59 checks and `success: true`. The isolated installer retry exited 0 with 23 checks, `success: true` and `cleanup_success: true`. The first installer attempt remains recorded as a failure.

| Execution | Native exit | Result | Checks |
| --- | --- | --- | --- |
| Public wheel smoke | 0 | Passed | 59 |
| Isolated installer, original attempt | 1 | Private provenance-driver defect; cleanup passed | 2 |
| Isolated installer, fresh retry | 0 | Passed; cleanup passed | 23 |

The verified wheel SHA256 is `7fd6f8a5130325df80505d7a85f2dd01c53b7b0a76bbe4b17a961bf0534b061f`. The installer SHA256 is `bbd06b07d7e8f5ead47540bc4d52c2dc24a524eb850911f12682d1ba28e56cd5`. Both downloaded files still match the successful public-assets manifest. The installer retry observed the exact wheel SHA256 before each of its three uv installation invocations; all three public installer commands exited 0. All 52 installed package files matched the downloaded wheel byte for byte before uninstall.

The wheel smoke covered managed Python 3.12, installed identity, a recorded runtime home containing spaces, isolated file operations, background and foreground startup, proxy-independent readiness, SQLite integrity/schema, bundled dashboard assets, authenticated provider and routing API writes, running/stopped update behavior, and uninstall preservation. The isolated installer retry covered actual execution of the downloaded public script, authenticated health and dashboard assets, explicit restart, running/stopped reinstalls, foreground startup outside the checkout, and uninstall preview/removal/preservation.

The installer preserved seven protected files, including configuration, credentials and their backups, routing overlay, theme and canvas state. Credential files retained mode `0600`. SQLite integrity remained `ok`; the original configuration-version row remained present. The five other observed tables were empty before and after. These checks cover the synthetic isolated runtime. Existing operator history and default-path upgrade preservation require their separate acceptance.

The first installer attempt failed at `installer installed the verified public wheel SHA256`, after the public installer itself exited 0. Installed `direct_url.json` used a local file URL with an empty `archive_info`; uv had not recorded an archive hash. Independent inspection found version 0.1.1, the expected pinned public source in install state, and exact parity for all 52 package files. This reproduced an invalid assumption in the private acceptance driver. The original directory, native log, native exit and failure result remain at `/Users/texas/Workspace/jev-llmroute-test/.git/jev-release-011-acceptance/public-installer-isolated` and its adjacent capture files. Its isolated service is stopped, and its installation remains available for inspection.

The harness repair is limited to isolated acceptance in [public-installed-acceptance.py](verification/tools/public-installed-acceptance.py) and [verified-installer-uv.py](verification/tools/verified-installer-uv.py). A private PATH observer verifies and records the actual local wheel bytes immediately before forwarding the original arguments to the real uv executable. The driver joins that input path to the installed file URL when uv omits an archive hash. A recorded hash must still match when present, and full package-file comparison remains required. No product code or repository tests were changed by this worker. Syntax checks passed for both changed Python files. Three private checks proved unchanged argument forwarding, rejection of changed wheel bytes before invoking uv, and unchanged forwarding of non-install commands.

Actual smoke command:

```bash
PYTHONDONTWRITEBYTECODE=1 /Users/texas/Workspace/jev-llmroute-test/.venv/bin/python3 \
  /Users/texas/Workspace/jev-llmroute-test/scripts/smoke-installed-release.py \
  --wheel /Users/texas/Workspace/jev-llmroute-test/.git/jev-release-011-acceptance/public-download/public-assets/jev_gateway-0.1.1-py3-none-any.whl \
  --version 0.1.1 \
  --work-dir /Users/texas/Workspace/jev-llmroute-test/.git/jev-release-011-acceptance/public-wheel-smoke
```

Both installer attempts used this command. The original attempt used `public-installer-isolated` as its work-directory name; the fresh successful retry used the path shown below:

```bash
PYTHONDONTWRITEBYTECODE=1 /Users/texas/Workspace/jev-llmroute-test/.venv/bin/python3 \
  /Users/texas/Workspace/jev-llmroute-test/.trellis/tasks/10-03-release-011-acceptance/verification/tools/public-installed-acceptance.py \
  --scope isolated --version 0.1.1 \
  --assets-manifest /Users/texas/Workspace/jev-llmroute-test/.git/jev-release-011-acceptance/public-download/public-assets-result.json \
  --work-dir /Users/texas/Workspace/jev-llmroute-test/.git/jev-release-011-acceptance/public-installer-isolated-retry-1
```

[public-install-results.json](verification/public-install-results.json) contains sanitized results, all retry check labels, preservation counts, timestamps, evidence locations and SHA256 values for the native records and result files. Raw logs, installations, synthetic runtime files, SQLite backups and observer input paths remain private under `.git/jev-release-011-acceptance/`. The private root has mode `0700`; all three native logs have mode `0600`.

Postflight found no remaining gateway or foreground process for any of these three acceptance directories and no owned PID records. Both successful runtime databases passed integrity checks and contained zero generation-request, upstream-request and outcome rows. The smoke script and the two pre-existing journal files retained their original hashes. Other workers updated task planning/spec artifacts during execution; this worker did not edit those files.

This assignment made no operator/default installation or service changes and ran no main/browser suites. It made no commits, pushes, tag changes or Release changes. Browser, operator-upgrade and final release approval remain with their assigned owners. The private provenance observer was enabled and verified for isolated scope only.
