# E1 human interaction handoff

## Current result: operator manual PASS

On 2026-10-11, the operator replied "验收通过" after the scenario explanation and
the live interactive page at `http://127.0.0.1:4198/dashboard/tests/browser/e1-manual.html`.
This explicit confirmation closes E1 through operator manual acceptance. The
source/fixture reconciliation was recorded at `2026-10-11T09:05:14.595Z`: all
462 accepted source hashes and all four recorded fixture hashes match, HEAD/main
are unchanged and the staged list is empty.

The confirmation is an overall acceptance statement. No separate per-case
operator record, browser version, screenshot or downloaded observation JSON was
submitted, so those details are not claimed as independently captured. The
fixture smoke's Chromium version is not attributed to the operator's browser.
`research/e1-operator-acceptance.json` records this distinction and the preserved
historical report/log hashes. The normal API/auth/supplier-shell checks retain
their existing evidence. No production changes or test replay were needed.

## Original handoff before operator confirmation

The operator asked to resume E1 and first explain the scenario with a hands-on HTML acceptance page. This additive fixture imports the unchanged real ModelDialog, ModelFields and shared Dialog/NativeSelect. It uses an in-memory synthetic draft and save callback. It does not change production dismissal, native popup ownership, the original failed probes or the approved exception.

## Question and expected observations

E1 asks whether the first physical Escape closes an expanded browser/OS native select menu while preserving the surrounding model Dialog, selected value and focus. The original production probe targets `#model-dialog-tools`.

For a clean draft, a second Escape closes the Dialog and returns focus to its trigger. For a dirty draft, the first Escape still only closes the menu; the next Escape invokes the existing discard confirmation and keeps the draft. Pending behavior is a supplemental guard check; disabled fields cannot open the menu and Escape must not close the pending editor.

Open the menu by hand and visually confirm the options before pressing Escape. An arrow or focused closed select is insufficient. Native popup input may be consumed outside the page's keydown event stream; missing Escape events are not a failed observation. The passive page recorder never cancels events or implements popup dismissal. It samples state every 150ms and keeps at most 256 records. A menu transition alone does not establish which user action closed it.

## Artifact and run command

- `frontend/tests/browser/e1-manual.html`: instructions, pure HTML select control, observer display and operator checklist.
- `frontend/tests/browser/e1-manual.tsx`: unchanged real model editor integration and passive observation.
- `frontend/tests/browser/e1-manual-source.json`: source/environment binding for this fixture.
- `frontend/tests/browser/e1-manual.tsconfig.json`: explicit TSX fixture type-check scope, extending the existing browser configuration.

From the repository root:

```sh
npm --prefix frontend run dev -- --host 127.0.0.1 --port 4198 --strictPort
```

Then open `http://127.0.0.1:4198/dashboard/tests/browser/e1-manual.html`. Optional `?scheme=dark&locale=en` selects the dark palette and English model controls. The surrounding guide remains Chinese. This dev entry is outside production build imports.

Use a wide window to see the passive status board beside the unchanged Dialog. Narrow windows hide that board while the Dialog is open to avoid covering its controls; the recorded history remains available after close. Download the observation JSON after completing the clean/dirty/plain-control cases and enter a concrete description of any mismatch.

## Evidence boundary

The page's operator checklist records human claims. It cannot independently prove a physical Escape occurred or certify the API/auth/supplier shell behavior, which remains covered by original production acceptance evidence. Its smoke verification checks fixture readiness and existing guards only. E1 remains UNVERIFIED until the actual native-menu observations, environment and source binding are reviewed. Preserve both original failed production/plain-select probes and the original BLOCKED review regardless of a later supplemental result.

No native-menu/HID automation, runner-switch workaround, production source change, added test retry, deadline change, staging, commit or publication is part of this handoff.

## Fixture verification

Scoped ESLint, the explicit fixture TypeScript check and the final active native LSP probe pass with no diagnostics. The smoke run checks HTTP readiness, real control rendering, closed-menu Escape/focus return, dirty keep/discard, pending dismissal blocking and a source-bound JSON export. Chromium version is 153.0.8010.12. It never opens a native menu or runs popup-first Escape; it does not close E1.

The initial inferred LSP CSS warning and component Fast Refresh warning were resolved through the actual Vite type reference, explicit TSX compiler scope and component export. The fixture's initial empty-data validation presentation was replaced with valid synthetic required fields, and the guide's React mount now has its own ID to avoid the production root's layout rules. These are additive fixture changes only. All 462 accepted source hashes remain unchanged and the staged list remains empty.
