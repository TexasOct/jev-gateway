# Foundation design

Consume the parent design and audit. Own `frontend/components.json`, CLI development dependency/lock delta, semantic theme mapping and shared UI workflow documentation. Preserve the current accepted dependency baseline, Vite alias/base/output and `cn` utility. No feature state is moved here.

Use Radix base and official neutral styling compatible with the pinned CLI. Preview initialization in a disposable copy and review its CSS, utility, alias and dependency effects. Generate registry primitives under `@/shared/ui/primitives`; public project wrappers stay one directory above. This avoids case-only Dialog filename collisions on macOS.

Keep `applyPalette`/`data-scheme` as the color authority. Fill missing shadcn roles from existing palette values; primary/focus follow the seed and surfaces remain neutral. Keep Preflight disabled and the existing single CSS entry/owned files. Current theme APIs, native color commit semantics and stale-operation guards remain unchanged.

Pin the tested CLI version and document local npm exec view/add/dry-run/diff/update flows. Verify upstream command/schema support before writing config. Component updates are reviewed local source changes with MIT attribution. Do not introduce a second utility/theme provider or blanket CLI overwrite.

Rollback uses the captured foundation diff only, including the foundation's dependency delta. It must preserve another session's Radix addition and any later accepted lockfile changes.
