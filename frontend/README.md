# Dashboard frontend

Run frontend checks from the repository root:

```sh
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
npm --prefix frontend run test:browser
```

The browser suite serves a local build with synthetic API fixtures. It does not
connect to a running gateway.

## Icons

Use static named imports from `lucide-react` so the build includes only the icons
used by the dashboard. Keep names and tooltips on the enclosing control, using
the existing locale catalog:

```tsx
import { RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";

<Button size="icon" aria-label={t("refresh")} title={t("refresh")} onClick={onRefresh}>
  <RefreshCw aria-hidden="true" focusable="false" />
</Button>
```

`Button` and `ToolButton` size SVG children to 16px and disable their pointer
events. For native buttons, set `size-4 pointer-events-none` on the icon. Preserve
existing control sizes, text labels, disabled/pressed state and handlers when
changing an icon. Icons inherit `currentColor` from the control's theme styles.
Compact text-sized controls keep a narrow inline icon slot so the 16px SVG does
not enlarge the existing button or introduce a new flex gap before its label.

Node-category icons use the typed static map in `CanvasNodeContent.tsx`, with
`size={14}` and `strokeWidth={1.8}`. Decorative SVGs use `aria-hidden="true"` and
`focusable="false"`; do not add an SVG title or a second accessible name.

Keep routing connector geometry, animated diagrams, the `J` brand mark and data
content such as route arrows and trace check marks in their owning components.
They are outside the semantic icon set. Test emitted SVG attributes and control
names/state; avoid path-data snapshots.
