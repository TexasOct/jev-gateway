# Registry maintenance

Run commands from `frontend/` with npm 11.16.0 and Node >=20.18.1. Install with
`npm install`; the exact development CLI version is `shadcn@4.21.4`.
`npm exec -- shadcn --version` must report that version. Do not use an unpinned
`npx shadcn@latest` during maintenance.

`components.json` selects the documented `new-york` registry style, neutral base,
Radix components, TypeScript client components and Tailwind v4. The generated
destination is `@/shared/ui/primitives`; public adapters remain in `@/shared/ui`.
This separates registry `dialog.tsx` from the business `Dialog.tsx` on macOS.
Imports use the existing `@/*` TypeScript/Vite alias and `@/shared/ui/utils` `cn`.
The hooks destination is `@/shared/hooks`; it is created only when needed.
The current registry Input source imports `cn` from the external `cn` package
even with the utils alias configured. Rewrite that import to
`@/shared/ui/utils` in the reviewed source and omit the proposed runtime `cn`
dependency. The foundation smoke builds this adaptation through the real alias.

Inspect before adding, using the pinned local executable:

```sh
npm exec -- shadcn view input
npm exec -- shadcn add input --dry-run
npm exec -- shadcn add input --view
npm exec -- shadcn add input --diff
```

First copy the frontend into a disposable directory, including its manifest,
lockfile and source, then run `npm install` there. Use `--cwd <copy>` for the CLI:

```sh
npm exec -- shadcn add input --cwd <copy> --yes
npm --prefix <copy> run build
```

Review generated paths, imports, CSS changes and the manifest/lock delta. Add only
components consumed by the owning migration stage. Preserve the existing focused
Radix dependencies and review any proposed aggregate `radix-ui` dependency.
Keep refs, native events, disabled state and business draft/auth ownership in the
public adapters. Registry code may need local React Refresh export adjustments.

For updates, inspect `add <component> --diff` and `--view` against a disposable
copy of the current source. `add <component> --overwrite` is permitted only in
that copy after reviewing its diff. Apply the reviewed source changes to the
project and run the affected lint, unit, build and browser checks. Retain local
compatibility changes in each update; the CLI does not merge business adapters.

Do not initialize the live frontend again. CLI 4.21.4 does not recognize our split
Tailwind theme/utilities imports during init. Its Vite/Radix `--preset nova`
initialization emits style `radix-nova`, fonts, animation dependencies, a utility
copy and static theme CSS. That preview is retained in the foundation research.
The reviewed `new-york` config supports add directly with the existing CSS entry.

`src/styles/index.css` remains the only stylesheet entry and imports no Preflight.
`applyPalette` and `data-scheme` own colors. Popover/sidebar surfaces map to the
neutral palette; primary and ring map to the saved seed. Chart roles reuse the
existing accent/status/muted families and do not imply new chart behavior.
JEV's `--accent` is its action color; shadcn's subtle accent utility maps to
`--surface-alt`. Never paste registry `:root`/`.dark` color blocks into this app.
Destructive foreground uses the surface color, which contrasts with the existing
failure palette; it is independent of the primary action label color.
Keep the destructive hover background opaque. At 90% opacity over the dark
panel, its label contrast falls below 4.5:1.
Keep system fonts, existing keyframes, CSP, locale-only storage and native color
preview/commit semantics.

The source is project-owned after addition. Retain `LICENSE.shadcn.md` with all
copied/adapted shadcn sources and record the registry URL, CLI version and local
changes in the owning stage's receipt. The retained MIT notice applies to the
new registry directory as well as the existing wrappers. Dependency licenses
remain with their packages. Official references:

- https://ui.shadcn.com/docs/cli
- https://ui.shadcn.com/docs/components-json
- https://ui.shadcn.com/docs/installation/vite
- https://ui.shadcn.com/docs/theming

Rollback the owning stage's reviewed diff, including only its dependency delta.
Preserve predecessor and later accepted source/lock changes. No blanket reset or
lockfile replacement is part of this workflow.
