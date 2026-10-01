# Dashboard UI audit

## Baseline and limits

This audit reads the current working tree, including staged, unstaged and untracked frontend work. `git status --porcelain=v1` reported 121 entries at audit time. At capture, Vite shell stylesheet rules not yet included in `jev_gateway/static` were not visible in screenshots. A later compiled build includes those rules and needs fresh screenshots before implementation review. The affected baseline includes `App.tsx`, `styles.css`, `RoutingCanvas.tsx`, `RoutingEditor.tsx`, `CanvasNodeContent.tsx`, their tests, `canvas.ts`, `i18n.tsx`, and untracked `node-card.ts` / `node-card.test.ts`. Preserve the index and working tree separately; an index-only checkout is a different UI. The main agent reports lint exit 0 with four existing Fast Refresh warnings, 9 frontend test files and 102 passing tests; see `research/baseline-checks.md` for the recorded result and frontend hash baseline. Before rendering, the main agent also observed `frontend/src/styles.css` had moved from its captured hash. Its staged and unstaged layers both contain pre-existing edits; only unstaged hunks beyond the index were added during this planning session. Those rules concern 320–600px canvas toolbar/drawer arrangement and did not touch JSX, handlers or control behavior. The main agent captured the index version at `/tmp/jev-baseline-styles.css` and made browser screenshots from the compiled current bundle through the task's mock API fixture. These screenshots are for layout inspection, not evidence about authorship of the staged/unstaged change layers.

`python3 ./.trellis/scripts/task.py current --source` returned no active pointer. The caller supplied `.trellis/tasks/09-27-dashboard-visual-language`; its PRD approves planning and excludes interaction changes (`prd.md:12-38`). No task was started. This file is the audit's only write. No dependencies, servers, browser sessions, test runs or builds were started. No installation catalog, credentials, retained messages or storage records were read.

Code findings below describe implemented rules. Rendered appearance still needs the main agent's isolated browser inspection. Historical screenshots and reports are identified separately.

## File map and page surfaces

| File | Ownership and evidence |
| --- | --- |
| `frontend/index.html:1-13`, `frontend/src/main.tsx:1-19` | Root shell, viewport metadata, React StrictMode, locale provider, global CSS import. |
| `frontend/package.json:6-35` | React/React DOM, TypeScript, Vite, plain CSS; dnd-kit for advanced rule/model controls and chroma-js for palette generation. Scripts: dev, preview, lint, test, build. No Tailwind or component library. Manifest ranges are not proof of installed versions. |
| `frontend/vite.config.ts:7-15` | `/dashboard/` base, React plugin, output to `jev_gateway/static`, destructive output-directory rebuild, no dev proxy or fixed dev port. |
| `frontend/src/App.tsx:183-682` | One page with state-selected monitoring, strategy and appearance views; shared header, connection form, errors, refresh, theme scheme and language controls. No client router. |
| `frontend/src/App.tsx:88-122,520-621` | Monitoring: fixed-window session buttons, request evidence cards with native details/pre blocks, provider outcomes table. Session metadata excludes prompt rendering. |
| `frontend/src/App.tsx:622-666` | Appearance: seed color/text inputs, save/reset, saved value, swatches and measured-contrast table. |
| `frontend/src/config/RoutingEditor.tsx:286-773` | Draft, selection, inspector, information drawer, advanced sortable rules/model drop zones, diff/review/acknowledgement/apply/reset lifecycle. |
| `frontend/src/config/RoutingCanvas.tsx:46-636` | Layout loading/saving, pointer capture, tools, zoom/pan, Fit/reveal, SVG connections, node buttons, keyboard node/edge alternatives. |
| `frontend/src/config/CanvasNodeContent.tsx:40-91` | Five node role labels, custom inline SVG icons, title and compact summary from current draft/configuration. |
| `frontend/src/config/node-card.ts:1-55`, `canvas.ts:1-423`, `draft.ts:1-425` | Fixed card/port geometry, viewport/interaction math and compatibility, pure policy draft/graph/payload logic. Freeze these for this visual iteration. |
| `frontend/src/monitoring/VirtualList.tsx:19-80`, `pagination.ts:1-15` | Absolute virtual rows, overscan, ResizeObserver, cursor trigger, session keyboard focus. |
| `frontend/src/theme/palette.ts:121-230` | Seed-derived light/dark semantic colors and root CSS-variable application. |
| `frontend/src/i18n.tsx:4,520-548`, `api.ts:182-258` | Validated locale is the sole local-storage value; credential stays in module memory; same-origin API contracts. |
| `jev_gateway/dashboard.py:46-59,142-164,268-294` | Content-free shell, static mount/security headers, browsable dashboard URL. |

## Current visual rules

### Color

`styles.css:1-16` supplies initial light fallback tokens: page `#f5f7fa`, surface white, alternate `#eef1f7`, text `#17202a`, muted `#5c6b80`, blue accent `#3b66d9`, green/red/amber status. These are replaced by inline root variables after mount (`App.tsx:210-218`, `palette.ts:225-230`); editing the fallback literals alone will not refresh the running theme.

The following values were calculated directly from the current palette source with the default seed `#3b66d9`; they are not a sampled screenshot or the installation's saved theme:

| Role | Light | Dark |
| --- | --- | --- |
| Page | `#f7f8fb` | `#131620` |
| Surface | `#fdfefe` | `#1c212e` |
| Alternate | `#edeff5` | `#262c3b` |
| Code | `#f1f2f6` | `#1a1e28` |
| Border | `#d3d7e1` | `#3f465a` |
| Text | `#1c2336` | `#f1f2f6` |
| Muted | `#5c688a` | `#9ca3b4` |
| Accent | `#2958d6` | `#6a86d2` |
| On accent | `#ffffff` | `#10161f` |
| Success / failure / warning | `#1aa25a` / `#c53620` / `#bd831f` | `#3eda87` / `#da533e` / `#daa13e` |

Hue-tinted cool neutrals follow the seed; statuses have fixed hues. Body/muted/accent targets are 4.5:1, status targets 3:1, and border target 1.2:1 (`palette.ts:14-15,121-177,188-203`). Default light success and warning measure 3.11 and 3.08 respectively. The existing contrast table does not prove small status text, colored node tint, selected rings, every hover surface or every custom seed meets 4.5:1.

### Type, surfaces and layout

- Body is `14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif`; h1/h2/h3 use 1.15/1/0.92rem and weight 640 (`styles.css:27-51`). Tables and labels use weights 620, with form metadata around 0.72-0.85rem. Monospace is browser-default code/pre; tabular figures appear selectively in contrast ratios, rule indices and zoom output.
- Monitoring uses padded bordered panels, 0.6rem panel radius, 0.5rem card radius, 0.4rem buttons/inputs; desktop split is 34% selector and remaining detail at 900px (`styles.css:92-173`). There is no shared spacing/radius/shadow scale or general content max-width.
- Virtual windows are exactly 480px high; at 720px and below sessions become 280px and timeline 62vh (`styles.css:191-218,351-380`). Session row geometry is 132px, request row geometry 360px (`App.tsx:536,574`). Request cards scroll internally when evidence expands.
- Strategy alone uses `100dvh` with header auto row and remaining-space workspace (`styles.css:99-117,610-617`). Canvas defaults to a 3200×2200 scroll board, 20px dotted grid, scaled content and unscaled overlays (`canvas.ts:5-7`, `styles.css:391-419`, `RoutingCanvas.tsx:561`). Header wraps, then gets a compact horizontally scrolling mobile treatment below 600px.
- Workspace title/warnings sit in a top overlay; the bottom drawer is capped at 48%/36rem, with a 44%/20rem mobile cap. Toolbar and drawer actions scroll horizontally on narrow screens (`styles.css:640-769`). Inspector caps are 340×460 with internal scroll (`RoutingEditor.tsx:358-369`, `styles.css:619-639`).
- All node buttons are 190×56, with 12/16/12px content rows and 10/14/11px text (`node-card.ts:1-6`, `styles.css:426-487`). Questions use rounded accent borders; rules green/square; fallback amber/dashed; label pools double start borders; models muted/end borders. Selection, compatible targets, focus and dragging use separate outlines. Dragging has a reduced-motion-aware border pulse.

### Code-backed inconsistencies to review visually

1. Standard panels use flat borders; canvas title/tools/inspector/drawer add several unrelated hardcoded black shadows (`styles.css:399,409,417,629,640,869`). Elevation is less consistent across views, especially in dark mode.
2. Base disabled buttons use opacity 0.55, then a later general disabled selector overrides it to 0.65 (`styles.css:156-159,569-575`). Focus rules also repeat; generic `button:focus-visible` can override the earlier stronger node focus rule (`styles.css:476,578-583`). Confirm actual computed styles before changing them.
3. Base font/color/control styling covers button/input/select, but textarea receives only disabled/focus and minimum-height rules (`styles.css:137-173,569-583,606-608`). Inspector textareas can retain browser-default typography/surfaces. This is a useful visual-only target.
4. Accent hover/active tokens exist, but generic button hover only changes border color; active navigation uses a full accent fill while active canvas tools use an alternate-surface fill (`styles.css:152-167,402`). Preserve state meaning while harmonizing treatment.
5. Type sizes and unusual 620/640 weights are spread through selectors without a scale. The compact card geometry limits any node typography enlargement. The node icon DOM is 14×14 while its flex basis is 12px (`CanvasNodeContent.tsx:82`, `styles.css:484`), so verify spacing.

These findings do not establish that the interface looks crowded, polished or visually balanced. Those judgments require current screenshots.

## Interaction and DOM contracts to freeze

- Preserve navigation order, `aria-pressed`, controls, field types, labels, native details, event handlers and request sequencing (`App.tsx:331-438,440-518`). Mount and locale-dependent loads can invoke APIs; refresh clears/reloads state. Theme preview/save/reset and system/light/dark remain unchanged.
- Preserve virtual-list fixed heights, `.virtual-row`, `data-key`, first button focus target, 132/360 row geometry and internal evidence scrolling (`VirtualList.tsx:34-79`). CSS that changes row content height can clip text or invalidate focus/window behavior. Keep `td[data-label]` and `attr(data-label)` mobile table stacking (`styles.css:351-380`, `test_gateway.py:899-905`).
- `.app-header`, `.workflow-workspace`, `.routing-canvas-scroll`, `[data-canvas-node]`, `[data-canvas-occlusion]` and `.canvas-tools` are queried by geometry/interaction code, not merely styling hooks (`canvas.ts:168-196`, `RoutingCanvas.tsx:83-126`, `RoutingEditor.tsx:316-326,358-383`). `data-canvas-occlusion="top"|"bottom"` drives Fit/reveal/toolbar/inspector free space.
- Do not add transforms to overlays, change node dimensions, move ports, replace the scrolling element, change touch-action/pointer-events/overflow, or alter z-index casually. Node geometry is duplicated in bounds/math and tested; inline size styles already constrain CSS (`RoutingCanvas.tsx:592-613`, `canvas.ts:270-354`, `node-card.ts:1-55`). Shadow/outline expansion must leave edge hit targets accessible.
- Tools V/H, Shift selection, marquee/group movement, native pointer capture, >4px drag threshold, Alt+arrow movement, Escape, zoom steps, Fit/reveal and pan behavior stay intact (`RoutingCanvas.tsx:278-344,421-509,522-617`). Layout saves only `{version,nodes,viewport}`, serializes writes, and rolls back on failure; zoom is transient (`RoutingCanvas.tsx:225-261,436-446,550-558`).
- Inspector is unscaled, measured near the selected node, hidden during drag, internally scrollable and closes with focus handoff. Drawer defaults collapsed with `aria-controls="routing-information"` / `hidden` semantics. Advanced controls remain inside DndContext (`RoutingEditor.tsx:305-354,558-581`, `RoutingEditor.test.tsx:41-95`).
- Keep first-match policy, explicit-list membership locks, last-member protection, and foreign tags. Policy changes stay drafts until validate, review, warning acknowledgement and explicit apply; reset has confirmation (`canvas.ts:93-133`, `draft.ts:313-364`, `RoutingEditor.tsx:469-524,739-770`). Layout gestures must not trigger this flow.
- Keep credentials in module memory, same-origin APIs, and only the validated locale in localStorage (`api.ts:182-218`, `i18n.tsx:520-545`). CSP has no `font-src`; default-src is none, so adding local or remote webfonts would require a backend security-header change. Prefer existing system fonts for this scope (`dashboard.py:48-53`). External image/font services would also conflict with the current CSP.

The global-canvas PRD still has open acceptance items (`.trellis/tasks/archive/2026-09/09-26-global-routing-canvas/prd.md:24-38`). Its later `research/final-review.md:7-18` reports two baseline issues: an earlier failed layout save can reset UI during another active drag, and wheel-scroll during pointer capture can disturb tracking. The current handlers still contain the described reset/client-delta paths (`RoutingCanvas.tsx:247-260,293-320,550-558`). This audit did not reproduce them. Record them separately; the visual refresh must not silently fix gestures or claim those issues as new regressions.

## Safe preview options

### Recommended fixture

Reuse `.trellis/tasks/archive/2026-09/09-26-global-routing-canvas/research/browser-harness.py`. It serves current built assets from `jev_gateway/static`, synthetic questions/eight rules/two label pools/two models, empty monitoring, and a fixed seed `#6d7fd7`; it never reads installation configuration or contacts providers (`browser-harness.py:13-43,60-88`). Launch command for the main agent, when permitted:

```sh
python3 .trellis/tasks/archive/2026-09/09-26-global-routing-canvas/research/browser-harness.py
```

It prints `http://127.0.0.1:<ephemeral-port>/dashboard` (`browser-harness.py:130-133`). No such fixture server was identified by this audit. `/__test/state` captures writes; POST `/__test/control` supports reset, clear_requests, read_error, write_fail and write_available (`browser-harness.py:61-62,100-110`). This is sufficient for canvas baseline screenshots, read-only and layout error states.

Fixture limitations: monitoring is empty; provider payload omits evidence_available; theme PUT/DELETE and configuration DELETE are unsupported; validation always succeeds without warnings, and apply does not fully update overlay/model/hash semantics (`browser-harness.py:63-79,111-127`). Appearance screenshots are usable, but theme save/reset, real review errors/acknowledgements and populated pagination require synthetic intercepted responses or an approved fixture extension. Never fill these gaps with live APIs.

Historical browser scripts and screenshots are reusable references:

- `research/viewport-browser-check.py:17-20,58-102` runs the fixture and unique agent-browser session at 1430×2511, 1280×800, 390×844, 320×700 in both locales, collapsed/expanded drawer. Existing PNGs are `research/viewport-artifacts/<width>x<height>-<locale>-collapsed.png` and `-expanded.png`.
- `research/node-drag-browser.py:20-24,226-255` covers real mouse drags at 1280×800 and 320×700, zoom 1/0.75, Questions/Rule, layout-only writes, reload and read-only. Its result file's viewport field is overwritten with saved layout viewport; use script dimensions/screenshots for viewport evidence.
- Do not run either script unchanged in this task: both overwrite earlier task artifacts. Reuse their checks with an approved new artifact destination. Their historic results do not verify a newly styled bundle.

### Existing reachable shells

The main agent identified project-cwd Vite processes on `5174`–`5179` (PIDs recorded in their message); the audit had also confirmed these ports served JEV shells with a Vite client. No browser/API load occurred. Their API intercept/proxy setup is unverified, and repository Vite config has no proxy. Use one only after arranging synthetic browser routes for every `/v1/**` request.

`http://127.0.0.1:8000/dashboard` returned HTTP 200 with the production CSP. Port 8000 is configured by `compose.yaml:5-6`; default gateway settings are `catalog.py:290-291`. It is a real gateway listener, not a safe fixture. Do not open it for this audit: the app fetches sessions/providers/theme on mount.

Current dependencies, `.venv/bin/pytest`, built index and `/opt/homebrew/bin/agent-browser` exist. `sh scripts/build-frontend.sh --check` passed in this audit. This checks timestamps only (`scripts/build-frontend.sh:17-33`); it does not verify visual fidelity or test results.

### Main-agent screenshot review

The main agent verified bundle freshness, then launched only the fixture server in a detached subprocess and navigated a unique `agent-browser` session to `http://127.0.0.1:61157/dashboard`. It captured `research/baseline-images/{monitoring-desktop,canvas-desktop,inspector-desktop,drawer-desktop,canvas-mobile-zh}.png` at 1440×960 or 390×844. The fixture is empty monitoring and representative canvas data; appearance/theme is System mode, with the fixture seed. The browser process was closed and fixture server stopped afterwards.

Rendered observations from the current compiled bundle: dark system mode, compact header plus tab navigation, dark panel surfaces, blue/purple active accent, green rule outlines, blue dotted full-canvas grid and many intersecting SVG edges. The workspace feels like a dense technical editor; selected node and inspector are legible, with the bottom drawer consuming a large portion of vertical room when expanded. Monitoring's empty states are restrained but leave substantial flat space. At 390px the header/nav and toolbar/drawer remain horizontally dense; labels and toolbar buttons fit using horizontal scroll. Inspector wasn't captured on mobile. These are visual judgments on one synthetic dataset and one system theme, not interaction failures. No production gateway, credentials, or configured catalogue was opened.

## Validation commands and coverage

The commands below are for the implementation/review phase. Only the read-only bundle freshness check was run here. Tests/builds write generated assets and tool caches, so they were deferred under this research-only write limit.

```sh
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
sh scripts/build-frontend.sh --check

# Focused frontend suites, relative to frontend/
npm --prefix frontend run test -- src/config/RoutingEditor.test.tsx src/config/CanvasNodeContent.test.tsx src/config/node-card.test.ts src/config/canvas.test.ts src/config/drag-interaction.test.ts src/theme/palette.test.ts src/i18n.test.ts src/monitoring/pagination.test.ts src/config/draft.test.ts

# Dashboard/security/configuration focused backend coverage
uv run pytest -q tests/test_gateway.py -k 'dashboard or canvas_layout or configuration'
uv run pytest -q tests/test_canvas_layout.py tests/test_routing_overlay.py tests/test_routing_strategies.py

# Existing full project gates
uv run pytest -q
uvx pyright
```

`frontend/package.json:6-12` defines frontend gates. The backend `dashboard_bundle` fixture builds once per test session from current source, regardless of existing ignored output (`tests/conftest.py:25-37`). `scripts/build-frontend.sh` without `--check` runs npm install, so do not use it under the no-install constraint; use the existing `npm ... run build` after implementation approval.

Coverage read in full: editor SSR structure/DnD/read-only/errors (`RoutingEditor.test.tsx:41-95`), five node types/locales/escaping/draft summaries (`CanvasNodeContent.test.tsx:34-123`), fixed 190×56 geometry/port bounds (`node-card.test.ts:13-87`), drag calculations (`drag-interaction.test.ts:11-39`), viewport/inspector/focus/connection helpers (`canvas.test.ts:25-349`), seed/contrast variables (`palette.test.ts:15-100`), pagination dedup/window math (`pagination.test.ts:4-14`). These do not render CSS or prove real pointer/scroll actions. There is no existing App/VirtualList DOM interaction suite in the frontend file map.

Backend shell test requires exact asset-prefix/CSP/privacy behavior and `attr(data-label)` (`tests/test_gateway.py:852-918`). Layout auth/isolation tests are at 921-970; theme persistence/guards at 972-1084. Global-canvas design/implementation and Mixboard compatibility matrix remain useful constraints (`.trellis/tasks/archive/2026-09/09-26-global-routing-canvas/design.md:7-55`, `.trellis/tasks/archive/2026-09/09-26-global-routing-canvas/implement.md:1-13`, `09-25-mixboard-strategy-editor/design.md:27-54`).

For fresh browser acceptance, cover all three views plus connection/errors in both locales and light/dark; the fixture's purple-blue seed is not the default palette. Include tall desktop, 1280×800, 390×844 and 320×700. Check header/canvas bounds, mobile tables, empty/populated virtual lists, expanded evidence, inspector/drawer scroll, hover/pressed/focus/disabled states and long synthetic names. Use actual hit-tested pointer drags and scroll, capture request paths/payloads, and verify layout-only versus validate/apply separation. Recheck baseline concurrency/scroll defects separately if the main agent needs a regression comparison. Planning screenshot capture omitted reduced-motion runs, populated monitoring, appearance seed-edit states, mobile inspector and a contrasting theme choice.

## Recommended scope

Start with `styles.css`: consistent typography and control surfaces, semantic token use, shared spacing/radius/elevation values, textarea parity, table/readability treatment and state contrast. Cover the shared header, monitoring, appearance and canvas overlays together. Preserve node geometry and workspace structure. Keep palette derivation/default seed and appearance behavior unchanged unless the user explicitly approves a palette-algorithm change; additional CSS tokens can reference the existing semantic colors.

Allow presentational JSX classes only where necessary and retain DOM attributes queried by code/tests. Avoid new libraries/assets, navigation rearrangement, new controls, motion/scroll systems, font loading, or cleanup of earlier tasks. Any proposed geometry, handler or persistence change belongs in a separately approved plan. The current browser baseline should decide the visual direction before implementation.
