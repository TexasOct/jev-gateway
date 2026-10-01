# Icon review evidence

## Result

PASS for the icon task after fixing a test portability defect. No task-specific
defects remain. The full browser suite still has one reproduced baseline failure.

Review used the preserved frontend baseline at
`/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-icons-baseline-t07euvz7`,
not HEAD. The implementation matched `task-scoped.patch` before review edits.
The reviewer read the full dashboard spec from disk, the task artifacts,
manifests, research, changed source, tests, package delta and frontend README.

## Fixed finding

`frontend/tests/browser/icons.spec.ts` hard-coded macOS text-control widths with
less than 1px tolerance. The app inherits platform fonts from
`frontend/src/styles/base.css:2`, so those widths are not portable contracts.
An added alternate-font case failed at the refresh width assertion with a 6.84px
difference before the fix.

The test now checks usable control bounds and vertical icon alignment. Exact
16px action icons, 14px node icons, 40px toolbar controls, and 190 by 56px nodes
remain asserted. The added desktop English serif-font case exercises the same
interactions with different font metrics. This tests font independence locally;
it is not a claim that Linux or Windows was run.

The reviewer changed only `frontend/tests/browser/icons.spec.ts` and this report.
The saved implementation patch remains the pre-review version; a commit must
include the current test file's reviewer changes.

## Scope and contracts

- The package lock adds only its root Lucide dependency and the
  `node_modules/lucide-react` entry. Existing package entries are unchanged.
- Static named imports cover every requested control and six node categories.
- Localized names, handlers, disabled/pressed/disclosure state and sortable
  attributes remain on the existing controls. Decorative SVGs are hidden and
  unfocusable. Browser tests exercise real pointer and keyboard input.
- Connector geometry, route-description arrows, monitoring status content,
  placeholders, locale catalogs, style source and the J brand are unchanged.
- The shared dashboard spec and Git index still match their saved baselines
  byte-for-byte. No task state, unrelated test, backend, staging or commit changes
  were made.

## Verification after the fix

| Check | Result |
| --- | --- |
| Frontend lint | Passed; four unchanged warnings in `src/shared/i18n/index.tsx` |
| Unit tests | 25 files, 188 passed |
| App TypeScript, Vite build, browser TypeScript | Passed through `test:browser` |
| Full browser suite | 29 passed, one baseline failure |
| Icon-only browser tests, repeated twice | 14 passed |
| Bundle staleness check | Passed |
| `git diff --check` | Passed |
| Active LSP check on the revised browser test | Clean |

An earlier seven-file diagnostic probe reported only existing hints/information
on unchanged code and one inconclusive push-only result. The compiler checks
passed. Backend pytest, Pyright and wheel packaging were not run.

Logs are in the baseline directory as `check-agent-*-final.log`.
`check-agent-font-red.log` records the failing alternate-font assertion before
the fix. Every verification subprocess had a timeout; none reached it.

## Baseline issues left unchanged

`frontend/tests/browser/monitoring.spec.ts:211` attempts to click Refresh activity
inside collapsed Settings. It times out in the baseline log and both independent
full-suite review runs. The existing test needs to open Settings first; that
change is outside this task.

The English information disclosure also overflows horizontally at 390px and
320px because its centered label does not wrap. A separate browser probe against
the baseline build confirmed the old triangle was already outside the button:
left insets were -51.45px and -68.95px. Current 16px SVG insets are -56.19px and
-73.69px, with unchanged button dimensions and the same icon center. This needs
a separate responsive-label fix. The probe and measurements are saved as
`check-disclosure.spec.ts` and `check-disclosure-{baseline,current}.log` in the
baseline directory.
