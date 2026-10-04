# Icon assets and current implementation

The original `ProviderIdentity.tsx` renders DeepSeek or one of four Lucide icons, then initials. The `failedAsset` boolean remains true after an image failure even if the selected identity changes. The picker lives inside advanced settings and offers only `initials`, `server`, `cloud`, `circuit`, `globe`.

Existing optional `brand_id` and `icon_id` persist through the provider configuration transaction for both kinds. They do not require a new catalog schema or icon whitelist.

Lobe Icons documents its static SVG package in https://github.com/lobehub/lobe-icons. GitHub tree lookup verified individual icons for the requested international and Chinese providers at commit `82e641b4fece9d1028a127149af9ded00df5ac0c` under `packages/static-svg/icons/`. The source LICENSE is MIT, Copyright (c) 2023 LobeHub, at https://raw.githubusercontent.com/lobehub/lobe-icons/82e641b4fece9d1028a127149af9ded00df5ac0c/LICENSE. Retain the exact license locally. Supplier reference links are declared in the collection's `src/<Provider>/index.mdx` front matter; the OpenAI entry points to https://openai.com. Library artwork is attributed as library artwork, not represented as an official vendor distribution.

Use unmodified colored variants where available and monochrome variants on a white backing otherwise. Runtime assets are same-origin bundle URLs. DeepSeek retains its existing official SVG and MIT attribution. Asset integrity tests should check valid SVG roots, no external references/scripts, manifest/file parity and SHA-256.
