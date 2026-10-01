# Icon library decision

## Local evidence

`frontend/package.json` uses React `^19.3.0`, React DOM `^19.3.0`, Vite `^8.3.0`, TypeScript `^6.0.3`, and npm. No icon library is currently declared or locked. The lockfile format is version 3.

`frontend/src/shared/ui/button-variants.ts` already sizes SVG children and prevents them from taking pointer events. `frontend/src/features/routing/components/CanvasNodeContent.tsx` contains semantic category icons with `currentColor` and a 1.8 stroke. Canvas geometry and branded graphics remain custom.

## Selected package

Use `lucide-react` with static named imports. Official documentation describes React components, ES module tree shaking, TypeScript support, and size/color/stroke customization. This fits the existing outline SVG styling without a runtime icon registry or font asset.

Planning-time npm metadata reported version `1.48.0`, ISC license, `sideEffects: false`, and React peer range `^16.5.1 || ^17.0.0 || ^18.0.0 || ^19.0.0`, which includes the project's React `^19.3.0`. Implementation installed exactly `1.48.0`; `implementation-evidence.md` records type/export confirmation and successful project build.

Lucide defaults to `aria-hidden="true"`. Keep that attribute explicit on decorative uses and keep accessible names on the enclosing button. Do not give a decorative child SVG a separate title or accessible label.

Sources:
- https://lucide.dev/guide/react/getting-started
- https://lucide.dev/guide/react/advanced/accessibility
- https://registry.npmjs.org/lucide-react/latest

## Alternative considered

Heroicons provides static React imports from `@heroicons/react/24/outline`, with other size/style entry points, under MIT. It could serve this task. There is no existing Heroicons dependency or project requirement that makes it a better fit than the PRD's Lucide candidate. Choose one library, not both.

Source: https://github.com/tailwindlabs/heroicons

## Scope clarification

`research/icon-inventory.md` records the audit and scope decision. `CanvasNodeContent.tsx` uses an enum-to-semantic-icon mapping separate from canvas connector geometry. Its six category icons are in scope; implementation preserves their category mapping, dimensions, labels, and decorative accessibility behavior.

Keep route connectors, animated diagram elements, branding, unavailable-value placeholders, and arrows embedded in data descriptions unchanged. The monitoring trace's visited-step check mark remains status content; this task does not redesign the trace.

## Verification

Implementation and independent review evidence are recorded in `implementation-evidence.md` and `check-evidence.md`. The frontend checks passed except for one reproduced pre-existing browser-suite failure. No backend checks were needed for this frontend-only change.
