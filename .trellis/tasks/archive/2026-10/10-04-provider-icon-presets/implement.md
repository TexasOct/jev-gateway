# Implementation and verification

## Plan

- [x] Persist source research and review requirements against current code.
- [x] Curate implement/check context, validate planning artifacts and activate the task under the user's autonomous implementation authorization.
- [x] Package pinned, safe SVG assets with source/license/checksum metadata.
- [x] Implement the identity registry, searchable picker, preview and fallback compatibility; add dual-language copy.
- [x] Expand the shared provider presets using verified transports/endpoints/aliases and support required cloud parameters through existing configuration contracts.
- [x] Verify CLI/API preset parity, icon persistence, immutable identities and old configurations.
- [x] Run browser coverage for create/edit, both kinds, selection/reset/cancel, failure recovery, templates, aliases, keyboard, themes and narrow widths; inspect screenshots.
- [x] Run required full-scope checks and independently review the final diff.
- [x] Record the executable identity/preset contract in the backend spec and finish the scoped work commit without including existing journal edits.

## Commands

```sh
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run test:browser -- provider-management.spec.ts provider-icons.spec.ts provider-presets.spec.ts
uv run pytest -q
uvx pyright
scripts/build-frontend.sh --check
uv build
```

## Review and rollback points

The risky boundaries are explicit icon precedence, stale failed-image state, native null endpoints, cloud parameters and CLI/API registry parity. Test these directly. Use synthetic keys and isolated files; upstream source lookup is read-only and no generation request is part of acceptance. Inspect packaged assets rather than treating build success as proof of image coverage. Preserve the pre-existing `.trellis/workspace/TexasOct/` edits.
