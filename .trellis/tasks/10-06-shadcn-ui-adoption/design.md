# shadcn/ui adoption design

## Decisions and boundaries

The user chose component adoption plus moderate page presentation changes, and neutral surfaces with blue/custom emphasis. Keep React/Vite/Tailwind v4, current navigation, API ownership, model/supplier identities, dynamic palette, locale/auth state and feature-specific geometry.

Use the Radix component base, matching the current Slot, Separator and latest Dialog direction. Select the official neutral styling configuration compatible with the pinned CLI; keep the existing new-york-derived appearance as the comparison baseline. Verify actual preset/schema support during foundation setup rather than assuming an old registry identifier is accepted by the current CLI.

The parent owns cross-feature requirements, shell/connection presentation, final integration and delivery. Four children own foundation, shared primitives, configuration surfaces, and operational surfaces. Foundation precedes primitives; both page children consume accepted primitives. Dependency ordering is written in child plans and does not come from tree position.

## Standard component workflow

Add a tested, exact-version shadcn CLI development dependency and retain npm plus `package-lock.json`. Do not add a new package manager or upgrade unrelated dependencies. Run initialization in a disposable copy of the current frontend after approval, inspect its CSS/dependency/alias changes, then apply only reviewed changes.

`frontend/components.json` uses TypeScript, client-side components (`rsc: false`), CSS variables, Tailwind v4's empty config path and `src/styles/index.css` as the CSS entry. Configure:

| Alias | Destination |
| --- | --- |
| components | `@/shared/ui` |
| ui | `@/shared/ui/primitives` |
| utils | `@/shared/ui/utils` |
| lib | `@/shared` |
| hooks | `@/shared/ui/hooks` if generated hooks are required |

Keep the existing `@/*` TypeScript/Vite resolution. Registry files in `primitives/` contain reusable presentation; public wrappers in `shared/ui` preserve project call signatures and business compatibility. This boundary prevents case-only collision between generated `dialog.tsx` and existing `Dialog.tsx` on macOS. Avoid duplicated visual variants across layers: wrappers forward or re-export primitive styling and add only documented behavior.

Once configured, the documented maintenance flow runs from `frontend/`:

```bash
npm exec -- shadcn view input
npm exec -- shadcn add input --dry-run
npm exec -- shadcn add input
npm exec -- shadcn add button --diff
```

Verify the tested CLI supports these documented commands. Updates are reviewed source diffs; do not run `add --overwrite` over project wrappers. A disposable regeneration/diff records upstream changes and deliberate project adjustments. Retain MIT attribution/license notices and update `shared/ui/README.md` with directory, imports, styling, wrapper and upgrade rules.

## Theme and CSS

Keep `applyPalette` and `data-scheme` as theme authority. Preserve default seed, saved seed, preview/commit ordering, stale-read protection and theme APIs. The palette already uses neutral surfaces; map the full needed shadcn semantic vocabulary to it, including popover surfaces and any actual chart/menu roles. Primary/focus/selection follow the seed. Status colors keep contrast safeguards.

Maintain the existing single stylesheet entry and owned CSS files. Do not introduce a competing `.dark`/localStorage theme provider or remotely loaded fonts. Reconcile any new official CSS imports with the existing Tailwind-v4 layer order; Preflight remains disabled unless a separately reviewed need emerges. Scope or remove legacy native-control defaults only as their consumers migrate. Avoid adding more global important rules to conceal competing style systems.

Use standard semantic utility classes in components. Consolidate radius and spacing scales, normal/control/label typography, panel borders and restrained elevation. Preserve current content bounds and mobile/touch sizing. Select wrappers retain established 44px form geometry where required; colors and size variants need computed-style verification, not just source inspection.

The presentation baseline uses the official `0.625rem` base radius with derived smaller control radii, a 4px spacing scale, 14px ordinary text/labels, 12px help and metadata, 16-18px section titles and 20-24px page titles. Dense data can retain the existing smaller typography where it stays readable. Use 16-24px panel padding and grouped field gaps; normal/icon actions use 36-40px variants while established 44px form controls keep their alignment. Keep the current local/system font stack and tabular numbers for comparable metrics. Check rendered Chinese text and long labels before treating these scales as final across every surface.

## Component mapping

The authoritative map is `research/component-migration-map.md`. Add only components used by the migrated surfaces. Official NativeSelect preserves native-browser selection; tri-state capabilities and sentinel options remain selects. Checkbox/Switch only represent current boolean semantics. Error alerts preserve error ownership and live-region roles. Tabs apply to existing content tabs, not guarded app destination changes.

The latest shared Dialog is a controlled Radix composition in the working tree. Preserve its public title/children/footer/onClose/fallbackFocusRef API and its feature-owned guarded-close behavior. Reconcile it with official composition through the public wrapper once the original task's relevant rechecks identify the accepted baseline. Do not reintroduce native showModal or force a new business-close model for this task.

Portals require explicit layering, focus and dismissal verification. Dropdown/Tooltip inside Dialog must remain within its accessible modal scope. Do not silently replace canvas context-menu coordinate and target-ownership logic with generic menu positioning. Preserve local canvas behavior while applying shared menu presentation.

## Page presentation

Settings uses coherent field groups, descriptions and actions, retaining gateway/global-model ownership. Appearance retains native color input preview/commit and current saved/custom mode behavior.

Supplier connections show their existing embedded model rows and edit/discovery actions. Normalize field labels, credential groups, import search/selection/feedback and editor sections without introducing a separate model destination or modal list. Model unknown/automatic/manual/evidence distinctions remain explicit.

Monitoring panels share headings, badges, tabs and feedback while keeping the exact virtual windows, row heights, cursor calls and focused-row retention. Evidence timestamps/outcomes retain their meaning.

Workflow tools, menus, inspector and drawer fields share controls and token colors. Node geometry, SVG paths, measured occlusion, pointer mapping and graph/history state remain module-owned. Preserve DndContext descendants and existing data/measurement hooks.

AppShell and ConnectionPage use accepted shared controls; retain navigation admission guards, current destination order and auth suspension. No client router is introduced.

## Compatibility and operational constraints

Presentation components never own API credentials, config writes, evidence matching or business drafts. Preserve literal empty/unknown/null/keep/set/clear values and existing event ordering. Configuration and theme APIs remain unchanged. No operator data or real upstream calls are required for acceptance.

Keep Vite base `/dashboard/`, ignored output `jev_gateway/static`, same-origin CSP and package asset inclusion. Browser tests run with synthetic APIs and isolated loopback preview servers. Existing tests are preserved and strengthened only for changed behavior; no retries or inflated timeouts mask regressions.

## Risks and rollback

| Risk | Mitigation / rollback boundary |
| --- | --- |
| Concurrent Dialog/dependency/shell edits | Capture latest working and staged baseline before each owning slice; integrate accepted source, never reset to HEAD |
| CLI init rewrites CSS/aliases | Disposable initialization preview; apply reviewed configuration and dependency deltas only |
| Legacy defaults override primitives | Inspect computed styles and consumer census; remove conflicting rules in the owning migration step |
| Portal/focus or native select Escape regressions | Preserve Dialog/Select behavior matrix; hold the affected slice until it passes |
| Checkbox/native value contract changes | Typed compatibility wrappers and focused event/form regressions |
| Geometry changes affect canvas/virtualization | Fixed metric contract plus actual pointer/scroll checks at all representative widths |
| Packaging uses stale assets | Rebuild, freshness check, wheel/source asset parity |

Deliver each slice as a scoped reversible change. Revert only the slice's captured diff against its current baseline; never discard another session's changes or shared index. Generated assets remain untracked and can be rebuilt. If a standard primitive cannot preserve a required behavior, record the specific adapter/retention reason and keep it within the unified visual token system.
