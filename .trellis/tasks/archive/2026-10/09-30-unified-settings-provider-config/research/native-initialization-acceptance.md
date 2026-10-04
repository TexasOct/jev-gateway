# Native initialization browser acceptance

This run predates the source/stream and configured-path rework. Its recorded
hashes and 75 main checks remain evidence for that snapshot. The corrected
backend and rebuilt dashboard require the separate post-rework native run;
current synthetic and installed-wheel gates are recorded in
`post-rework-gates.md`.

Passed the covered initialization and global-default flow against a newly launched, isolated current Python backend and the existing built `jev_gateway/static` frontend. Verification and process cleanup finished before this report was written on 2026-10-02. The main run completed 75 checks; separate fresh runtimes passed native setup and reconnect at both 16 and 8192 ASCII characters.

## Scope and isolation

The main run used `http://127.0.0.1:50070`, Python 3.14.7 from the repository `.venv`, and installed Node Playwright 1.63.0 with headless Chromium. `initialize_configuration` copied the actual packaged templates into a new protected runtime; `load_gateway_config` received its explicit private `models.json` path. The unused module-level application's record owner was closed before the served application loaded that path. Initial providers, models and decision-provider instances were empty; credential-file mode remained `0600`.

Browser Fetch, TCP HTTP, Uvicorn, ASGI routes, configuration validation/transactions, live routing, SQLite retention and packaged dashboard rendering were real. Browser interception only allowed the owned origin and continued those requests without fulfillment. A Python socket audit blocked non-loopback DNS/connections. LiteLLM's `completion` function alone was replaced inside the private factory with the response shape from `tests/test_gateway.py::install_completion`; the real LiteLLM provider registry remained installed. One synthetic local chat created the retained row. This proves local routing and evidence behavior with a fake generation transport; it does not prove upstream generation or discovery connectivity.

Child environments were constructed from an allowlist with private `HOME` and `JEV_GATEWAY_HOME`, `PYTHON_DOTENV_DISABLED=1`, and `LITELLM_LOCAL_MODEL_COST_MAP=true`. They inherited no operator credentials or proxy settings. There were zero external browser attempts, external backend attempts, discovery requests or public metadata requests. Root ignored configuration, `~/.jev-gateway`, and the expired process at `127.0.0.1:51675` were not used. No CLI operator-state calls, source edits, rebuilds, commits or publication were performed. The parent's full local pipeline was not rerun or claimed as this agent's verification.

## Completed checks

| Behavior | Real result |
| --- | --- |
| First run | `#setup-key` rendered in English and Chinese at 1280×900 and 320×900. No page-level horizontal overflow. |
| Invalid keys | Native UI rejected leading/trailing space, Unicode, tab control and short values before POST. Real HTTP rejected outer space, Unicode, control, short and 8193-character values with 400; private configuration/credential/overlay bytes stayed unchanged. |
| Bootstrap and guards | Native Fetch setup with a 39-character ASCII key entered the empty console and authenticated subsequent reads with the canonical header. Separate 16- and 8192-character keys also completed native setup and padded reconnect. Stale/repeated setup returned 409 without writes; pre-setup configuration write returned 403; configured missing/wrong credentials returned 401 without writes. |
| Optional onboarding | Progress linked to Provider and could be deferred to Monitoring. Empty Settings linked to Provider. Empty catalog preview/chat returned `503 setup_incomplete`; provider-only preview remained 503 and `/healthz` remained `ok`. Completion count was zero. |
| Provider and model | Actual UI created `native-synthetic` with `https://acceptance.invalid/v1` and a fake write-only credential, then saved it with no models. Actual UI manually added `acceptance-model`, entered every required price/capability/limit/effort field, explicitly confirmed metadata, and imported it. Stored fields were manually confirmed; tags stayed empty. No programmatic replacement of these stages occurred. |
| Global default | Exactly one Settings selector, `#settings-default-model`, saved `native-synthetic/acceptance-model`. A second real local client advanced the revision: stale UI validation returned 409, preserved the draft/files and prevented PUT; reloading current configuration allowed UI save. Setup returned `routing_ready=true`, `next_step=ready`. |
| Strategy inheritance | Real API previews for `task_aware`, `quality` and `economy` selected the exact imported global model with label `default` and `empty_tag_default` reason. The matrix reason was `decision_matrix:local:fallback:empty_tag_default`. No per-strategy default-model control appeared. Preview completion count stayed zero. |
| Clear and reselect | Clearing through Settings restored optional routing progress and controlled 503. The progress link reopened Settings; selecting and saving the model restored readiness. Errors invoked no completion. |
| Retained Default/默认 | One local synthetic chat returned route/model headers for the imported model and both final label/task-type `default`. SQLite request evidence and the live session retained that label. Actual Monitoring session selection and retained trace rendered Default/默认 in both locales at both widths. Total fake completion calls: exactly one. |
| Reload, privacy and layouts | Every reload displayed Connect and removed module-memory authorization. Padded canonical keys reconnected through native Fetch. Settings, Provider, Strategy and Monitoring passed page-overflow checks at both widths/locales. Browser localStorage held only validated `jev-dashboard-locale`; sessionStorage and cookies were empty. Credentials were absent from URLs and persisted browser state. |

## Skipped and limited coverage

The packaged frontend has no control submitting `/v1/routing/preview`. Source inspection and the actual Strategy workspace control inventory confirm this gap. API previews were supplemental; no UI routing-preview click or preview-result localization is claimed. Default/默认 localization was verified through the actual retained Monitoring session and route trace.

The initialized file-backed application reports `write_available=true`. Settings read-only presentation and persistence/read-failure UI were not forced through mocked responses, permission changes or catalog replacement. Real stale-revision and authorization failures were covered. Release-wheel installation, Python 3.12 release gates, reload/restart lifecycle acceptance and publication remain outside this browser run.

Five preliminary attempts failed because of acceptance-harness issues: incomplete LiteLLM module substitution, Provider selector matching, and a boundary-test response-observation race. The harness was corrected, then the full flow and both boundaries passed from new clean runtimes. No product change or product-defect claim resulted from those attempts; their logs remain retained.

## Hashes, evidence and cleanup

SHA-256 manifests contain 171 source/test/template/build-input files and all four static files. Before/after manifests matched, and the current source/static files were checked again after the final successful runs. Tree digests hash sorted `path`, NUL, file digest and newline records.

| Content | SHA-256 |
| --- | --- |
| Source tree | `358b2a401e4bcf085928a62b6d68ff11a128fed42ef0788f111dddccd523bbdf` |
| Static tree | `8f25c4236a70d464427e7f41b2db987b2f015816f528d9d78b83c17d6a147702` |
| Static index.html | `50219d8ed60fcfad3014dfec63ca85e8feacad72efa6aa070595136a5e9e8256` |
| index-BN0-h1Vg.js | `c3f7454633f476b514818e1113e465dd9e965cec3989ce99f5b96ee712d531fb` |
| index-BCS_oWlt.css | `e5461167cc71c9bc1fa6d8559a83210a7cab3aada12144d3a45f1fd09f0311a7` |

Evidence root: `/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/native-final/`.

- Full run: `run-20261002T094159Z/`. See `browser-result.json`, `network-sanitized.json`, `api-previews.json`, `synthetic-chat-headers.json`, `retained-session.json`, `live-session.json`, `server-events.jsonl`, and the before/after hash manifests.
- Key boundaries: `run-20261002T094513Z-key-16/` and `run-20261002T094513Z-key-8192/`; each has completed browser/network/cleanup evidence.
- Targeted screenshots: the full run's `screenshots/01-first-run-*.png`, `05-manual-model-confirmed.png`, `06-settings-default-ready.png`, `07-settings-*.png`, and `10-trace-*.png`. Password fields were masked. First-run Chinese 320px, saved default, narrow Chinese Settings, and both trace labels were visually inspected.
- Final audit: `final-audit.json`. It scanned 101 retained text artifacts against this run's synthetic credentials and found zero leaks. Every started browser context/browser was closed; all owned server and runner PIDs exited and all eight attempt ports were closed. The successful main app used PID 72203; boundary apps used PIDs 38358 and 38357. The expired onboarding process was untouched.
- Reusable scripts: `run_acceptance.py`, `private_app.py`, `acceptance.cjs`, `key_boundaries.cjs`, and `audit_evidence.py`.

Reproduce the full flow with `.venv/bin/python /Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/native-final/run_acceptance.py`. For boundary runs, append the repository's absolute path and `16` or `8192`. Run `audit_evidence.py` with the same interpreter after all runs finish. Each invocation creates a new owned runtime and cleans up its processes.
