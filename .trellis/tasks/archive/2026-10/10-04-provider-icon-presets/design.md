# Provider identity and presets design

## Boundaries

`provider_presets.py` owns the shared template registry; the CLI derives its allowed preset names and provider fields from it. The management API projects the same entries with aliases, source and any setup guidance. Catalog display fields and their permissive bounded-string compatibility remain intact.

The frontend identity registry owns packaged logo URLs, labels and search aliases. `ProviderIdentity` resolves explicit `icon_id` first, then automatic brand/recognized instance identity. `initials` explicitly suppresses a brand logo. Unknown IDs fall back without replacing saved data. Failure state identifies the failed URL so a different image is still usable.

`ProviderIconPicker` is a view-owned form control with current preview, a collapsible searchable grid, automatic choice and generic choices. It changes only `icon_id`, reusing the existing draft and discard guards. Selection never submits the form. `ProviderView` places it above advanced transport details and prepopulates new instance IDs from templates while keeping editable custom IDs and immutable existing IDs.

## Presets and cloud setup

Retain the existing native OpenAI, Anthropic and DeepSeek behavior. Prefer an installed native transport with verified endpoint defaults; use OpenAI only for documented compatible endpoints. Account-scoped endpoints begin empty, require entry before save, and link their setup documentation. Vertex/Bedrock parameters must reach existing `params`/`param_env` through an explicit supported form/CLI path; ordinary editing must continue omitting redacted parameters so they survive. No preset inserts imaginary credentials or model capabilities.

## Assets

Use the existing official DeepSeek asset and unmodified provider artwork from the MIT-licensed Lobe Icons static SVG collection pinned to commit `82e641b4fece9d1028a127149af9ded00df5ac0c`. Package individual assets, license and per-asset checksums with links to each supplier's official site. Attribution distinguishes official repository artwork from licensed library artwork. White logo backings preserve both monochrome and colored SVG visibility in both themes. No runtime CDN request or CSP change is needed.

## Compatibility and rollback

There is no catalog migration. Missing optional fields retain automatic fallback; explicit unknown icons round-trip. Brand and transport remain independent. Presets are templates and leave configured catalogs alone until an explicit validated save. Reverting registry/UI additions leaves persisted display strings valid and handled by the legacy fallback.
