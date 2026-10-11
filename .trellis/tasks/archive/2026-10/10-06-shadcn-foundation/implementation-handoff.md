# Foundation handoff

The owned foundation slice is implemented and its F1-F3 developer checks pass.
Independent Trellis acceptance remains pending. The active task is foundation;
no downstream task has been started.

Changed product files:

- `frontend/components.json`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/styles/index.css`
- `frontend/src/styles/tokens.css`
- `frontend/src/shared/ui/README.md`
- `frontend/src/shared/ui/WORKFLOW.md`

The CLI is pinned to `4.21.4`. Installed schema validation and disposable add
confirm `new-york`, neutral, Tailwind v4 and the generated destination
`@/shared/ui/primitives`. Public wrappers remain one directory above. Existing
`cn`, aliases, focused Radix dependency, disabled Preflight, palette authority,
default/custom seed and theme APIs are preserved. Semantic popover, sidebar and
chart roles are complete; destructive foreground now contrasts independently of
the primary label color. No page or production primitive was migrated.

The lock adds 250 entries, removes none and changes no existing package versions.
`research/lock-delta.json` records the comparison; apparent text churn comes from
npm ordering. CLI init output was reviewed only in a disposable copy because it
adds competing theme CSS, fonts and a utility. The accepted add workflow works
with the original CSS entry. Current registry Input imports external `cn`; the
reviewed smoke adapts it to the existing helper, and `WORKFLOW.md` documents
preserving that import during updates.

Validation: lint passes with four existing i18n warnings, 406 unit tests pass,
TypeScript/Vite build and browser typecheck pass, and all 37 affected browser tests
pass with zero retries and unchanged deadlines. The mounted disposable Input/theme
smoke also passes custom/system schemes, semantic contrast and pending/reset
failure/DELETE-only retry. `acceptance.md` records commands, exits and all failed
setup attempts. Source SHA-256 values, initial/final boundaries and 44 screenshot
paths are under `research/`; no files are staged.

Residual review work: primitives must review generated control text/sizing and
preserve the local `cn` import before adopting controls. Independent foundation
review and parent stable-source integration are still required. Concurrent edits
appeared in unrelated model/backend/localization/docs files after the initial
capture; they were preserved and reported to the supervisor. This handoff certifies
the foundation developer slice only and preserves archived admin exceptions.
