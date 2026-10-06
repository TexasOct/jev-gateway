---
version: alpha
name: JEV Gateway
description: Compact operator dashboard for routing, provider configuration and request evidence.
colors:
  primary: "#2958d6"
  primary-hover: "#244ebc"
  primary-active: "#1f43a2"
  on-primary: "#ffffff"
  background: "#f8f9fa"
  surface: "#ffffff"
  surface-alt: "#f2f3f5"
  code: "#f4f4f5"
  outline: "#d8d9de"
  on-surface: "#18181b"
  on-surface-muted: "#52525b"
  success: "#158449"
  error: "#c53620"
  caution: "#956718"
  primary-dark: "#6a86d2"
  primary-hover-dark: "#7d96d8"
  primary-active-dark: "#91a6de"
  on-primary-dark: "#10161f"
  background-dark: "#0b0b0c"
  surface-dark: "#161618"
  surface-alt-dark: "#222225"
  code-dark: "#1b1b1e"
  outline-dark: "#38383e"
  on-surface-dark: "#f4f4f5"
  on-surface-muted-dark: "#b4b4bd"
  success-dark: "#3eda87"
  error-dark: "#da533e"
  caution-dark: "#daa13e"
typography:
  body-md:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  headline-sm:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0px
  headline-md:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: 0px
  inspector-body:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  label-md:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0px
  caption:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0px
  metadata:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  technical-data:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
rounded:
  none: 0px
  native: 0.4rem
  sm: 0.375rem
  md: 0.5rem
  lg: 0.625rem
spacing:
  none: 0px
  base: 4px
  sm: 8px
  md: 12px
  lg: 16px
  frame: 20px
  xl: 24px
components:
  page:
    backgroundColor: "{colors.background}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
  page-dark:
    backgroundColor: "{colors.background-dark}"
    textColor: "{colors.on-surface-dark}"
    typography: "{typography.body-md}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  card-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-surface-dark}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  muted-label:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.caption}"
  muted-label-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-surface-muted-dark}"
    typography: "{typography.caption}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 36px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
  button-primary-dark:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.on-primary-dark}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 36px
  button-primary-hover-dark:
    backgroundColor: "{colors.primary-hover-dark}"
    textColor: "{colors.on-primary-dark}"
  button-primary-active-dark:
    backgroundColor: "{colors.primary-active-dark}"
    textColor: "{colors.on-primary-dark}"
  button-secondary-hover:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
  button-secondary-hover-dark:
    backgroundColor: "{colors.surface-alt-dark}"
    textColor: "{colors.on-surface-dark}"
    rounded: "{rounded.md}"
  tool-button:
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.none}"
    size: 40px
  tool-button-small:
    size: 36px
  tool-button-large:
    size: 44px
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.native}"
  input-field-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-surface-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.native}"
  code-block:
    backgroundColor: "{colors.code}"
    textColor: "{colors.on-surface}"
    typography: "{typography.technical-data}"
  code-block-dark:
    backgroundColor: "{colors.code-dark}"
    textColor: "{colors.on-surface-dark}"
    typography: "{typography.technical-data}"
  divider:
    backgroundColor: "{colors.outline}"
    height: 1px
  divider-dark:
    backgroundColor: "{colors.outline-dark}"
    height: 1px
  status-success:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.success}"
    typography: "{typography.caption}"
  status-success-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.success-dark}"
    typography: "{typography.caption}"
  status-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    typography: "{typography.caption}"
  status-error-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.error-dark}"
    typography: "{typography.caption}"
  status-caution:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.caution}"
    typography: "{typography.caption}"
  status-caution-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.caution-dark}"
    typography: "{typography.caption}"
---

# JEV Gateway

## Overview

JEV Gateway is a compact operator dashboard for engineers configuring providers and routing, then inspecting request evidence. Use neutral surfaces, readable hierarchy, restrained borders and one primary action family. Keep useful information visible without framing every section as a card. The first screen is the usable dashboard, not a marketing hero.

This document follows the [Google DESIGN.md alpha specification](https://github.com/google-labs-code/design.md/blob/9bf8eae67128b6cc55ad9bf86665767deb4c11cd/docs/spec.md). YAML tokens are the normative default values; prose describes their roles and application. Un-suffixed tokens are light-scheme values. The corresponding `-dark` tokens and component variants define dark-scheme values; the alpha format has no separate theme object.

The source baseline is the working tree for the 2026-09-30 Provider task, including uncommitted visual work. Existing differences are recorded with their sources. Provider interactions below are implemented and covered by 210 unit tests, 43 Provider browser cases within the 80-case full browser suite, and an independent review of the five state-handling corrections. The parent [acceptance record](.trellis/tasks/archive/2026-10/09-30-provider-configuration-experience/acceptance.md) tracks backend and release checks separately. Task-local `design.md` remains the technical architecture document; root `DESIGN.md` describes the interface.

Preserve the current React, Tailwind and shared-component foundation. The shell has Monitoring, Strategy, Suppliers, Models and Settings views without a client-side router. Settings owns language, appearance, gateway access/security and the global default model. Suppliers owns upstream connections and credentials; Models owns model configuration, discovery, metadata review and explicit import.

## Colors

The palette combines neutral canvas/surface layers with a seed-derived primary action color. Text is dark charcoal in light mode and pale neutral in dark mode. Success, error and caution have operational meanings; they are not decorative accent families. Official logo colors are also distinct from the interface palette.

| Role | Light token/value | Dark token/value | Application |
| --- | --- | --- | --- |
| Primary action | `primary` / `#2958d6` | `primary-dark` / `#6a86d2` | Main command, selection, focus |
| Canvas | `background` / `#f8f9fa` | `background-dark` / `#0b0b0c` | Page and workspace |
| Main surface | `surface` / `#ffffff` | `surface-dark` / `#161618` | Controls and framed tools |
| Subtle surface | `surface-alt` / `#f2f3f5` | `surface-alt-dark` / `#222225` | Neutral hover and grouping |
| Code surface | `code` / `#f4f4f5` | `code-dark` / `#1b1b1e` | Machine-readable content |
| Structural border | `outline` / `#d8d9de` | `outline-dark` / `#38383e` | Low-emphasis separation |
| Main ink | `on-surface` / `#18181b` | `on-surface-dark` / `#f4f4f5` | Primary readable text |
| Secondary ink | `on-surface-muted` / `#52525b` | `on-surface-muted-dark` / `#b4b4bd` | Metadata and labels |
| Success | `success` / `#158449` | `success-dark` / `#3eda87` | Confirmed successful result |
| Failure | `error` / `#c53620` | `error-dark` / `#da533e` | Failed operation or invalid field |
| Caution | `caution` / `#956718` | `caution-dark` / `#daa13e` | Warning or incomplete result |

These values were obtained by executing [the existing palette builder](frontend/src/shared/theme/palette.ts) with its default seed `#3b66d9`. Neutral values remain fixed. Primary, hover, active, label and status colors are generated when the saved seed changes; a user-customized seed must use that builder, not reinterpret the seed as the computed primary value.

Runtime palette application owns root variables and `data-scheme`. Tailwind `primary` maps to the seed-derived accent, while the shadcn `accent` role maps to the neutral alternate surface. Do not add a second global palette or recolor supplier logos with the seed.

Normal text and ordinary button labels target `4.5:1`; large text targets `3:1`. The lower target does not apply to small status labels. Structural border contrast alone must not identify interactive or focused controls. Check status text against every surface on which it appears.

### Existing fallback difference

[tokens.css](frontend/src/styles/tokens.css) has different pre-application values: canvas `#f5f7fa`, surface `#ffffff`, alternate `#eef1f7`, code `#edf1f7`, border `#d8dee8`, text `#17202a`, muted `#5c6b80`, primary `#3b66d9`, hover `#3259c2`, active `#294ba9`, label `#ffffff`, success `#1f7a4b`, error `#b33b3b`, caution `#8a5a00`. Static dark CSS declares `color-scheme` only. These are implementation fallbacks, not a second normative palette; a visible startup flash has not been verified.

## Typography

Use the existing system sans-serif stack for prose and controls, and the existing utility mono stack for technical IDs and code. The body is `14px` with `1.5` line height; no external font download is required. New provider controls use zero letter spacing and stable type sizes.

| Token | Size / weight | Role |
| --- | --- | --- |
| `body-md` | `14px` / `400` | Body and entered values |
| `headline-sm` | `14px` / `600` | Shell and section heading |
| `headline-md` | `17px` / `600` | Strategy heading |
| `inspector-body` | `13px` / `400` | Selected-node fields; its heading uses `headline-sm` |
| `label-md` | `14px` / `500` | Button and control label |
| `caption` | `12px` / `400` | Secondary/table content |
| `metadata` | `11px` / `400` | Compact shell metadata |
| `technical-data` | `14px` / `400`, monospace | Code and machine-readable values |

Communicate hierarchy through weight, spacing and semantic foreground colors. Prose may use a `65ch` maximum, while forms and data tables retain functional grid widths. Long supplier names wrap or truncate with an accessible full name. Model IDs may break inside a bounded content area; they cannot widen the page or displace controls.

Existing shell headings use tight tracking, some monitoring text scales with the viewport, and dense canvas labels use `10px`/`11px`. These legacy exceptions are not new form-text defaults. New provider text must not use negative tracking or viewport-scaled font sizes.

## Layout

Keep the five-view shell and page ownership. Supplier connections and model configuration have separate navigation entries. Settings retains language and appearance alongside access/security and the global default model. Use grid tracks, bounded containers and shrink/wrap behavior. Align repeated labels and actions, and keep control geometry stable when content changes.

| Surface | Existing geometry |
| --- | --- |
| Non-strategy shell | Maximum `1440px`; horizontal `16px`, vertical `20px`, gap `16px`; large horizontal padding `24px` |
| Monitoring view | Maximum `1280px`, centered; `280px`-to-`380px` left column, collapses below `899px` |
| Provider and Settings views | Maximum `768px`, centered; controls fill the bounded column |
| Strategy shell/workspace | Shell `100dvh`, `auto minmax(0, 1fr)` rows; centered workspace maximum `1440px`, fills remaining height |
| Narrow shell | At `720px` and below: `12px` padding and gap |
| Inspector | Width `min(340px, 100vw - 24px)`, height at most `460px` |
| Bottom drawer | Height at most `min(48%, 36rem)`, internal scrolling |
| Canvas toolbar | Bottom/left `12px`, width `calc(100% - 24px)`, measured occlusion |
| Session list | Fixed `480px` desktop / `280px` narrow viewport; `132px` rows |
| Request timeline | Fixed `480px` desktop / `62vh` narrow viewport; `360px` rows |

Monitoring uses a centered `1280px` maximum and a `280px`-to-`380px` left column. Provider and Settings views use centered `768px`-wide content. The strategy workspace centers within a `1440px` maximum and retains the available viewport height. Settings presents language, color scheme and theme seed as three peer rows. Each row stacks on narrow screens and uses `minmax(9rem, 0.7fr) / minmax(0, 1fr)` columns from `sm` upward. Theme controls wrap within their row.

The three seed presets and custom picker are `36px` circles. A selected preset uses a separated outer accent highlight, with no central tick. A custom seed highlights the picker instead. The picker has a multicolor surface and a decorative Lucide Pencil, retaining its localized native color-input name and keyboard focus. This gradient identifies color customization; it does not change the palette or add another page accent. Native input previews stay local until change commits the selected seed.

### Responsive behavior

Utility thresholds are `sm: 40rem`, `md: 48rem`, `lg: 64rem`. Existing business thresholds are `720px` for shell/list/table behavior, `899px` for monitoring collapse, and `900px`/`600px` for canvas tools. Reuse the owning view's threshold instead of replacing all boundaries with a global rule.

The monitoring route map additionally stacks its internal columns at `760px` in [StrategyDistribution.tsx](frontend/src/features/monitoring/components/StrategyDistribution.tsx). This is separate from the Monitoring view's `899px` outer-grid collapse.

The header is a single large-screen row. Navigation moves below it and can scroll locally on smaller screens. Canvas panning and bounded table/navigation scrolling are intentional; page-level horizontal overflow is not. Provider browsing/forms collapse to a readable flow when their content no longer fits, keeping search and primary actions reachable.

Canvas stored coordinates remain unscaled. Fit/reveal accounts for inspector, drawer and toolbar occlusion. Layout saves do not apply routing policy; model edits retain validate, review and explicit apply. Fixed-height monitoring lists preserve pagination, deduplication and focused-row retention.

## Elevation & Depth

Depth comes from tonal layers, structural borders and compact grouping. The canvas sits behind the shared header; inspectors and toolbars are measured workspace overlays with clear hit targets. Do not introduce promotional floating panels or decorative card stacks.

Existing outline/secondary controls use Tailwind's small shadow: `0 1px 2px 0 rgb(0 0 0 / 0.05)`. The current inspector uses `0 8px 28px color-mix(in srgb, var(--text) 16%, transparent)` to separate its overlay from the canvas. Reuse these existing treatments for the same roles; there is no shared custom shadow scale. Ordinary page sections use whitespace and borders; shadow must not substitute for focus or selection feedback.

The palette's existing border measurement target is `1.2:1`, separate from text contrast. It is not proof of accessible interactive boundaries. New controls still need distinguishable focus and state treatment.

## Shapes

Use compact rectangular controls and restrained corners. The current radius scale is `sm: 0.375rem`, `md: 0.5rem`, `lg: 0.625rem`, plus native `0.4rem` controls. At a `16px` root these shared tokens are `6px`, `8px` and `10px`.

New provider items and controls use `sm` or `md`. The existing Card uses `lg`; its comment says 8px even though the emitted token is `0.625rem`. Record that mismatch without changing shared components during documentation work. Cards are for repeated items, dialogs and genuinely framed tools, not page sections or nested decoration.

Supplier logos retain their original proportions. Reserve a stable identity area so different artwork, missing images and long names cannot change result-row geometry. Do not turn option sets into oversized pills when a standard select, tab or icon control is appropriate.

## Components

### Buttons and tools

Use [shared Button variants](frontend/src/shared/ui/button-variants.ts). Primary commands use the primary fill/label pair and defined hover/active variants. Secondary and tertiary commands use neutral/outline or ghost treatment. Destructive actions remain distinct and explicit.

Current shared buttons use `36px` default/small and `40px` large heights; icon sizes are `36px`, `40px` and `44px`, with default SVG size `16px`. New touch-facing provider controls provide at least a `44px` target without enlarging all desktop text. Pending operations cannot be submitted twice, and keep their original dimensions.

Focus uses a `2px` primary outline and `2px` offset. Native disabled opacity is `0.65`; shared Button uses `0.5`. Hover/press feedback changes color without glow or layout shift.

### Forms, cards and lists

Persistent labels sit above inputs; validation messages sit below. Placeholders are not labels. Keep required provider fields and type/protocol visible, with advanced options disclosed as needed. Use conventional controls for boolean, numeric, color and option-set values.

Native button padding is `0.45rem 0.7rem`; input padding is `0.45rem 0.55rem`. Shared Card uses `16px` vertical padding, `16px` content-slot padding and `16px` gaps. The machine-readable `card.padding` represents its content spacing, not a command to double-pad every slot.

Search supports clear, loading, no results, selection and keyboard focus. Navigation preserves edited fields or explicitly confirms discarding them. Loading reserves final geometry. Empty configuration, empty search, unsupported discovery and failed requests have distinct states, with errors scoped to their owning operation and a relevant recovery action.

### Icons and provider identities

Lucide remains the operation-icon family. Icon-only controls need an accessible name and tooltip; decorative SVGs use `aria-hidden` and `focusable="false"`. Geometry-specific canvas/route SVG remains native. The product mark is currently styled text J.

Supplier browsing and search use locally bundled, verified official logos with a source/usage manifest and appropriate dark/light variants. Preserve brand treatment; do not recolor artwork with the theme seed without permission. Custom instances may select packaged identity icons, with a neutral fallback and readable name for missing assets. Lucide symbols are not official supplier logos.

Verified official artwork currently covers DeepSeek, with a white backing in both schemes and unchanged SVG bytes. OpenAI and Anthropic use neutral initials because their downloadable artwork and local-use terms were not verified. The [source manifest](frontend/src/features/providers/assets/sources.json) records coverage and fallback reasons; the [full MIT notice](frontend/src/features/providers/assets/LICENSE-deepseek.txt) is bundled into JavaScript. Wheel and sdist checks verify the same artwork hash and full notice. Broken images keep the identity area's dimensions and fall back to readable initials.

Separate LLM providers and decision providers, both with custom entry points. Brand, instance ID and transport/protocol remain distinct. The decision selector shows supported `system_one` as System One. Remote model discovery and configured routable entries must remain visibly different, with provider-qualified identities for ambiguous same-name models. Manual input and retry remain available. Model discovery is followed by explicit selection and import, with an intentional select-all action and a visible scope/count; fetching or refreshing never adds routable models.

New-model import requires complete or explicitly confirmed routing metadata before submission. Verified lookup data may prefill prices and capabilities; show its source and applicable serving provider, and support batch confirmation. Missing or conflicting values remain visible and editable. Unknown price is not free, unknown capability is not supported, and refreshing suggestions never overwrites user edits or configured models. Existing catalog defaults remain unchanged.

### Metadata completion and provenance

Reuse the existing labels, compact rows, notices and error treatments for metadata review. Each field shows its candidate value or an explicit unknown/conflict state, source, applicable provider/model and unit. Keep online suggestions distinct from the values the user confirms for routing. Source details may use progressive disclosure, but incomplete fields and import eligibility remain visible.

Show retrieval time (`fetched_at`) separately from any source-declared update date. Mark cache hits and stale fallback; when the source provides no reliable update time, show it as unavailable. Models.dev `last_updated` is a source-declared date and cannot certify when a value was verified. Refresh, source failure, no match and conflicting evidence have separate states. A failed lookup preserves confirmed values and offers retry or manual entry.

Prefer native metadata for the actual serving provider, then an exact Models.dev provider/model match. OpenRouter prices apply to OpenRouter serving; a custom endpoint needs its own applicable quote or manual confirmation. The installed LiteLLM backup is a snapshot fallback with its provenance shown. Display input/output prices in USD per million tokens. Preserve conditional, cache and other fee evidence in details; two base prices do not describe a complete bill. Public sources receive no user credentials, private endpoint or request content.

Before import, require two finite nonnegative prices, explicit boolean values for tools, vision, JSON mode, reasoning and temperature, a reasoning-effort list, and context/output limits. Unknown limits require explicit confirmation of null. Zero price requires a source declaration or an explicit user confirmation. Review capability fields separately; a name, release date or general structured-output claim cannot complete them. Keep quality, tags and priority under the existing user/default rules.

Batch fill and confirmation display the affected selected-model count and field scope. Lookup results prefill only untouched fields. Disable import while required values or confirmations are missing, explain the remaining fields beside the action, and submit only the selected provider-qualified models after explicit confirmation. Already configured entries retain their values. Refreshing data never changes strategy membership. These rules follow [the approved parent design](.trellis/tasks/archive/2026-10/09-30-provider-configuration-experience/design.md) and [metadata source research](.trellis/tasks/archive/2026-10/09-30-provider-configuration-experience/research/model-metadata-sources.md).

Current values, field status, source details and confirmation use the same latest evidence. Earlier evidence is labeled separately and retained as provenance. A null/unknown source does not conflict with a known value; false, zero and an empty effort list remain explicit values. A configuration revision change invalidates old queries and automatic suggestions, while preserving manual values and resetting confirmation. Endpoint, transport and credential changes use the model-draft discard guard. Candidate preview followed by saving the same candidate retains reviewed models for import. A committed save/import followed by failed catalog refresh is shown as applied with a failed read; retry only refreshes the catalog.

### Private-network discovery

Offer an unchecked, per-LLM-provider `allow_private_network` control in the provider form. Explain that it permits model discovery against loopback/private HTTP or HTTPS endpoints from the gateway. The setting is independent of theme preferences and chat transport, and must never be inferred from a brand or endpoint. Preserve its explicit choice when editing the instance; switching provider drafts cannot carry permission into another provider accidentally.

Default discovery accepts public HTTPS. The opt-in still excludes unspecified, multicast, link-local and cloud metadata targets, retains TLS verification and rejects redirects. A blocked or unsupported discovery request has a scoped explanation and a manual-entry recovery path. Decision System One uses its full evaluation URL and optional manual model; this control does not imply a model-list protocol for it. The exact transport restrictions belong to [the parent design](.trellis/tasks/archive/2026-10/09-30-provider-configuration-experience/design.md).

### Motion, keyboard and data boundaries

Motion communicates user feedback, state transitions or observed activity. Idle forms and supplier lists stay still. Existing configured traces run once for `900ms` ease-out; dragged nodes use a `0.9s` repeating pulse. Monitoring flow/pause reflects process-local observations, not supplier health or discovery progress.

New motion uses `transform`/`opacity` without changing layout dimensions, and honors `prefers-reduced-motion`. Repeating effects become static. Keep search, tabs, selection, fields and recovery keyboard-reachable. Escape closes temporary detail surfaces and restores focus. Existing canvas tools use roving focus, named groups and polite zoom status; Appearance exposes `aria-busy`, alerts and notices.

Keys remain write-only and never appear in URL parameters, browser preferences, logo requests or raw error copy. Gateway credentials stay in module memory; only locale uses `jev-dashboard-locale` browser storage. Seed uses the theme API; scheme preference is React state. Theme save/reset works without a configured gateway key and retains Bearer validation when one is configured. Routing/provider write availability does not disable Settings color controls; only theme loading or a pending theme operation does. Preserve delayed-read, write-failure and reconnection handling. Cancellation, provider changes and newer requests prevent stale model results from replacing current state.

Monitoring timestamps and outcomes describe retained evidence. A latest-session preview stays unselected until chosen. A selected session awaiting detail shows loading; no selection, empty evidence and failed reads use distinct copy. Preserve the last successful cursor for retry, deduplicate stable IDs, and keep focused virtual rows mounted. Incomplete observations cannot certify zero activity or provider health. Theme save/reset shares one pending guard and preserves the latest operation's notice/error against stale reads. These are existing state and privacy contracts in [dashboard-routing-config.md](.trellis/spec/backend/dashboard-routing-config.md), with browser verification separate from this source review.

## Do's and Don'ts

- Do use semantic tokens and keep the same scheme across the page; do not create a second theme or competing decorative accents.
- Do keep operational hierarchy compact; do not add hero-scale type, marketing layouts or visible feature explanations.
- Do preserve keyboard, focus and reduced-motion behavior; do not rely only on color or permanent animation for state.
- Do reserve geometry for tools, logos, rows and loading; do not let status changes or long IDs shift the layout.
- Do use official local supplier assets and distinct operation icons; do not generate logos, infer identity from favicons or inject arbitrary remote SVG.
- Do distinguish brand, provider instance and protocol; do not present System One as a supplier brand or guess transport from a logo.
- Do distinguish discovered and configured models; do not infer unknown model capabilities or costs from names.
- Do use cards for repeated/framed items; do not nest decorative cards or make every section float.
- Do keep text sizes stable and letter spacing at zero in new controls; do not add negative tracking or viewport-scaled provider text.
- Do preserve routing review/apply and independent layout saves; do not turn layout motion or historical observations into health claims.
- Do show scoped errors and recovery; do not expose secrets, raw upstream errors, fabricated metrics or unverified availability.
- Do keep Settings preferences separate from provider configuration; do not persist keys through theme or browser storage.
- Don't add neon glows, gradient orbs, bokeh, decorative blobs, oversized pills or ornamental card stacks.

### Source ownership

| Concern | Source |
| --- | --- |
| Shell and state orchestration | [AppShell.tsx](frontend/src/app/AppShell.tsx), [App.tsx](frontend/src/app/App.tsx) |
| Palette, fallback and body font | [palette.ts](frontend/src/shared/theme/palette.ts), [tokens.css](frontend/src/styles/tokens.css), [base.css](frontend/src/styles/base.css) |
| Utility mapping and shared controls | [index.css](frontend/src/styles/index.css), [button-variants.ts](frontend/src/shared/ui/button-variants.ts), [card.tsx](frontend/src/shared/ui/card.tsx) |
| Monitoring and Appearance | [MonitoringView.tsx](frontend/src/features/monitoring/MonitoringView.tsx), [AppearanceView.tsx](frontend/src/features/appearance/AppearanceView.tsx) |
| Supplier connections and credentials | [ProviderView.tsx](frontend/src/features/providers/suppliers/ProviderView.tsx), [ProviderSetupFields.tsx](frontend/src/features/providers/suppliers/ProviderSetupFields.tsx), [TransportCredentialFields.tsx](frontend/src/features/providers/suppliers/TransportCredentialFields.tsx), [useSupplierConnection.ts](frontend/src/features/providers/suppliers/useSupplierConnection.ts) |
| Model workspace and review | [ModelManagementView.tsx](frontend/src/features/providers/models/ModelManagementView.tsx), [ProviderModels.tsx](frontend/src/features/providers/models/ProviderModels.tsx), [ModelDialog.tsx](frontend/src/features/providers/models/ModelDialog.tsx), [ModelFields.tsx](frontend/src/features/providers/models/ModelFields.tsx), [model.ts](frontend/src/features/providers/models/model.ts) |
| Shared provider configuration and identities | [useProviderManagement.ts](frontend/src/features/providers/shared/useProviderManagement.ts), [profiles.ts](frontend/src/features/providers/shared/profiles.ts), [ProviderIdentity.tsx](frontend/src/features/providers/shared/ProviderIdentity.tsx), [icons.ts](frontend/src/features/providers/shared/icons.ts), [AssetCredits.tsx](frontend/src/features/providers/shared/AssetCredits.tsx) |
| Gateway access and security | [AccessSecurity.tsx](frontend/src/features/settings/AccessSecurity.tsx), [GatewayCredentialForm.tsx](frontend/src/features/settings/GatewayCredentialForm.tsx) |
| Routing and geometry | [RoutingEditor.tsx](frontend/src/features/routing/RoutingEditor.tsx), [RoutingCanvas.tsx](frontend/src/features/routing/RoutingCanvas.tsx) |
| Existing motion | [ConfiguredRouteFlow.tsx](frontend/src/features/routing/ConfiguredRouteFlow.tsx), [routing.css](frontend/src/styles/routing.css), [monitoring.css](frontend/src/styles/monitoring.css) |
| Layout, privacy and packaging | [dashboard-routing-config.md](.trellis/spec/backend/dashboard-routing-config.md) |

Provider source is grouped under `suppliers/`, `models/` and `shared/`; its twelve unit test files live in `__tests__/`. Shared modules consume API types, icons and common controls without importing supplier or model UI. Artwork and provenance remain in the root `assets/` directory. The [directory design](.trellis/tasks/10-05-admin-experience/research/provider-directory-design.md) records the move and extraction boundaries. Historical verification above retains its original candidate scope.

The only stylesheet entry imports Tailwind theme/utilities without Preflight, followed by `tokens.css`, `base.css`, `shell.css`, `monitoring.css`, `routing.css`, `canvas-geometry.css`, `appearance.css`, and `virtual-list.css`. Static appearance stays in the existing utility system; measured coordinates and data-derived colors remain at their owning elements.

### Verification

Validate the document with the official format linter:

```bash
npx --yes @google/design.md@0.4.0 lint --format json DESIGN.md
```

Format validation does not certify the running application. Interface acceptance separately checks actual styles, keyboard/pointer targets, logo provenance, loading/error/stale states and reduced motion in `zh-CN`/`en`, both schemes, `320px`, `390px`, desktop and the existing `1430 x 2511` canvas viewport. Keep generated `jev_gateway/static/` output untracked.
