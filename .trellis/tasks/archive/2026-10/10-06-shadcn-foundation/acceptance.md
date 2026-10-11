# Foundation implementation checks

Developer checks for F1-F3 passed on the owned foundation slice. Independent
Trellis review remains pending. This receipt does not certify parent integration
or reopen the archived admin release's acceptance exceptions.

The stage started on main at `8352e4b0818c73c5f2dee6a98345e655b85a1cba`.
`research/initial-status.txt` and `research/initial-working.diff` preserve the
working boundary before installation. The task was activated with
`TRELLIS_CONTEXT_ID=pi_01a111be-5788-7169-b951-a0f2417171c2 python3 ./.trellis/scripts/task.py start .trellis/tasks/10-06-shadcn-foundation`.
No downstream task was started. Source SHA-256 values and screenshot paths are
in `research/source-identity.json`. No files are staged.

## F1: configuration and disposable CLI

Node `v24.18.0`, npm `11.16.0`, CLI `4.21.4`. The installed
`@shadcn/registry` declaration and runtime `rawConfigSchema` validate the live
configuration (`research/schema-validation.json`). `new-york`, neutral base,
Tailwind v4 and the existing aliases generate into `src/shared/ui/primitives`.
No generated component was added to production during foundation.

| Command | Exit/result | Evidence |
| --- | --- | --- |
| `npm --prefix frontend install --save-dev --save-exact shadcn@4.21.4` | 0 | `research/install.log` |
| `npm --prefix frontend exec -- shadcn --version` | 0, `4.21.4` | Installed manifest and CLI output |
| `shadcn init --template vite --base radix --preset radix-nova --yes --no-reinstall --cwd <init-copy>` | 1 | `research/init.log`; accepted preset name is `nova` |
| Same init with `--preset nova` and original split CSS imports | 1 | `research/init-nova.log`; init detection rejects split imports |
| Same init with a disposable-only full Tailwind import | 0 | `research/init-nova-recognized.log`, `init-components.json`, `init-index.css`, `init-package.json` |
| `npm --prefix frontend exec -- shadcn view input` | 0 | `research/view-input.json` |
| `shadcn add input --cwd <add-copy> --dry-run` | 0 | `research/dry-run.log` |
| `npm --prefix <add-copy> install` | 0 | `research/copy-install.log` |
| First `shadcn add input --cwd <add-copy> --yes` | Tool deadline after 60s during dependency installation | `research/add.log`; retained without claiming completion |
| Second explicit add attempt | 0 | `research/add-attempt2.log`; one generated file |
| `npm --prefix <add-copy> run build` | 0 | `research/copy-build.log`; unadapted generated source typechecks |
| Build after local `cn` import adaptation and mounted Input/theme harness | 0 | `research/copy-adapted-build.log`; generated Input included in bundle |
| `shadcn add input --cwd <add-copy> --diff` and `--view` | 0 each | `research/diff-input.log`, `view-input.log` |

The current registry Input imports `cn` from the external package. Its reviewed
adaptation uses `@/shared/ui/utils`; `--diff` shows this local change explicitly.
The workflow documents preserving that change. The CLI's initialization output
adds static colors, fonts and animation imports; none were adopted in production.

`research/lock-delta.json` compares the actual lock against HEAD: 250 added package
entries, no removed entries and no existing version changes. Existing package
objects are unchanged; only the root entry adds the exact development dependency.
The larger text diff includes npm's serialization ordering changes.

## F2: semantic colors and retained theme behavior

Popover, sidebar and chart roles map to existing runtime palette variables.
Destructive label color uses the panel surface, independent of primary label
color. Existing aliases, `cn`, palette derivation, default seed, theme hook/API,
Preflight exclusion and CSS entry/import order remain intact.

The disposable harness mounts the generated Input through the actual alias and
existing theme hook. It checks custom seed `#234567` in system light/dark, computed
popover/sidebar/primary/destructive colors and 4.5:1 label contrast. A held DELETE
disables reset/load, rejects duplicate admission, then fails visibly while
retaining the custom seed. One explicit DELETE retry restores `#3b66d9`, clears
the error and renders both explicit schemes. No PUT is used in that reset smoke.

The first smoke used port 4190, which Node fetch rejects as a blocked port. Its
readiness failure remains in `research/cli-theme-smoke.log`. The owned server was
stopped; port 4191 succeeded with no test retries or deadline changes:
`node .trellis/tasks/10-06-shadcn-foundation/research/cli-theme-smoke.cjs` exited 0
(`research/cli-theme-smoke-attempt2.log`, `cli-theme-receipt.json`).
The disposable source is retained as `smoke-main.tsx` and `smoke-input.tsx`.

## F3: documentation and affected checks

`frontend/src/shared/ui/WORKFLOW.md` documents pinned inspection, disposable
addition/update review, aliases, theme boundaries, MIT attribution and scoped
rollback. The existing complete `LICENSE.shadcn.md` covers copied registry
sources and public adapters. `README.md` links the workflow and describes the
current destructive palette.

| Command | Exit/result | Evidence |
| --- | --- | --- |
| `npm --prefix frontend run lint` | 0; zero errors, four existing i18n React Refresh warnings | `research/lint.log` |
| `npm --prefix frontend run test` | 0; 52 files, 406 tests passed | `research/unit.log` |
| `npm --prefix frontend run build` | 0; TypeScript and Vite passed, existing chunk-size warning | `research/build.log` |
| From frontend: `npm exec -- tsc -p tests/tsconfig.json` | 0 | `research/browser-typecheck.log` |
| From frontend: `JEV_BROWSER_PORT=4189 npm exec -- playwright test -c playwright.config.ts tests/browser/appearance.spec.ts tests/browser/connection.spec.ts tests/browser/auth-workspace.spec.ts tests/browser/settings.spec.ts --output ../.trellis/tasks/10-06-shadcn-foundation/research/browser-results` | 0; 37 passed, retries 0 | `research/browser.log` |
| `git diff --check` | 0 | Final scoped review |
| `git diff --cached --name-only` | 0; empty | No staged files |

The browser suites retain their original assertions, workers and deadlines. They
cover theme loading/save/failure/pending/stale reads, custom/default seeds,
native picker input/change, system connection schemes, locale/viewport geometry,
credentials in memory, authentication suspension/reconnection and draft retention.
All fixtures and servers are synthetic and owned by their test runners.

There are 44 PNG receipts. The full paths are listed in `source-identity.json`.
Inspected samples include `cli-custom-dark.png`,
`browser-results/appearance-has-no-settings-d246b-x820-in-English-and-Chinese/settings-custom-320-zh-CN-dark.png`
and `browser-results/connection-connection-geom-12d38-oard-focus-zh-CN-320px-dark/zh-CN-320-dark.png`.
The narrow production samples show contained forms and visible focus/custom-color
selection. The unadapted Input skin in the disposable probe needs the next
primitive stage's explicit control sizing/text-color review before page adoption.

## Review boundary

Unexpected edits appeared outside this stage after the initial capture, including
model fields/dialog/source logic, locales, supplier browser tests, backend metadata,
provider documentation and admin docs. They were preserved and reported to the
supervisor. `research/final-status.txt` records that boundary. Foundation owns only
the seven product/documentation files listed in the handoff; no page migration,
API change, credential operation, staging, commit or publication was performed.
Final stable-source integration and the independent foundation check remain with
the parent. Do not treat these developer receipts as a global PASS.

## Independent foundation check

F1-F3 pass after the fixes below. This verdict supersedes the pending independent
review statements above for this foundation stage. Parent integration and the
archived admin exceptions retain their separate status. No downstream task was
started, and no files were staged.

The reviewer captured `research/check-initial-boundary.json` and
`check-initial-working.diff`, then activated the same task using the required
session context. Complete curated specs, task artifacts, construction contract,
preview, CLI reference and migration map were read. Final source hashes and
screenshot inventory are in `research/check-reviewed-source.json`.

Two findings were fixed:

- The shared UI README had lost the end of the sentence describing JEV's action
  accent. The missing words were restored.
- The completed destructive foreground exposed a contrast failure in the existing
  Button hover consumer. In dark mode, `hover:bg-destructive/90!` composited over
  the panel produced 3.9002:1. With supervisor approval, the adjacent
  `frontend/src/shared/ui/button-variants.ts` now keeps that hover background
  opaque. The maintenance workflow records this constraint. Preserve it during
  the primitives stage. No button behavior or business owner changed.

The actual browser failure is retained in `research/check-button-before.log`,
`check-button-before-commands.json`, `check-button-contrast-before.json` and
`check-buttons-before-dark.png`. The corrected browser probe renders the real
project Button in a disposable bundle, uses native hover, reads settled computed
paint at opacity 1 and composites ancestor backgrounds. It preserves the 4.5:1
assertion and normal readiness deadline. Its script is
`research/check-button-contrast.cjs`; passing rows and screenshots are in
`check-button-contrast-after.json` and `check-buttons-after-{light,dark}.png`.

| Scheme | Default normal | Default hover | Destructive normal | Destructive hover |
| --- | --- | --- | --- | --- |
| Light | 6.0673:1 | 7.2641:1 | 5.3536:1 | 5.3536:1 |
| Dark | 5.1475:1 | 6.2478:1 | 4.5505:1 | 4.5505:1 |

### Requirement verdicts

| Criterion | Verdict | Current-source evidence |
| --- | --- | --- |
| F1 | PASS | Exact installed CLI `4.21.4`; independent installed `rawConfigSchema` validation in `check-command-1.log`. Config, manifest, lock, aliases and CSS match the developer receipts. Reviewed disposable init/dry-run/add/diff/view/build receipts establish generation under `shared/ui/primitives`; existing local `cn` adaptation builds. |
| F2 | PASS | Semantic roles, palette authority, scheme selector, native color commit and API hooks inspected. Existing custom/system/reset smoke remains applicable to unchanged config/token/theme code. Corrected actual normal/hover Button contrast passes both schemes. Final production browser run passes saved/default seeds, stale reads, pending/failure, auth suspension and reconnection. |
| F3 | PASS | Workflow, README and complete MIT notice inspected; broken prose and hover constraint corrected. Developer full lint/unit receipts remain valid for unchanged source; affected controls/theme tests and lint pass after the adjacent fix. Final production TypeScript/Vite build and 37 affected browser cases pass. |

### Independent commands and receipts

| Command | Native exit/result | Receipt |
| --- | --- | --- |
| Installed-schema Node validation | 0; exact config accepted | `research/check-commands.json`, `check-command-1.log` |
| `npm --prefix frontend exec -- shadcn --version` | 0; `4.21.4` | Reviewer tool output and installed manifest |
| `npm --prefix frontend exec -- vitest run src/shared/theme/palette.test.ts` from root | 1; wrong working directory collected historical copies | `research/check-commands.json`, `check-command-2.log`; retained invocation failure |
| From `frontend/`: `npm exec -- vitest run src/shared/theme/palette.test.ts` | 0; 11 passed | `research/check-palette-correct-cwd.json`, `.log` |
| Disposable build and `node .../check-button-contrast.cjs before` | Build 0; probe 1, 3.9002:1 failure | `research/check-button-before-commands.json` |
| Disposable build and `node .../check-button-contrast.cjs after` | Both 0; eight measured states pass | `research/check-after-commands.json` |
| From `frontend/`: `npm exec -- eslint src/shared/ui/button-variants.ts` | 0 | `research/check-button-lint.log` |
| From `frontend/`: `npm exec -- vitest run src/shared/ui/controls.test.tsx src/shared/ui/theme-contract.test.js src/shared/theme/palette.test.ts` | 0; 3 files, 18 tests passed | `research/check-shared-tests.log` |
| `npm --prefix frontend run build` | 0; TypeScript/Vite pass; existing size warning | `research/check-production-build.log` |
| From `frontend/`: `JEV_BROWSER_PORT=4193 npm exec -- playwright test -c playwright.config.ts tests/browser/appearance.spec.ts tests/browser/connection.spec.ts tests/browser/auth-workspace.spec.ts tests/browser/settings.spec.ts --output ../.trellis/tasks/10-06-shadcn-foundation/research/check-browser-results` | 0; 37 passed, zero retries | `research/check-browser-command.json`, `check-browser.log` |
| `git diff --check`; `git diff --cached --name-only` | 0; clean whitespace and empty staged set | `research/check-commands.json`, final reviewer checks |

The root Vitest invocation used npm's prefix without changing the runner's cwd.
It scanned historical copies and failed dependency resolution. The correction
changes only cwd to the documented frontend owner; it changes no test, runner,
assertion, retry count or deadline. Both attempts remain recorded.

Independent lock inspection confirms 250 added package entries, zero removals
and zero existing package-object changes against HEAD, including platform fields.
No installation was needed during review. The disposable copy's npm installation
resolved newer compatible tools (its Vite is 8.3.4); production uses the reviewed
lock and Vite 8.3.0. Disposable smoke evidence supplements the actual production
build and browser evidence.

The reviewer inspected final `check-buttons-after-dark.png`,
`check-browser-results/appearance-has-no-settings-d246b-x820-in-English-and-Chinese/settings-custom-320-zh-CN-dark.png`
and `check-browser-results/connection-connection-geom-12d38-oard-focus-zh-CN-320px-dark/zh-CN-320-dark.png`.
Production narrow controls remain contained with visible color selection and
keyboard focus. Disposable registry Input styling still belongs to the next
primitive adapter review; it is not a production migrated control.

No foundation blockers remain. The parent still owns full stable-source
integration; the next stage must preserve the opaque destructive hover and
review generated control sizing/text color and local `cn` imports.

### Final hash reconciliation and inherited boundary

`research/check-hash-reconciliation.json` reconciles the developer and reviewer
manifests. README hash `e7ec8c005e9aa0b16e4faf4f1c4e2a7b1b1b9174152408d155aed9c70ca87d39`
is the developer version with the incomplete sentence. Restoring `action color.`
produces `da193e06066d2a71523476dea23b2a6cafb11016ec16286ec6ceb44d6ce969a4`,
which agrees across `check-final-source.json` and `check-completion-source.json`.
The later workflow-only hover note is included in the completion manifest.

The corrected disposable contrast bundle, live source and completion manifest
have identical SHA-256 values for `button-variants.ts`, `index.css`, `tokens.css`
and `palette.ts`. In particular, final button hash is
`d26a6173c4f6fc941056d1acccffa8639b1ea96d965bc5f14922378397b837e7`.
These bytes bind `check-button-contrast-after.json` and its build/run receipts.
The authorized adjacent change is only `hover:bg-destructive/90!` to
`hover:bg-destructive!`; Primitives must preserve it.

The same receipt records current hashes for inherited ModelDialog, ModelFields,
model source logic, locale catalogs, supplier-models browser regression,
model-source-values unit fixture, backend metadata/tests, provider spec and admin
docs. Every tracked diff matches review admission; frontend inherited hashes
also match review completion. No ongoing change was observed in those files.
They remain outside Foundation ownership and PASS. Later owners must consume
this inherited baseline and their separate verification receipts.

Stage verdict: PASS
