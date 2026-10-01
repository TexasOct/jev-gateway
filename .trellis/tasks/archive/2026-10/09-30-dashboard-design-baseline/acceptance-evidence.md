# Dashboard design baseline acceptance evidence

This review covers root `DESIGN.md` and this child task's documentation. The baseline can pass independently of provider UI delivery. Task status and the active pointer remain unchanged.

## Checks

- Official format: `npx --yes @google/design.md@0.4.0 lint --format json DESIGN.md` returned exit 0, 0 errors, 0 warnings and 1 informational token-summary finding. The summary reports 28 colors, 8 typography scales, 5 rounding levels, 7 spacing tokens and 29 components.
- The fixed official [alpha specification](https://github.com/google-labs-code/design.md/blob/9bf8eae67128b6cc55ad9bf86665767deb4c11cd/docs/spec.md) confirms the top-level token fields, supported component properties and `{path.to.token}` references. The document keeps the eight standard headings in their required order. Its YAML token block was preserved during this change.
- Executed `buildPalette(DEFAULT_SEED)` directly with Node's TypeScript stripping. All 28 light/dark palette values match the root YAML. No source or generated bundle was written.
- Checked source-owned body typography, shared radii, native focus/disabled values, button/Card geometry, shell/Monitoring/Appearance widths, inspector/drawer bounds, list dimensions, toolbar geometry, motion and reduced-motion conditions. Fourteen automated source assertions passed; direct source reads also confirmed session/request row heights of 132px/360px and the monitoring route-map's separate 760px collapse.
- Local Markdown links and standard heading order were checked programmatically: root `DESIGN.md` has 24 local links, the child PRD has 1, and none are missing. All eight standard headings are in order. Exact root filename enumeration returns only `DESIGN.md`; a case-insensitive filesystem existence check for `Design.md` would be misleading.
- Read `dashboard-routing-config.md` completely, including privacy, monitoring evidence/loading states, focused virtual rows, cursor retry, theme races, contrast and utility/geometry boundaries. Recorded those rules without changing the backend spec.

## Acceptance mapping

| Criterion | Evidence and scope |
| --- | --- |
| ACD1 | Root document retains owning-source links and covers shell, Monitoring, canvas, Settings and controls; provider extensions cite the approved parent design and source research as planned. |
| ACD2 | Palette execution and current CSS/TSX inspection confirm original values, dimensions, breakpoints and motion. No screenshot-derived token guesses. |
| ACD3 | Provider metadata completion, source/freshness/confirmed values and per-provider private-network discovery remain planned. Local official-asset/source/usage rules remain requirements; logo licensing and browser acceptance are not claimed. |
| ACD4 | This agent writes only root `DESIGN.md`, this child PRD and this evidence file. No product edits, other task edits, generated output, commits, archive or revert. Concurrent agents' changes are outside this evidence. |
| ACD5 | Preserved alpha token fields, units and references; eight ordered standard headings pass the official linter and heading check. |
| ACD6 | Fixed CLI version returns exit 0, 0 errors, 0 warnings. Format success establishes document validity, not product accessibility. |

## Remaining integration work and drift

Static fallback colors still differ from the runtime palette, static dark CSS still only sets color-scheme, and the Card comment still says 8px while its lg radius is 0.625rem. Existing tight tracking and small canvas text remain documented exceptions. The Settings write-availability load-order concern remains unverified in a browser.

Provider files may be added concurrently. Keep their interaction contracts planned until the frontend owner completes integration and provides verification. Public metadata suggestions require exact serving-provider applicability, retrieval/source dates, explicit field completion and user confirmation; private-network discovery requires an unchecked per-LLM-provider opt-in. These additions reuse the existing design system and do not alter routing defaults.

No product tests, browser checks, logo licensing audit or whole-application accessibility audit ran in this documentation delivery. Parent integration must verify bilingual narrow/desktop behavior, keyboard/focus, both schemes, stale and failed responses, selection scope, metadata confirmation and permission isolation before promoting planned guidance to current facts.

## Parent integration update

The parent completed 210 frontend units, the full 80-case browser suite (43 Provider cases), six bilingual/light/dark/narrow screenshot inspections, and an independent UI recheck that returned PASS. Settings permission load order and theme read/write races pass the browser cases. Root Provider guidance now describes implemented behavior and cites its owning source; the normative YAML is unchanged. Fixed official lint still returns 0 errors, 0 warnings and 1 info. DeepSeek's unchanged artwork and full MIT notice are verified in both final wheel and sdist. Official artwork coverage is 1/3; OpenAI and Anthropic retain documented neutral fallbacks. Backend 719 tests, Pyright and final package/source checks pass, as recorded in the parent's `acceptance.md`. This update does not claim a whole-application accessibility audit or live-provider account validation.
