# Routing preview reset fix

Reset changed `configuration.config_hash`, remounted `RoutingEditor`, and cleared its local information disclosure state. The installed acceptance failures remain recorded in the existing public browser reports.

`AppShell.tsx` now mounts a local `RoutingWorkspace` component that owns only information disclosure state. It returns the keyed editor directly without adding DOM. The configuration-hash key still resets drafts, inspector selection and gesture state. Navigation or authentication unmounts the workspace and clears disclosure state.

`RoutingEditor.tsx` accepts optional `informationOpen` and `onInformationOpenChange` props. Its callback updates the local fallback and informs the parent. Direct callers retain local state. Successful apply closes information before requesting configuration reload. Reset leaves disclosure open through reload.

The existing browser regression retains all assertions. After apply it waits for the workspace's `data-policy-draft` to become `unchanged`. After reset it waits for the fallback canvas node to contain the restored baseline label `default`, then checks the original Configured route caption. This verifies the reloaded policy reached the canvas.

All requested source gates passed: lint; 233 unit tests across 33 files; frontend typecheck and build; browser TypeScript; 118 browser tests with retries 0 and workers 2; bundle freshness. The full browser run took 53.35 seconds. Browser fixtures use synthetic API scenarios and a private loopback Vite preview.

Native logs, browser artifacts, gate command results, exact changed-file hashes and a 120-file frontend source/test manifest are retained in `.git/jev-release-011-acceptance/preview-fix-20261003-220024/` (directory mode 0700). The manifest SHA256 is `12f6dbe325a0647c86ca0ff7b3289de65051085f44b737d0d4cc079c6dcb7c20`. Sanitized gate results and changed-source hashes are in `verification/preview-fix-gates.json`.

Existing workspace journal/index files and both public failure reports were checked against private preservation hashes and remain unchanged. No CSS, schema, routing algorithm, version or dependency files changed. No operator service, tag or Release was changed, and no real upstream request was sent. This run verifies the corrected source bundle; the published wheel still contains the earlier source and requires a separate publication and installed acceptance cycle.
