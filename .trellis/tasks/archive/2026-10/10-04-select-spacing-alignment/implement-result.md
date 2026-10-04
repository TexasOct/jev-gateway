Implemented and verified in `/Users/texas/Workspace/jev-select-spacing-alignment` only. No shared product edits, branch switches, staging, commits, publication, live gateway requests or installed-service changes were performed.

Changed product files:

- `frontend/src/styles/base.css`: shared native single-select defaults use two foreground-colored CSS gradients for a 10px chevron, reserve 32px of right padding, and place the arrow 12px from the background positioning area's right edge. Controls without size, size 0, and size 1 receive the defaults; multiple and listbox controls retain native appearance. Forced colors restores native appearance and removes the gradients.
- `frontend/src/features/providers/ProviderView.tsx`: adds `items-start` to the main field grid.
- `frontend/tests/browser/select-controls.spec.ts`: adds 20 viewport/locale/scheme combinations, each measuring both Provider kinds, plus one keyboard/focus/disabled/listbox/forced-colors test. The fixture intercepts all non-GET API requests and asserts no saves, validation or discovery calls.

Evidence is in `verification/`: native logs, JSON reporters, before/after geometry, per-test PNGs, alternate-port configuration, pixel measurement script and pixel results. `install.log` records dependency installation. The config launches its own strict preview server on 4197 and refuses reuse. A timed-out preliminary baseline run left its own preview child behind; its absolute command and parent PID were checked before terminating only that child and its npm parent. Later runs exited normally.

Baseline: 20 passed, one interaction test intentionally skipped. At 1701px, English/light LLM select top was 372px and height 68px; endpoint top was 348px and height 44px. The decision pair was already 348px/44px. Baseline single-select appearance was auto with 12px right padding and no background image. The before JSON retains all combinations.

Final browser run: 64 passed, zero failed/skipped/flaky (21 new select checks and 43 existing Provider checks). At 1280, 1701 and 1920px, both Provider kinds have 44px controls and zero top/height difference in both locales and palettes. All five widths have no document overflow. Computed single-select padding is 32px; gradient foreground follows the current palette. Keyboard typeahead changes transport and credential action through real key events, retains focus, and reveals the credential input. Disabled controls are skipped by Tab. Multiple/listbox and forced-colors checks pass. Native typeahead is reset by moving focus between choices to avoid Chromium's accumulated search buffer.

The PNG parser measures the actual rendered chevron against the control background. All 24 wide-screen select images have at least 12.5px right inset and at most 0.5px vertical center difference. Direct screenshot display is unavailable; these results establish computed and pixel geometry, not a human visual review. No private reference screenshot or OCR identifiers were copied or uploaded.

Commands run from the isolated checkout (all passed unless noted):

```sh
npm --prefix /Users/texas/Workspace/jev-select-spacing-alignment/frontend install
npm --prefix /Users/texas/Workspace/jev-select-spacing-alignment/frontend run build
npm --prefix /Users/texas/Workspace/jev-select-spacing-alignment/frontend run lint
npm --prefix /Users/texas/Workspace/jev-select-spacing-alignment/frontend run test
/Users/texas/Workspace/jev-select-spacing-alignment/frontend/node_modules/.bin/tsc -p /Users/texas/Workspace/jev-select-spacing-alignment/frontend/tests/tsconfig.json
/Users/texas/Workspace/jev-select-spacing-alignment/scripts/build-frontend.sh --check
SELECT_CAPTURE_BEFORE=1 /Users/texas/Workspace/jev-select-spacing-alignment/frontend/node_modules/.bin/playwright test -c /Users/texas/Workspace/jev-select-spacing-alignment/.trellis/tasks/10-04-select-spacing-alignment/verification/playwright.config.ts select-controls.spec.ts
/Users/texas/Workspace/jev-select-spacing-alignment/frontend/node_modules/.bin/playwright test -c /Users/texas/Workspace/jev-select-spacing-alignment/.trellis/tasks/10-04-select-spacing-alignment/verification/playwright.config.ts select-controls.spec.ts provider-management.spec.ts
python3 /Users/texas/Workspace/jev-select-spacing-alignment/.trellis/tasks/10-04-select-spacing-alignment/verification/measure-pixels.py
```

Unit count: 33 files, 233 tests. Production build includes `tsc --noEmit`; bundle freshness passes. Vite retains the existing large-chunk advisory. An extra run including `appearance.spec.ts` had 64 passes and six failures because its separate fixture hardcodes origin 4178 and blocks the owned alternate origin before loading the page. This limitation is retained in `appearance-alternate-port-limitation.log`; the final scoped run excludes that incompatible suite.

The independent final check, spec update, shared-hunk integration, commit and archival belong to the parent session. Generated static assets remain ignored. No dependencies, lockfile, API contracts or callbacks changed.
