import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

const variants = cva("inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border border-solid px-2 py-0.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&>svg]:pointer-events-none [&>svg]:size-3", {
  variants: { variant: {
    default: "border-transparent bg-primary text-primary-foreground",
    secondary: "border-transparent bg-secondary text-secondary-foreground",
    destructive: "border-transparent bg-destructive text-destructive-foreground",
    outline: "border-border text-foreground",
  } }, defaultVariants: { variant: "default" },
});

function Badge({ className, variant = "default", asChild = false, ...props }: ComponentProps<"span"> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return <Comp data-slot="badge" data-variant={variant} className={cn(variants({ variant }), className)} {...props} />;
}

export { Badge };
