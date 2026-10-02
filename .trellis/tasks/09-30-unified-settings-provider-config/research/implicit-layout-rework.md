# Implicit choices and narrow drawer rework

The configured routing view now resolves selection-only rules and empty fallback
to the first configured label, using the same read-only resolver as monitoring.
The resolver preserves legacy `tier` alias behavior. Its result enters match edges
and branch explanations; it does not populate a choice, assign a model, or change
overlay membership.

`ConfiguredRouteFlow.test.tsx` exercises both implicit branches with an untagged
global model. It checks their inherited paths, selection policy, clear-default
incomplete state, unchanged input, clean diff, and unchanged overlay choices/tags.
A separate regression retains legacy-tier match and payload behavior.

Below 600px, the routing-information body spans both drawer columns. Its explicit
second row, minimum-size constraints and vertical scrolling keep content within
the bounded drawer. The existing 320px English/Chinese browser cases now measure
body width/height, scroll behavior and inherited-model text wrapping. They require
full drawer width and at most three model-text lines. Desktop cases also pass.

## Verification

Evidence root:
`/Users/texas/.cache/jev-release-acceptance/config-init-0.1.0/implicit-layout-gates-2`.
Its `results.json` and named logs record:

| Command | Exit | Seconds |
| --- | ---: | ---: |
| `npm --prefix frontend run lint` | 0 | 4.02 |
| `npm --prefix frontend test` | 0 | 1.19 |
| `bash scripts/build-frontend.sh` | 0 | 4.53 |
| `frontend/node_modules/.bin/tsc -p frontend/tests/tsconfig.json` | 0 | 0.68 |
| `./node_modules/.bin/playwright test -c playwright.config.ts` in `frontend` | 0 | 15.73 |

The suite passes 263 unit tests across 33 files and 116 browser tests. Existing
Fast Refresh and bundle-size warnings remain nonblocking.

The first attempt is retained under `implicit-layout-gates`: 262 unit tests passed
and the collapsed-information test failed because it asserted the previous entire
CSS class string. Its check now requires the actual information element's `hidden`
attribute, and its ordering check uses that element's ID rather than a class
substring that previously returned `-1`. No product assertion was removed.

These are source/browser checks with synthetic fixtures. They do not replace
native HTTP acceptance, actual LiteLLM cleanup regressions, rebuilt-wheel parity,
real upstream acceptance or publication gates. The earlier SHA740 wheel predates
these frontend changes.
