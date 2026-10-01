# Theme Settings implementation evidence

Implemented the authorized R11 changes. Theme PUT/DELETE now use the same gateway authorization as GET: no configured key permits theme writes, while a configured key still rejects missing/wrong Bearer. The backend diff against the supplied pre-edit snapshot contains exactly those two call-site changes. Canvas, Provider and routing write guards are unchanged.

Appearance uses three 36px preset circles with separated accent rings, without a central tick or black selected border. The custom control is a fourth 36px multicolor circle with decorative Lucide Pencil, native color input, localized accessible name/title, one keyboard stop and visible focus. A non-preset seed selects its outer ring. Loading/pending disables color controls. Removed the Appearance writeDisabled prop/warning and, under the later explicit authorization, the unused AppShell prop, App-only variable/argument and shell test fixture field.

Separating browser input and change dispatch exposed React's synthetic color-input onChange firing during native input previews. Appearance now installs a native change listener through a cleanup-returning callback ref; onInput updates only the local draft, and native change commits once. The theme hook and its race/pending guards are unchanged. A failed preset write retains the existing optimistic preview, while the saved mock seed remains unchanged; Settings re-entry restores the stored value and retry succeeds.

## Final focused verification

All commands below exited 0 on the final code:

```bash
PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true uv run pytest -q tests/test_gateway.py tests/test_provider_management_api.py -k 'dashboard_theme or canvas_layout or writes_require or auth or every_command_requires_gateway_key'
# 14 passed, 79 deselected

PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true uvx pyright jev_gateway/dashboard.py tests/test_gateway.py
# 0 errors, 0 warnings, 0 informations

cd frontend && ./node_modules/.bin/vitest run src/features/appearance/AppearanceView.test.tsx src/app/AppShell.test.tsx
# 2 files, 5 tests passed

npm --prefix frontend run lint
# 0 errors; 4 existing Fast Refresh warnings in shared/i18n/index.tsx

npm --prefix frontend run test:browser -- tests/browser/appearance.spec.ts tests/browser/settings.spec.ts
# Production frontend TypeScript/build and browser TypeScript succeeded.
# 12 browser cases passed. Build retains the existing >500 kB chunk warning.
```

The initial npm unit-script invocation also ran all 210 units because the script already includes `src`; this happened before the main session requested focused-only final verification. The final post-cleanup unit invocation above ran only the two owned test files. No full backend/browser gates or Python package build were run.

Gateway coverage proves no-key PUT/GET/DELETE persistence/reset, unchanged real SQLite config-version count (initially nonzero), policy snapshot/hash and baseline/overlay bytes, configured-key PUT/DELETE denial without file changes, and existing canvas/routing/Provider protection. Fixtures use temporary files and fake credentials.

Browser coverage proves successful theme writing with configuration writes unavailable and Add provider/Add rule/Reset to baseline disabled; input-only previews perform no PUT, change performs one PUT and reload preserves the custom seed. Existing stale-read, pending/re-entry, read retry and 401/reconnection checks pass, alongside the added 500/retry case. Computed styles verify four 36×36 circles, circular radii, zero preset border, separated 2px/4px selected ring shadows, unselected preset absence of shadow, native custom gradient, Pencil/no tick and visible keyboard focus. Preset/custom states and overflow were checked at 1280×900, 1430×2511, 390×820 and 320×820 in both locales and schemes.

## Screenshots

These retained screenshots come from the final passing isolated mock-API browser run. Keyboard focus was verified before capture, then blurred so these images show selection alone:

- [Desktop English light, preset selected](theme-settings-screenshots/desktop-en-light.png)
- [Desktop English light, custom selected](theme-settings-screenshots/desktop-custom-en-light.png)
- [320px Chinese dark, preset selected](theme-settings-screenshots/320px-zh-CN-dark.png)
- [320px Chinese dark, custom selected](theme-settings-screenshots/320px-custom-zh-CN-dark.png)

Other matrix screenshots remain under `frontend/node_modules/.cache/playwright-results/`. The retained images above survive replacement of that browser output directory. Images were opened for inspection; the main session owns final visual acceptance.

## Scope and limitations

No real gateway/upstream was contacted. The browser fixtures retain their same-origin/unexpected-request and allowed-write guards. Native event handling was checked in Chromium with separate input/change dispatch; operating-system picker dialogs and other browser engines were not automated. No operator `.env`, actual models.json or older private snapshot was read. Generated static output remains ignored. Main-owned docs/spec/design/task artifacts were not edited. No commits, archives, task-pointer/state changes or subagents/workflows were used.

Playwright stopped its isolated preview server. Final `lsof -nP -iTCP:4178 -sTCP:LISTEN` returned no listener. Full project gates and Python packaging remain with the main session.
