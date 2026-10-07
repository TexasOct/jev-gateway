import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useLayoutEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { useWorkspaceActive } from "@/shared/navigation/workspace-activity";

function usableFocusTarget(element: HTMLElement | null | undefined): element is HTMLElement {
  return !!element?.isConnected
    && !element.matches(":disabled")
    && !element.closest("[inert], [hidden], [aria-hidden='true']")
    && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== "hidden";
}

// Adapted from shadcn/ui's new-york-v4 Dialog composition. The caller owns
// dismissal decisions; Radix owns modal focus, Escape and outside interaction.
export function Dialog({ title, children, footer, onClose, fallbackFocusRef }: { title: string; children: ReactNode; footer: ReactNode; onClose: () => void; fallbackFocusRef?: RefObject<HTMLElement | null> }) {
  const active = useWorkspaceActive();
  const workspaceActive = useRef(active);
  const trigger = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    workspaceActive.current = active;
    // Capture before Radix autofocus and aria-hidden effects reach the page.
    if (active && !trigger.current && document.activeElement instanceof HTMLElement && document.activeElement !== document.body && !content.current?.contains(document.activeElement) && usableFocusTarget(document.activeElement)) trigger.current = document.activeElement;
  }, [active]);

  return <DialogPrimitive.Root open={active} onOpenChange={(open) => { if (!open && active) onClose(); }}>
    {active && <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        ref={content}
        data-slot="dialog-content"
        aria-modal="true"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          // Reconnection can make the retained editor read-only after opening.
          // Start on the modal so disabling its fields cannot drop focus to body.
          content.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // Radix runs close autofocus after unmount. A resumed portal or the
          // login page must keep its focus when an old portal finishes cleanup.
          if (!workspaceActive.current || content.current) return;
          const target = usableFocusTarget(trigger.current) ? trigger.current : fallbackFocusRef?.current;
          if (usableFocusTarget(target)) target.focus();
        }}
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%_-_2rem)] min-w-0 max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-outline bg-panel p-0 text-ink shadow-xl outline-none"
      >
        <header className="border-b border-outline px-4 py-3"><DialogPrimitive.Title asChild><h2 className="m-0 break-all text-lg font-semibold">{title}</h2></DialogPrimitive.Title></header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4">{children}</div>
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-outline bg-panel p-4">{footer}</footer>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>}
  </DialogPrimitive.Root>;
}
