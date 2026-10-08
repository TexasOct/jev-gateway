# icon1：统一供应商品牌图标来源

## Goal

Use pinned Lobe Icons for supplier/platform brand artwork while preserving icon selection, identity, local packaging and the DeepSeek symbol-only presentation.

## Requirements

The user requested: “添加一个icon1的修改，平台商icon改用https://github.com/lobehub/lobe-icons”. This is a scoped addition to the active admin-experience delivery.

- IC1: Every registered supplier brand image comes from the pinned Lobe Icons collection. Current non-DeepSeek artwork already uses commit `82e641b4fece9d1028a127149af9ded00df5ac0c`; DeepSeek must use that collection's `deepseek-color.svg`.
- IC2: DeepSeek remains a whale symbol without the wordmark, readable in both themes and at narrow widths. Image proportions, accessible labels, selection and fallback behavior remain usable.
- IC3: Existing icon IDs, aliases, saved choices, supplier/model identities, transport selection and credentials retain their behavior.
- IC4: Artwork is packaged locally, emitted as same-origin SVG files, and carries accurate source/hash/MIT attribution. The credits and both locales describe Lobe as the source for all brand artwork.
- IC5: Targeted asset/registry checks, application/browser compilation, fresh build and relevant browser icon flows pass. Independent acceptance inspects the final source and representative light/dark renders before parent integration.

## Acceptance Criteria

- [ ] All registered brand records use the Lobe source prefix and have matching local/emitted SVG hashes.
- [ ] The DeepSeek asset is the unmodified pinned Lobe symbol; no lettering, active content or external SVG reference is introduced.
- [ ] Saved explicit/generic/automatic icon choices and aliases still resolve to the same IDs, with cancel/save/re-edit behavior preserved.
- [ ] Source credits, license and bilingual copy agree with the delivered images.
- [ ] Independent evidence identifies tested source/bundle, real browser image loading, both schemes and narrow/desktop scope. Full admin acceptance and publication remain separately gated.

## Confirmed evidence

- `shared/icons.ts` owns the registry and `?url&no-inline` image URLs; `ProviderIdentity.tsx` and the picker share that registry.
- `assets/sources.json` records 38 Lobe images and a separate official DeepSeek derivation. `AssetCredits.tsx`, both locales and `assets.test.ts` describe that split.
- The pinned Lobe DeepSeek file exists with viewBox `0 0 24 24`, one whale path and fill `#4D6BFE`; it has no wordmark, scripts, external references or embedded image.
- Generic utility icons remain the existing fallback controls. The requested source applies to supplier brand artwork.
- The source request specifies the collection, not a dependency upgrade. Static local assets satisfy it while preserving the Dashboard CSP and packaging contract.
