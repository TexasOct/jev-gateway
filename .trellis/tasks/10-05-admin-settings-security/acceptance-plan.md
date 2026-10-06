# Settings and access security acceptance plan

Status: awaiting an integrated snapshot. This pass prepares acceptance only. No browser, backend, build or test commands have been executed, and no acceptance verdict is assigned.

The independent acceptance owner is this `tester` context (`accept-settings`), separate from implementer `admin-settings`. The parent must resume this same context to execute verification and write this child's `acceptance.md`. Implementer messages, screenshots and test claims can identify checks to repeat; they do not establish acceptance.

## Scope and sources

This child owns GS1-GS3 and the Settings portion of IA3-IA5. Shell mounting, admission, refresh and navigation are integration boundaries that must be verified in the integrated application. Supplier/model testing here checks removal of gateway editing and preservation of credential roles; their broader workflows belong to their own acceptance contexts.

Read sources for this plan:

- `prompt.md`, especially sections I, II and VII.
- Parent `../10-05-admin-experience/prd.md`, `design.md`, `implement.md` and `research/current-state.md`.
- Child `prd.md`, `design.md`, `implement.md`, `implement.jsonl`, `check.jsonl` and `task.json`.
- `.trellis/workflow.md`; backend spec index; `credential-configuration.md`, `dashboard-routing-config.md`, `quality-guidelines.md`, `provider-configuration.md`, `provider-identities.md`, `initialization.md` and `logging-guidelines.md` under `.trellis/spec/backend/`.
- `docs/credentials.md` and the gateway-credential/setup contracts in `docs/http-api.md`.
- Current form, manager, API client, navigation registry, shell, browser configuration and applicable test source. These are pre-integration observations and must be reread in the frozen snapshot.

The task explicitly requires failed saves to retain drafts in component memory. The older credential spec and browser tests describe clearing on submission/failure. Follow the source request and child requirement for acceptance; require the implementation owner to reconcile stale tests and documentation. Saved server secrets must still never be read back or prefilled. One-time setup remains separate from authenticated replacement: `/v1/setup` uses its existing 16-character minimum, while `/v1/gateway-credential` retains its own current validation contract. Do not infer that both endpoints have identical key constraints.

## Code boundaries

| Boundary | Source to inspect in the integrated snapshot | What this owner verifies |
| --- | --- | --- |
| F1: Settings presentation | `frontend/src/features/settings/AccessSecurity.tsx` or its final equivalent; `features/providers/GatewayCredentialForm.tsx`; both locale catalogs | Access/security grouping, credential roles, presence and unknown states, draft lifetime, local validation, busy/error/success copy and focus. The Settings section is not yet available as a complete integrated deliverable in this initial pass. |
| F2: Shared configuration manager | `frontend/src/features/providers/useProviderManagement.ts` | Configuration/revision reads, pending lock, `saveGatewayCredential`, failure classification, response receipt and subsequent catalog refresh. |
| F3: Transport authentication | `frontend/src/shared/api/client.ts`, API types and `setup-key.ts` | Module-memory credential, successful handover, GET-only retry after pending gateway writes, no automatic mutation replay. |
| F4: Shell and navigation | `frontend/src/app/App.tsx`, `AppShell.tsx`, connection/setup surfaces; `shared/navigation/unsaved-changes.ts` and `useUnsavedChanges.ts`; `GlobalDefaultModel.tsx` | Settings mount, absence in suppliers/models, admission, composed dirty guards, refresh and unload protection, continued access to appearance/default-model settings. |
| B1: HTTP authorization | `jev_gateway/gateway.py`: `require_gateway_key`, `require_config_write`, `gateway_bootstrap_available`, `require_gateway_credential_write`, setup and credential routes | Original-listener/peer/Host/Origin/proxy checks; configured-current-key checks; fixed safe errors; immediate activation. |
| B2: Managed persistence | `jev_gateway/provider_config.py`: safe projection and `gateway_credential`; `jev_gateway/credentials.py`, `jev_gateway/setup.py`, configuration locking/transaction owner | Stable gateway reference, effective source precedence, unchanged unrelated credentials/references, protected store/backups, revision and rollback. |
| B3: Real runtime and privacy | Existing credential/setup/provider/gateway tests and `tests/test_credential_live_server.py` | Real HTTP authentication, disk preservation, reload/restart, safe snapshots/logs/records and local-only transport evidence. |
| V1: Rendered design | Existing shared controls, stylesheet entry point, palette and Settings appearance/default model | Existing spacing/control/error conventions, localized labels, computed focus/overflow and accessible actions in both schemes. |

## Observable requirement matrix

Every row starts as NOT RUN. B denotes browser evidence with real clicks/keys; N denotes native browser confirmation, password and unload behavior; H denotes real backend/HTTP evidence. Command IDs refer to the execution section. Failure or unavailable evidence leaves the row open.

| Case / parent ID | Observable requirement and scenario | Source/code boundary | Evidence and commands | Failure or unknown condition to distinguish | Privacy, focus and narrow-screen coverage |
| --- | --- | --- | --- | --- | --- |
| S01 / GS1 | From General settings > Access and security, open the gateway editor and perform an authorized replacement. Supplier pages, both supplier kinds, model list, import and model Dialog contain no gateway editor. First-time setup remains usable in its admission flow. | `prompt.md` II; child goal; F1/F4 | B screenshots and accessible names; inspect rendered destinations and mount source. C1/C2/C5. | Missing mount or hidden editor blocks this row. A standalone setup success does not prove Settings editing. | Start saved inputs empty; keyboard navigation finds the Settings action; repeat Settings and negative-entry checks at 320px in both locales. |
| S02 / GS1 | Opening Settings, cancelling an empty editor, navigating through suppliers/models, refreshing and reopening do not rewrite or lose a previously saved key. Test synthetic JSON-backed and legacy `.env`/captured-environment keys with a nondefault declared reference. | Parent compatibility/migration; F4/B2 | H before/after private byte-and-mode comparisons; effective key check; existing Bearer still authorizes; provider/model IDs, strategy references and overlay unchanged. B reconnect/reopen. C3/C4/C5. | Any automatic migration write, reference rename, forced reentry to replace a saved key or lost effective presence fails. Browser connection memory loss on reload is expected and differs from server loss. | Output booleans/counts only, without credential bytes or secret digests; saved key never enters an input. |
| S03 / GS2 | Explain that the gateway key authenticates client access to JEV, upstream supplier credentials authenticate JEV's outbound calls, and the current Dashboard uses the same gateway Bearer. No separate Dashboard password or role system is implied. | `prompt.md` II; parent GS2; F1/F3/B1; `docs/credentials.md` | B inspect both locales' complete copy and labels. H reject a supplier key at a gateway-protected read; confirm gateway rotation leaves both upstream credentials unchanged. C2/C3/C5. | Ambiguous "management key" copy, claiming an independent Dashboard credential, or changing upstream credentials during gateway rotation fails. | No reference-name knowledge required for normal editing; long Chinese/English explanatory copy wraps at 320px. |
| S04 / GS2, IA4 | Show configured/unconfigured only after a successful safe projection. Configuration absent/loading/failed and an absent projection field remain explicit unknown/error states, with a visible retry when appropriate. | F1/F2; B2 projection; parent IA4 | B delayed/failed initial read, retry, complete unconfigured and complete configured snapshots. H check presence fields and response shapes. C2/C3/C5. | Null/failed read must not render a certified unconfigured state, actionable rotation with no revision, or stale success. Record whether cached presence is shown as stale while refreshing. | Password fields empty on every saved-form reopen; status/error reachable with keyboard and no horizontal page overflow. |
| S05 / GS3 | Preserve anonymous initialization eligibility and configured-key write guards. Exercise loopback allowed; public/original-nonloopback listener, remote peer, invalid/duplicate Host, mismatching/null Origin, and forwarding-header denials. Reloading file host cannot grant eligibility. | Credential/initialization specs; B1/F1/F4 | H ASGI matrix and actual loopback HTTP allowed/denied examples. B initial setup and denied-state guidance; Settings component bootstrapping capability if that state is reachable. C2/C3/C5. | `403 gateway_bootstrap_unavailable` differs from setup `403 setup_local_only`; provider/routing/canvas writes remain `403 config_writes_disabled` before initialization. A UI flag alone does not prove server eligibility. | No denied mutation changes bytes or runtime. Unreachable integrated Settings bootstrap state is documented and component coverage cannot substitute for the reachable setup flow. |
| S06 / GS3 | Replacement requires current Bearer; missing, wrong or supplier Bearer receives `401 invalid_api_key`. `/v1/setup` refuses a configured key. Invalid bodies, KEEP/CLEAR and shared gateway references cannot bypass authorization or mutate state. | B1/B2/F3; HTTP contract | H correct-current, absent, wrong, supplier and malformed-body requests; shared-reference guard. B forbidden/unauthorized feedback and reconnection. C2/C3/C5. | No gateway CLEAR; unauthorized handling removes connection access. Do not weaken the write guard to enable appearance preferences. | No secret in fixed errors; connection form remains password/empty; inaccessible business panels do not remain mounted after genuine unauthorized admission. |
| S07 / GS3 | Before replacement, explain immediate effect and that existing clients must adopt the new key. Save returns success only after commit; current Dashboard stays connected. Old key fails and new key works immediately, then after reload/restart. | Parent GS3; F1/F2/F3/B1/B2 | B warning before submission, success/status and continued navigation. H old/new `/healthz` and safe configuration reads, new runtime activation and persisted restart. C2/C3/C4/C5. | A pending response, `App.run()` resolution or write-receipt flag alone is not success. Failure must not advertise activation. | Submitted key clears after confirmed success; focus returns to the replacement trigger when the editor closes; no text disclosure in success copy. |
| S08 / GS3, IA4 | While rotation is pending, password/save/cancel and navigation/refresh cannot cause duplicate or overlapping writes. Read requests started with the old key may return `401` before the rotation response; delay unauthorized handling until the write settles, retry at most once with the new key. | F2/F3/F4; credential read-race contract | B deterministic barriers: start old-key GET, start rotation, return read `401`, hold write reply, verify connected shell, then release success and record retry headers/counts. Repeat with a failed pending write: normal unauthorized handling resumes, and the rejected new key is never installed or used for a retry. Also cover an old-key read returned after a completed rotation. C1/C2. | Genuine retry `401` must disconnect normally. No PUT/POST automatic replay. Pending or older successful configuration reads must not restore an old revision/presence after the saved response. | Retained retry draft stays masked and memory-only; disabled controls have readable saving feedback at 320px. |
| S09 / GS3, IA4 | Failed rotation retains the draft and current effective key. Cover invalid input/400, forbidden/403, revision conflict/409, transaction failure/500 and pre-commit network failure. Error explains the next action. | Child design; F1/F2/B1/B2 | B retain exact synthetic draft, edit/retry, absence of false success and no automatic write. H unchanged files, runtime and upstream credentials; safe errors. C2/C3/C5. | A genuine `401` must enforce reconnection even if the editor unmounts; record this security boundary separately from recoverable save failure. An interrupted response after commit has unknown outcome: refresh/reconcile before another user-authorized write. | Assertions compare input values privately; screenshots mask inputs; failed draft never enters browser storage, text, logs or URLs. |
| S10 / GS3, IA4 | Conflict refresh obtains the latest revision without losing a recoverable draft; retry uses that revision. Successful write followed by failed catalog refresh reports saved-with-refresh-failure and retries only reads. | F2/F3; provider spec committed-write distinction | B 409 -> refresh -> explicit retry; separate 200 write -> failed catalog read -> retry read. Count gateway writes. H stale revision leaves files/live state unchanged. C1/C2/C3/C5. | Do not repeat an already committed credential PUT for a downstream read failure. Old success notice clears when a new operation starts; configuration refresh error differs from save failure. | Draft keeps focus or a clear repair path; successful editor closes with empty next draft; refresh error/retry fits 320px. |
| S11 / IA5, GS3 | Cancel, Escape, navigation to every other destination and header refresh protect a dirty key draft. Declining discard preserves value/editor/view/focus; accepting clears it and performs the requested exit without a write. Empty draft dismissal closes without unnecessary confirmation. | Child dirty-navigation requirement; F1/F4/navigation registry | B real keyboard and click actions; N handle actual `window.confirm` when used. Verify Escape does not double-dismiss, repeated mount/unmount cleanup and global default-model guard composition. C1/C2. | A Settings guard cannot overwrite another registered guard or discard one draft before another veto. Pending write exit obeys S08. Window close/reload protection is separately tested in S12. | Focus returns to the originating trigger after local cancel; rejected exit returns to the relevant reachable control; reopen starts empty. |
| S12 / IA5 | Browser reload/close with a dirty or pending draft invokes the native unload protection. A native or custom discard modal used by Settings contains keyboard focus appropriately and returns it when dismissed. | F4 `beforeunload`; final dialog implementation | N actual browser `beforeunload`/confirmation with prior user gesture, cancel and accept; B Tab/Shift+Tab/Escape, focus return. C2/C5. | A dispatched synthetic event cannot prove the native prompt. If the gateway editor stays inline, focus trapping is not applicable to that inline form; still verify all actual dialogs/confirmations. Unsupported browser/tool evidence remains NOT VERIFIED. | Do not capture OS/browser screenshots containing entered secrets; native prompt behavior at desktop and 320px emulation, with any physical-device gap stated. |
| S13 / IA3, IA5 | Preserve existing Settings theme, control spacing, typography, error style and local assets. At desktop and 320px, English/Chinese and light/dark, reach all access/security controls and feedback without page overflow or header occlusion. | Parent IA3/IA5; dashboard style/focus contract; F1/F4/V1 | B screenshots plus computed bounding boxes, document scrollWidth, focus styles, settled colors and `elementFromPoint` at click targets. Use real Tab, Enter and Escape. C2/C5. | Screenshot alone does not establish keyboard/hit targets. Scripted automatic scrolling must not hide unreachable actions. Status/error small text meets the existing 4.5:1 target; record a failed measurement. | Check empty editor, dirty editor, busy, long failure and success states; permit normal vertical scrolling. Include 390px as a supplemental width and a short viewport for action access. |
| S14 / IA3, IA4 | Moving security controls leaves appearance preferences and global default-model settings usable with their existing independent permission boundaries. Theme may remain writable without a configured gateway key; provider/default-model/routing/canvas management stays guarded. | Dashboard theme spec; F4/V1/B1 | B Settings peer sections and pending/error isolation; H existing guards. Focused existing theme/default tests plus actual integrated view. C2/C3. | Gateway read/error/pending state must not blank the whole Settings page or confuse default-model writes with independent theme permissions. Cross-child failures are assigned to the owning implementer/integration. | Verify peer controls, localized labels and dirty-guard coexistence at 320px. |
| S15 / GS1-GS3, IA4-IA5 | Saved, entered, failed and cancelled keys remain absent from public responses, body text, URL, cookies, localStorage, sessionStorage, logs and records. Page reload loses only browser connection memory and reconnects with an empty password field; saved server key remains configured. | Parent compatibility; credential/dashboard/logging specs; F1-F4/B1-B3 | B runtime storage/cookie/URL scan, rendered text and reconnect. H safe read/success/failure responses, denied static credential paths, synthetic log/SQL scan and store/backup mode checks. C2/C3/C4/C5/C6. | Locale is the sole persisted preference. Response omission alone cannot prove storage privacy. Authorized write body/header and the protected fixture credential store necessarily contain the synthetic value; sanitize exported evidence. | Mask password locators in all screenshots and suppress input values in DOM dumps. Inspect images before marking visual rows complete. |

## Execution isolation and evidence identity

The parent supplies a stable integrated snapshot before verification. Record its HEAD, integrated dirty-source manifest/hashes, source requirement versions and any acceptance harness changes separately. A HEAD-only worktree is insufficient if integration is uncommitted. Capture a coherent copy including relevant untracked source, tests, lockfiles, specs and docs; verify the source manifest did not change during copying. Exclude operator runtime files, credentials, records, generated bundles and existing result caches. If no coherent snapshot can be established, leave acceptance blocked awaiting snapshot.

Use a private snapshot and task-specific evidence root, for example:

```bash
JEV_ACCEPT_ROOT=/tmp/jev-accept-admin-settings-security-SNAPSHOT_ID
JEV_ACCEPT_SNAPSHOT_DIR="$JEV_ACCEPT_ROOT/snapshot"
JEV_ACCEPT_EVIDENCE_DIR="$JEV_ACCEPT_ROOT/evidence"
JEV_BROWSER_PORT=43851
```

`SNAPSHOT_ID` is replaced with the recorded snapshot identifier. The port is this task's proposed preview port; verify availability before starting and allocate another task-specific free port if occupied. Keep `--strictPort` and `reuseExistingServer: false`; record the actual port and owned process. Do not reuse another task's browser context/server or the default shared preview port.

All commands below run from `JEV_ACCEPT_SNAPSHOT_DIR`, with private `frontend/node_modules`, `.venv`, `jev_gateway/static` and evidence directories. Do not symlink mutable dependency caches, result directories or the generated bundle back to the shared checkout. Current Vite builds use `../jev_gateway/static` with `emptyOutDir: true`; the isolated snapshot ensures that output belongs only to this task. `test:browser`, the pytest `dashboard_bundle` fixture, `scripts/build-frontend.sh` and packaging can all rewrite static output. Serialize them within this snapshot. No initial-pass command builds or tests in the current checkout.

The real gateway fixture uses a fresh dynamic loopback port and task-specific runtime home/state/logs. Record its URL, readiness and owned PIDs without exposing credentials. Its local upstream must remain a synthetic loopback service. Stop only processes created for this acceptance run. Private evidence artifacts may be produced during resumed verification; this initial pass writes only this plan.

## Commands and execution sequence

These commands are planned, not executed. Confirm final test names and selectors after integration. Use the project scripts and retain complete command output in the private evidence root, then summarize exit status and failures. No source/test edits by this acceptance owner are needed to prepare this plan. Missing coverage is executed with a temporary acceptance driver outside the checkout or returned to the implementer for test work.

1. C0, snapshot admission: compare manifest against integrated source; read final F1-F4/B1-B3; inspect the child delta and shell integration independently. Run `npm --prefix frontend install` and `uv sync --all-groups` only in the private snapshot when required. Record resolved versions. Ensure test collection never reads the operator's runtime home.
2. C1, focused unit/static checks:

```bash
npm --prefix frontend run lint
npm --prefix frontend run test -- src/shared/api/client.test.ts src/shared/navigation/unsaved-changes.test.ts src/features/settings src/app/AppShell.test.tsx
```

Also run the final gateway form/AccessSecurity unit files once their actual paths are known. Review assertions against S01-S15; a broad test count is not a requirement mapping.

3. C2, integrated synthetic browser checks, in the private snapshot with real browser actions:

```bash
JEV_BROWSER_PORT=43851 npm --prefix frontend run test:browser -- credential-configuration.spec.ts settings.spec.ts appearance.spec.ts global-default.spec.ts connection.spec.ts setup.spec.ts --workers=1 --output "$JEV_ACCEPT_EVIDENCE_DIR/browser"
```

Include the final Settings-specific spec if added. Inspect coverage and use a private browser driver for uncovered S01-S15 cases, especially recoverable failed drafts, delayed reads, dirty exits and presence unknowns. Use explicit request barriers and observable completion instead of fixed sleeps. Require a nonzero collected test count and account for all skipped tests.

4. C3, real ASGI/transaction checks:

```bash
uv run pytest -q tests/test_credentials.py tests/test_setup.py tests/test_provider_management_api.py tests/test_provider_config.py
```

Review/run the immediate bootstrap/rotation, untrusted bootstrap, original-listener-after-reload, malformed-body authorization, shared-reference/conflict/rollback, declared-key-loss and safe response/history/log cases. Observe disk/runtime assertions; ASGI transport does not prove real Fetch or native browser behavior.

5. C4, actual HTTP transport and persistence:

```bash
uv run pytest -q tests/test_credential_live_server.py
```

This local-only test supports credential resolution, transport separation, reload/restart and privacy. It does not establish the migrated Settings UI.

6. C5, live integrated Dashboard evidence: run the existing fixture under this snapshot's Python environment with a private home and state file:

```bash
uv run python -m tests.test_credential_live_server --home "$JEV_ACCEPT_EVIDENCE_DIR/live-runtime/home" --state "$JEV_ACCEPT_EVIDENCE_DIR/live-runtime/state.json"
```

Create the parent evidence directory first. Launch the fixture with a nonblocking process runner, wait for its state/readiness, and use its recorded URL for `JEV_CREDENTIAL_LIVE_URL` and home for `JEV_CREDENTIAL_LIVE_HOME`:

```bash
JEV_BROWSER_PORT=43851 JEV_CREDENTIAL_LIVE_URL="$JEV_ACCEPT_LIVE_URL" JEV_CREDENTIAL_LIVE_HOME="$JEV_ACCEPT_EVIDENCE_DIR/live-runtime/home" npm --prefix frontend run test:browser -- credential-live-server.spec.ts --workers=1 --output "$JEV_ACCEPT_EVIDENCE_DIR/live-browser"
```

Set `JEV_ACCEPT_LIVE_URL` from the fixture state file before this command. Run the final integrated test with zero environment skips.

The existing fixture starts unconfigured. Add private driver scenarios for an already configured custom reference in JSON, legacy dotenv and captured environment. Compare protected file bytes/modes before and after navigation/cancel; after authorized rotation, compare unrelated values, identity references and overlay bytes, check old/new HTTP authentication, then restart the synthetic runtime. Store the driver outside the checkout and identify its source hash. Use the real gateway-served Dashboard to verify production CSP/assets, not solely Vite preview. Never call a public generation service.

7. C6, completion checks required by project/parent, serialized in the private snapshot:

```bash
npm --prefix frontend run test
npm --prefix frontend run build
scripts/build-frontend.sh --check
uv run pytest -q
uvx pyright
uv build
```

Inspect packaged shell/assets when the moved Settings surface depends on packaging. The parent owns final package parity and full-suite integration acceptance; this owner records independently executed checks and any supplied supporting result with its snapshot identity. Broad failures are classified from evidence and assigned to the owner, never called historical solely from a log. Checks on a different source snapshot do not close this child's rows.

## Planned evidence and decision rules

For each S-row, the later `acceptance.md` records requirement ID, snapshot/source location, independently executed scenario, command/result, observable assertions, sanitized evidence path and remaining gap. Store screenshots with task/case/locale/scheme/width names and inspect the actual images. Save request timing/status/counts with authorization represented as old/new/absent labels; never export raw key headers or bodies. Private raw traces/HAR can contain typed passwords or write payloads, so disable them or keep them private and export sanitized evidence only.

Privacy assertions scan synthetic values in all relevant public surfaces and compare fixture bytes without printing contents. Protected credential files/backups are intentional private storage, with modes checked. Do not search, copy or replay operator secrets.

Use NOT RUN until execution; NOT VERIFIED for unavailable evidence; REWORK for a reproduced product defect; BLOCKED_DECISION when a required contract or snapshot decision prevents verification. PASS is eligible only after every required child row has integrated evidence, key migration/preservation and actual HTTP activation are verified, failure/race/dirty/focus/320px cases are covered, screenshots are inspected and unresolved relevant defects are closed. A developer's green checks or a skipped live test cannot grant PASS.

Product fixes return to `admin-settings` or the relevant integration/backend owner. After a fix, the parent resumes this acceptance context, supplies the new coherent snapshot, and this owner reruns affected cases and supporting gates. Rework does not reset responsibility to a new reviewer context.

## Initial-pass status

The source request, parent/child artifacts and applicable credential/dashboard/quality contracts have been read independently. Existing browser test source still locates gateway editing in the supplier page and asserts clearing submitted/failed drafts; those expectations require reassessment against the integrated task behavior. The shared worktree is changing during implementation, so source inspected during planning is not a stable acceptance snapshot.

Only `acceptance-plan.md` is produced by this pass. `acceptance.md`, browser/runtime evidence and a verdict await the integrated snapshot and resumption of this same acceptance context.
