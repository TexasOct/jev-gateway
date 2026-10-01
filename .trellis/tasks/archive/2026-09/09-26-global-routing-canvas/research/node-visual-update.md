# Canvas node content

## Integration

`frontend/src/config/CanvasNodeContent.tsx` exports:

```tsx
import CanvasNodeContent, { getCanvasNodeKind } from "./CanvasNodeContent";

// Inside the existing routing-canvas-node button:
<CanvasNodeContent id={id} text={text} draft={draft} config={config} />

// Optional attribute on that same button:
data-node-kind={getCanvasNodeKind(id)}
```

The component takes `id: string`, `text: string`, `draft: RoutingDraft` and
`config: ConfigurationPayload`. It returns spans and a decorative inline SVG;
the existing button remains the sole interactive element. It requires the
existing `LocaleProvider`. It adds no state, event handlers or persistence calls.

`getCanvasNodeKind(id)` returns `questions`, `rule`, `fallback`, `label`, `model`
or `unknown`. Valid namespaces retain their kind when their entity is missing;
the summary then says details are unavailable. Malformed IDs use the neutral
kind. Unknown titles fall back to the localized type name only when `text` is
empty. The component also places its kind on the child wrapper and supplies
`.canvas-node-kind-*` classes. CSS supports both the optional outer attribute
and `:has()` on the wrapper, so no outer attribute is required for styling.

Replace only the old `{text}` button contents during integration. Preserve the
button's existing identity, position, event handlers and port relationships.
Pointer events bubble from the spans to the button; code examining a hit target
should use `closest("[data-canvas-node]")`. Child title and summary spans carry
full native `title` attributes.

## Content and styling

- Questions show the current draft's question count.
- Rules show current conditions and destination label. OR values remain grouped.
- Fallback shows its current draft label.
- Tag pools count draft members with the existing `labelMembers` helper; explicit
  pools count the configured model list.
- Models show their configured provider, with an unavailable message when absent.

All text is ordinary React text content. Missing entities do not produce made-up
counts or providers. The English and Simplified Chinese dictionaries have matching
new keys and singular/plural count messages.

Nodes keep a fixed 190 by 56 CSS-pixel border box with 6px padding. Type, title
and summary use 10px, 14px and 11px fonts within 12px, 16px and 12px line boxes.
Titles and summaries truncate on one line. Visible type names and distinct SVG
paths identify each role independently of color; border styles and corner
treatments provide additional distinction. Surface and border tints use theme
tokens and `color-mix`; all text uses `--text` or `--text-muted`.

Selection keeps a solid accent outline. Compatible targets use a dashed outline;
selected compatible targets use a double outline. Keyboard focus gets a separate
text-color outline. The existing `.dragging` class changes the cursor to grabbing
and lifts the shadow without transforms or geometry changes. An optional
`.read-only` class removes the elevation and grab cursor; the parent remains
responsible for disabling mutations and for any localized read-only explanation.

## Verification

- `npm --prefix frontend run test -- CanvasNodeContent.test.tsx`: passed, 1 file and 19 tests, covering all role labels and summaries in both locales, icons, no nested controls, current draft values, pool counts, escaping, long title attributes and missing entities.
- Integrated frontend suite: passed, 8 files and 92 tests.
- Lint: zero errors with the existing Fast Refresh warnings. TypeScript/Vite production build passed.
- Isolated native-pointer browser suite passed 8 cases: questions and rules at 1280×800 and 320×700, zoom 1 and 0.75. Each verified a hit-tested point, movement delta, unscaled node coordinates, layout-only writes, unchanged policy state and reload restoration. The nonzero canonical viewport reload and read-only no-write checks also passed. See `research/viewport-artifacts/node-drag-results.json` and the drag screenshots.

The integration now renders this component inside the existing canvas button. Screenshot review confirmed type labels, icons, summaries and role-accented borders are visible; the rule card remains 190×56 and its port remains reachable. A human review is still useful for visual preference. No automated pixel comparison is present.

Files added/changed by the style subtask: `CanvasNodeContent.tsx`, its test, node-specific CSS, paired translation messages and this report. `RoutingCanvas.tsx` integration, gesture logic and unit tests were updated separately.
