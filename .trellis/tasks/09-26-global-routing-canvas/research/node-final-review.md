# Final review: global routing canvas

Read-only review of the staged snapshot and worktree delta for `.trellis/tasks/09-26-global-routing-canvas`. No source, test, build, staging, or index changes were made. The working tree and index differ for `RoutingCanvas.tsx`, `CanvasNodeContent.tsx`, and `styles.css`; the new `node-card.ts` and `node-card.test.ts` are untracked. The unstaged geometry and mobile CSS changes were reviewed separately from the staged code. They fix the source port alignment and the narrow toolbar/drawer wrapping visible in staged screenshots. The index was left intact.

## Findings from the earlier staged snapshot

These P1 findings were about the index-only snapshot during concurrent work. The current worktree imports the geometry module and uses fixed card constants/ports, and lint, tests, build, browser native drag and backend checks pass. They are not open source defects in the current worktree, but staging a partial subset would reintroduce them. Leave the index untouched until a scoped commit plan is approved.

### P1: The staged snapshot does not import the geometry module its tests require

In the staged `frontend/src/config/RoutingCanvas.tsx`, lines 555–556 call `nodeCardMetrics(draft, config, ...)`, but the module has no import for `nodeCardMetrics`. The new `frontend/src/config/node-card.test.ts` also imports from `./node-card`, which is untracked and absent from the staged snapshot. A build or test from the index-only snapshot therefore cannot resolve these references. The unstaged worktree fixes the canvas import and replaces variable geometry use with fixed card constants, but the fix and new module are not staged. Stage the intended set together, or align the staged implementation and tests before review/commit. I did not run a build or tests per instruction.

### P1: The staged canvas draws ports where the fixed-size cards no longer place them

The staged `RoutingCanvas.tsx` still offsets source edges by a sibling-count formula and puts tag-pool add handles at `y + 8` (lines 552–573). The staged node card CSS/content has already moved to the centered 190×56 layout. In the worktree screenshot, those old coordinates would put several edge handles behind the text or away from the card center, and make the add handle miss the card's actual center. The unstaged worktree corrects this with `nodeCardPorts`, `nodeCardPortsWithCenter`, and `nodeCardCenter`, imported from `node-card.ts`. Keep that integration with the geometry helpers in the commit snapshot; inspect the unstaged import and caller changes before staging.

### P2: The final browser evidence validates single-node drag, not group/cancel flows

The current `node-drag-results.json` and `node-drag-browser.md` record eight native mouse drags for `questions` and `rule-0`: 1280×800 and 320×700 at zoom 1 and 0.75. Each confirmed a hit-tested start target, expected CSS movement, unscaled coordinates, only layout PUTs, unchanged pending configuration state, and restored coordinates after reload. The separate nonzero zoom/viewport reload and read-only no-write checks passed. The JSON viewport member is the saved layout viewport, not browser dimensions; `viewport: [width,height]` in the script's in-memory case object is overwritten by `drag()` when it records persisted viewport data. Do not cite those JSON viewport values as browser sizes. The screenshots and script invocation report are consistent with the intended dimensions.

Group drag and pointer cancellation remain explicitly unverified by the native harness. Unit tests cover relative group offset math and clamped no-op behavior; source review confirms cancel restores the starting snapshot without persisting and active drag suppresses viewport writes. The inspector is hidden while dragging by the parent callback. Treat these as code/test support, not full native acceptance evidence. The result JSON timestamp is older than the current ignored bundle timestamp, but the report says the harness was run against the viewport-fix bundle; no stronger build-to-evidence provenance was independently established here.

## Visual and geometry review

The worktree `node-card.ts` exists and is imported by `RoutingCanvas.tsx`; it exports fixed 190×56 metrics and derives source/target/center ports. Its test file covers fixed geometry, port bounds, and five roles with long Unicode strings in English and Chinese. Current CSS makes the card border box 190×56 with 6px padding, leaving 42px of content height. The rendered rows total 40px (12 + 16 + 12) and are vertically centered, so the card's fixed box and text layout agree. The worktree increases the inline SVG icon from 12px to 14px while CSS still reserves a 12px flex basis; review this as a small visual detail, not a demonstrated functional defect, since the flex item can overflow its basis within the row.

The provided worktree screenshot shows differentiated role labels, icons, and borders for Questions, Rule, Fallback, and Label pool, with titles and one-line summaries at 1280px. The 320px screenshot shows canvas controls still reachable and node text intact. The fifth role (Model), light-theme rendering, and Chinese browser appearance are not shown in these screenshots. SSR/component tests cover all five types and both locales, while the visual report notes those screenshot variants remain unreviewed. Current palette uses accent, good, warn and muted theme tokens and shape/border changes, so there is non-color distinction in the CSS. Do not claim complete visual browser coverage for both themes/locales or every role.

## Other unverified scope

Pointer cancel, native multi-selection drag, the full policy validation/review/apply path, and layout save-failure rollback have no evidence in the supplied native drag artifact. The task PRD still lists acceptance items for inspector anchoring/edge clamping, restoring canvas operation after closing details, full edit/review flow, and no policy changes from layout-only operations as pending. This review does not mark the task complete.

## Verification performed

Read the task PRD/design/implementation plan, both curated specs, the full Humanizer skill, current visual/drag research, relevant canvas/layout/drag sources and tests. Inspected `git status --short`, `git diff --stat` and `git diff --cached --stat` separately, and compared unstaged source changes against the index. Read the current drag result JSON and related screenshots. No tests, lint, typecheck, or build were run, per the read-only review request.