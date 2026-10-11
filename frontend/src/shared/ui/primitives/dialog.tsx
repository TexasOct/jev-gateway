import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { cn } from "../utils";

// CLI 4.21.4 registry composition, restricted to the business wrapper's slots.
// No generated close action or animation delays: callers own guarded dismissal.
function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn("fixed inset-0 z-50 bg-black/50", className)} {...props} />;
}

function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPortal><DialogOverlay /><DialogPrimitive.Content data-slot="dialog-content" className={cn(
    "fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%_-_2rem)] min-w-0 max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-solid border-border bg-card p-0 text-card-foreground shadow-xl outline-none",
    className,
  )} {...props}>{children}</DialogPrimitive.Content></DialogPortal>;
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("m-0 break-all text-lg font-semibold", className)} {...props} />;
}

export { Dialog, DialogContent, DialogTitle };
