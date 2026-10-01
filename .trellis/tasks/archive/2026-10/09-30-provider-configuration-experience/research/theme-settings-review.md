# Theme Settings independent review

PASS for the authorized R11 / AC11-AC13 follow-up. No unresolved implementation issue was found in this scope. Full project gates and package rebuilding remain owned by the main session.

## Scope and source review

Read the parent check manifest and all its referenced files, the PRD, technical design, implementation plan, acceptance record and theme implementation evidence. Read the entire dashboard-routing specification from disk, including the content beyond the injection limit. Applied the trellis-check and humanizer instructions.

Compared current files with the supplied `jev-theme-before-h65wvdwy` snapshot. Its 24 files cover the relevant source, documentation, palette, styles, theme hook and mock API. The backend follow-up is exactly two authorization call-site changes in theme PUT/DELETE. Canvas PUT still calls `require_write`; the composition root still supplies the unchanged `require_config_write`, and Provider commands and routing writes retain that guard. Unrelated HEAD differences belong to the existing dirty worktree and were not treated as this follow-up. AppShell.test.tsx is absent from the supplied snapshot; its complete current body was reviewed, but its prior one-field removal cannot be independently attributed from that snapshot.

Read the complete changed Appearance, App, AppShell, unit-test and browser-test bodies, the relevant gateway test functions and theme handlers, and the complete unchanged theme hook. No `writeDisabled` reference remains in App or Appearance. The routing editor continues consuming its configuration and Provider continues consuming its own management capability. Palette, all nine style files, theme hook and mock API are byte-identical to the snapshot. Dashboard CSP is unchanged with the rest of dashboard.py outside the two authorization calls.

## Behavior and coverage

- AC11: no-key theme PUT/GET/DELETE persists and resets the seed. The regression uses real temporary SQLite storage with a nonzero initial config-version count and asserts unchanged policy snapshot/hash, version count, baseline and overlay bytes. Configured-key missing/wrong PUT and DELETE return 401 without changing theme bytes. Existing canvas, routing and Provider guard cases remain passing.
- AC12: three 36px presets and the native custom input retain localized names/titles and keyboard access. Presets use `aria-pressed`; a non-preset normalized seed selects the custom outer ring. The custom label contains one input and decorative Pencil, with no nested button or additional focus stop. Its rainbow background and separated ring use existing utilities. Loading or pending disables the controls.
- AC13: `onInput` changes only pickerDraft; the native change listener commits through the existing save callback. The unchanged hook supplies synchronous pending protection, read generations, scoped error/notice handling and queued writes. Reviewed browser tests separately dispatch input/change, assert zero preview PUTs and one committed PUT, and cover stale reads, pending re-entry, failure/retry and 401 reconnection. The matrix checks preset/custom states, computed geometry, ring shadows, keyboard focus and overflow in en/zh-CN, light/dark, and 1280x900, 1430x2511, 390x820 and 320x820.

Installed `react`, `react-dom` and `@types/react` are all 19.3.0. The actual RefCallback type accepts a cleanup return. Installed React DOM's commitAttachRef stores refCleanup; safelyDetachRef executes and clears it. StrictMode's disappear/reappear layout cycle detaches and attaches refs through those paths. The callback uses the same listener identity for add/remove; a callback dependency change cleans up before rebinding. A focused execution of the extracted actual bindPicker body with EventTarget verified zero input writes, one change write after cleanup/rebind, no disabled write and no detached listener. This supports the source review; it is not a separate rendered development-StrictMode browser test.

## Mechanical documentation corrections

Two local prose fixes were made during review:

- docs/http-api.md previously said canvas writes shared theme's configured-key guard. It now says routing writes, consistent with the theme exception and the actual handlers.
- The new dashboard spec row previously described any theme write failure as `500 theme_write_failed`. It now specifies theme PUT failing during atomic replacement. DELETE's existing remove helper does not provide that custom error mapping.

No product code or tests were changed by this review. The resulting theme authorization and visual documentation agree with the inspected source. Existing reset I/O handling was preserved.

## Independent verification

All executed commands exited 0:

```bash
PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true uv run pytest -q tests/test_gateway.py tests/test_provider_management_api.py -k 'dashboard_theme or canvas_layout or writes_require or auth or every_command_requires_gateway_key'
# 14 passed, 79 deselected

PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true uvx pyright jev_gateway/dashboard.py tests/test_gateway.py
# 0 errors, 0 warnings, 0 informations

cd frontend && ./node_modules/.bin/vitest run src/features/appearance/AppearanceView.test.tsx src/app/AppShell.test.tsx
# 2 files, 5 tests passed
```

Active LSP probes of AppearanceView.tsx, App.tsx and AppShell.tsx reported no errors or warnings. They returned three existing FormEvent deprecation hints and one auxiliary inline-style hint for the data-derived preset background, which the dashboard spec permits. Scoped `git diff --check` passed after the prose fixes.

The implementation owner's evidence reports 12 passing focused Chromium browser cases and four retained screenshots. Their test bodies and evidence were reviewed here; screenshots were already visually accepted by main. This reviewer did not start a server, rerun browser/build/full suites or rebuild packages. Native OS dialogs and other browser engines remain unautomated. Full lint, frontend/browser/backend gates, final visual acceptance and bundle/package parity remain with main.

No real upstream request, operator .env/models.json read, older private snapshot access, subagent/workflow dispatch, commit, archive, task-pointer or state change was performed. The review adds this evidence file and the two documentation corrections only.
