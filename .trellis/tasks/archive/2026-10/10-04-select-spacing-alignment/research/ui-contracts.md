# Source-backed UI contracts

- `.trellis/spec/backend/dashboard-routing-config.md:683` defines the nine existing stylesheet files and the Tailwind v4 boundaries. Component appearance belongs in JSX utilities; small shared element/control defaults may live in CSS. Keep runtime palette variables and `data-scheme`; no static dark class, remote assets or persisted browser theme.
- `.trellis/spec/backend/dashboard-routing-config.md:266` declares same-origin CSP. A data-URI background icon may be blocked by `img-src 'self'`; use source-native CSS geometry for this small arrow or an explicit same-origin asset.
- `.trellis/spec/backend/quality-guidelines.md:176` requires frontend lint/unit and bundle freshness for frontend changes. Build ignored assets before freshness; serialize asset writers and never commit generated bundles.
- `frontend/src/styles/index.css` resets native controls without disabling the native select arrow. `frontend/src/styles/base.css` holds shared element defaults. `frontend/src/features/providers/constants.ts` sets minimum control height to 44px through `min-h-11`.
- `frontend/src/features/providers/ProviderView.tsx` has a two-column main field grid without `items-start`, adjacent to an endpoint group with a native-endpoint checkbox. Preserve all callback/value/write-protection logic while adding the layout utility.
- Existing browser fixtures use mocked same-origin APIs, block unexpected requests, set locale and exercise both LLM/decision Provider editing. Locate the authoritative isolated `provider-management.spec.ts` and fixture helpers; do not assume an old worker's guessed selectors or styles.
- The primary read tool and screenshot agent omitted the original PNG and both resized JPEGs. Native Vision OCR read the local PNG and matched only public translation labels. Raw recognized identifiers remain in `.git/jev-select-preflight/ocr-private.json` with a private boundary; never commit or expose them.

The original shared checkout may continue changing for icon-preset and credential tasks. Isolation and final owned-hunk transfer are required; a stale file hash is not permission to overwrite another task's changes.
