# Provider identities and shared presets

## 1. Scope / trigger

Use this contract for provider template coverage, dashboard icon controls,
brand search, CLI template onboarding and bundled supplier artwork. Provider
transaction and credential rules remain in `provider-configuration.md`.

## 2. Signatures

`provider_presets.py` owns `PRESETS` and `provider_presets()`. The management API
and `jev provider add PRESET` use this registry. CLI parameter options are
`--param NAME=VALUE` and `--param-env NAME=ENV`. Frontend identity rendering and
selection share `features/providers/shared/icons.ts`; new-template parameter projection
uses `initialSetupValues`, `missingSetupFields` and `setupForWrite` in
`features/providers/suppliers/setup.ts`. Shared profile projection/search and
preset ID allocation live in `features/providers/shared/profiles.ts`.

## 3. Contracts

Each LLM preset declares instance ID, display name, brand/icon IDs, a registered
LiteLLM type, a verified endpoint or native null endpoint, and an optional declared
key reference. Aliases, documentation URL, bilingual setup guidance and
`setup_fields` are read-only template metadata. A setup field has `key`,
`target` (`params` or `param_env`), bilingual labels, `required` and an optional
placeholder. Never include this metadata in a catalog provider write.

Account-specific endpoints start empty and require entry. Required project/region
fields block new-template save until filled. An account-scoped template cannot
use the native-default checkbox to bypass its required endpoint. Optional extra
credentials are environment names, never raw secret inputs in parameter controls. Existing
providers' safe/redacted parameter projections remain omitted during ordinary
icon/name edits so the server retains the original dictionaries.

Explicit `icon_id` wins over automatic identity. Null selects the recognized
brand or exact conventional instance ID. `initials` explicitly selects initials;
unknown IDs round-trip and render a neutral fallback. Choosing an icon changes
only `icon_id`, for either provider kind. Icon component lookups must check own
properties; legal IDs such as `constructor` and `__proto__` must remain neutral.
Accepting a credential change cancels candidate requests and clears preview/model
draft state before any further query. Track failed image URLs instead of a
sticky boolean so choosing another image works after a load failure. Generated
SVG asset URLs must be same-origin files; force no inlining because gateway CSP
uses `img-src 'self'` and excludes `data:`.

All supplier brand artwork uses unmodified local SVGs from the pinned Lobe Icons
community collection. `assets/sources.json` stores the collection commit,
`asset_source_prefix`, MIT license evidence, and each `icons.<id>` record's
`original_file`, supplier reference and SHA-256. The registry projects every
source URL as the prefix plus `original_file` and uses the collection license.
The current 39 images use commit `82e641b4fece9d1028a127149af9ded00df5ac0c`.
Generic Lucide controls and initials retain their separate rendering.

DeepSeek uses that collection's exact `deepseek-color.svg` bytes, with a `0 0 24 24`
viewBox, accessible title and one blue whale path (`#4D6BFE`), without a wordmark.
Its SHA-256 is `deba5f98a5c1796e20fcac3149bcd7eb8a32f0bdd04d048819400b1f28bd1439`.
Preserve source bytes, proportions and white backing in both schemes. Keep the
Lobe MIT notice in active credits and both locale descriptions. Historical
DeepSeek derivation/license records may remain preserved; they do not describe
the delivered collection artwork. Supplier references identify brands and do
not establish official distribution or endorsement. Artwork changes preserve
registry IDs/aliases, explicit selections, provider/model identity and transport.
No runtime CDN or new CSS/CSP/storage boundary is added.

## 4. Validation and error matrix

| Condition | Result |
| --- | --- |
| Explicit brand or generic icon | Preview, save and re-edit the same selection |
| Null, missing, unknown or failed icon | Automatic or neutral fallback; saved identity retained |
| Another logo chosen after a failure | Try the newly selected URL |
| Template chosen with an existing instance ID | Prefill a distinct editable new ID |
| Required cloud field or account endpoint absent | Block UI save; CLI returns missing option before write |
| Duplicate CLI parameter name or malformed assignment | Usage error; no configuration write |
| Literal credential parameter or reserved field | Existing catalog validation rejects; files unchanged |
| Cancel or browse/search/select without save | No catalog or credential write |

## 5. Good/base/bad cases

Good: a DeepSeek-branded custom proxy uses a Qwen icon while retaining its OpenAI
transport, instance ID and model references. Base: an older provider with no icon
fields remains valid. Bad: inferring transport or metadata-provider identity from
the chosen icon, copying `[configured]` parameter values into a write, or accepting
a template selection as permission to add routable models.

## 6. Tests required

Backend tests check all declared preset types, shared CLI choices, default fields,
account setup, API/disk/reload icon round trips and immutable model IDs. Frontend
tests check explicit icon precedence, aliases, unknown fallback and new-template
parameter projection. Browser tests cover both kinds, independent selection,
cancel/reset/save/re-edit, image failure recovery, packaged images under the
gateway CSP, visible focus and 320px/390px/desktop in both locales and schemes.
Check built wheel asset parity, source hashes, SVG safety and retained licenses.
Assert the registry, manifest and local/emitted SVG sets are identical, including
DeepSeek in the shared collection. Check exact DeepSeek source-byte/hash/license
parity and symbol-only structure, plus byte preservation for unchanged artwork.
Browser checks retain image failure recovery, identity and credential operation
assertions when a provenance source changes. A fixture-applied gateway CSP proves
that browser loading scope; installed-wheel and actual backend checks separately
prove packaging and production delivery.

## 7. Wrong vs correct

Wrong: `if (provider.brand_id === "deepseek") renderDeepSeek()` ignores a selected
generic or another brand icon. Correct: resolve the explicit icon first and use
automatic brand identity only when `icon_id` is null.

Wrong: importing a small SVG as a normal URL and trusting the Vite preview to
prove gateway compatibility. Correct: force `?no-inline`, inspect emitted files,
and verify image loading with the gateway's actual CSP.
