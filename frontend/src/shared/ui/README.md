# Shared dashboard controls

Button, Card and Separator are adapted from shadcn/ui's `new-york-v4`
registry source, retrieved on 2026-09-27:

- https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx
- https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/card.tsx
- https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/separator.tsx

The registry is MIT licensed: https://github.com/shadcn-ui/ui/blob/main/LICENSE.md.
The copyright notice and license are retained in `LICENSE.shadcn.md`.
We hand-added this small set because CLI initialization rewrites the CSS entry
and adds aliases. This app already has Tailwind v4, a dynamic palette, and a
single TypeScript config. No CLI, `components.json`, shadcn runtime,
icon package, animation package, or remote resource is required. Dialog uses
Radix's browser portal as described below.

## Adoption

Use `@/shared/ui/button`, `@/shared/ui/card`, and `@/shared/ui/separator` across modules; relative imports are fine inside `shared/ui`.
Variant classes are exported separately from `src/shared/ui/button-variants`
to keep React Refresh component modules clean. `cn` in `src/shared/ui/utils`
merges conditional Tailwind classes.
Feature owners adopt these controls through their existing props and handlers;
the base controls do not load data or own editor, auth, locale, or theme state.
Dialog's workspace and return-focus adapter is described below.

```tsx
import { Button } from "@/shared/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card";
import { Separator } from "@/shared/ui/separator";

<Card>
  <CardHeader><CardTitle><h2>{title}</h2></CardTitle></CardHeader>
  <CardContent>{children}</CardContent>
</Card>
<Button variant="outline" disabled={busy} onClick={onRefresh}>{refreshLabel}</Button>
<Separator />
```

Button has `default`, `outline`, `secondary`, `ghost`, `link`, and `destructive`
variants, and `default`, `sm`, `lg`, `icon`, `icon-sm`, and `icon-lg` sizes.
Normal/small controls are at least 36px high; `lg`/`icon` are 40px for canvas
actions. Supply localized children and an `aria-label` for icon-only actions.
Native Button defaults to `type="button"`; opt into `submit` explicitly.
React 19 refs, disabled state, ARIA attributes, and event handlers pass through.
`asChild` uses Radix Slot and requires one element child. It preserves child
semantics: an anchor does not acquire native button disabled behavior. Keep
disabled actions as native buttons. Slot does not synthesize anchor keyboard
activation, form behavior, or a missing accessible name.

Card exports Header, Title, Description, Action, Content, and Footer slots.
It supplies no landmark or heading role; callers choose the heading level.
Separator defaults to decorative/horizontal. Set `decorative={false}` for a
semantic separator; use `orientation="vertical"` with a bounded parent height.
Button, Card and Separator do not change focus trapping, Escape handling,
scrolling, canvas coordinates, or disclosure state. Keep native details/summary where used.
State-specific presentation classes may identify an element for tests or behavior;
provide its visual difference with Tailwind variants or data attributes rather than
relying on a class with no matching CSS rule.

## Dialog

`@/shared/ui/Dialog` adapts the [new-york-v4 Dialog composition](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/dialog.tsx)
with the focused `@radix-ui/react-dialog` package at version `1.2.0`. Its
public props remain `title`, `children`, `footer`, `onClose`, and optional
`fallbackFocusRef`. Radix Root, Portal, Overlay, Content and Title provide a
browser DOM modal, focus containment, Escape and outside dismissal. There is
no extra close button; every dismissal request reaches the caller's `onClose`.
The caller retains the draft and decides when to unmount the editor, so a
pending write or dirty-discard choice keeps the modal open.

`onOpenAutoFocus` starts focus on Content. After reconnect, an incoming catalog
can disable a retained editor's fields; starting on Content keeps focus in the
modal during that transition. Radix still owns Tab/Shift+Tab containment.

ModelDialog also moves focus to Content when its pending/read-only transition
disables the currently focused control. This runs with the business lock's
layout update, so Radix's next keyboard traversal starts from an enabled modal
target. It adds no keyboard listener or separate focus trap.

The portal mounts under `document.body` only while `useWorkspaceActive()` is
true. Authentication suspension removes it while the feature owner retains
its draft. Existing Edit buttons are outside the Radix Trigger composition;
the adapter captures the initiating button before autofocus and uses
`onCloseAutoFocus` to restore it after an accepted close. Disconnected,
disabled, hidden or inert targets are excluded; the caller's visible fallback
receives focus when the initiating button is gone. Suspension and a resumed
portal suppress obsolete return-focus work.

Content uses the existing panel palette, an accessible title, no description
reference, `max-w-3xl`, a `90dvh` height bound, a scrolling body and a wrapping
footer. The overlay and content sit above the shared header. The [Radix Dialog
documentation](https://www.radix-ui.com/primitives/docs/components/dialog)
describes the controlled Root and autofocus callbacks used here.

## Styling boundary

`src/styles/index.css` imports Tailwind theme/utilities without Preflight.
`@theme inline` maps
shadcn roles to the existing JEV variables, and the dark variant reads
`data-scheme="dark"`. `applyPalette` remains the theme authority. shadcn's
subtle accent is represented with `panel-muted`; JEV's `--accent` stays the
action color. Destructive buttons use a semantic foreground/border on a surface
rather than assuming white text contrasts against every derived failure color.

Registry defaults are adjusted to 8px cards, 6px controls, 13px control text,
16px panel spacing, explicit solid borders, and no panel shadows. Button skin
utilities use Tailwind v4's trailing `!` modifier where the shared base control
rules would otherwise take precedence. This is limited to these owned controls;
there is no global important mode or reset. Override those properties with
matching important utilities, e.g. `className="bg-panel! text-ink! px-2!"`.
Ordinary layout/size overrides work normally. Component-specific canvas and
virtual-list geometry belongs in feature JSX utilities; their semantic hooks remain
available for measurement and testing.

Runtime dependencies are `class-variance-authority`, `clsx`, `tailwind-merge`,
`@radix-ui/react-slot`, `@radix-ui/react-separator`, and
`@radix-ui/react-dialog`. Targeted Radix packages
avoid installing the full primitive collection. No new browser storage is used.
The existing `/dashboard/` base, package output path and gateway CSP stay intact.
