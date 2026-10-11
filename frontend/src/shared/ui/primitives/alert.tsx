import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

const variants = cva("relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-lg border border-solid border-border px-4 py-3 text-sm has-[>svg]:grid-cols-[1rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current", {
  variants: { variant: { default: "bg-card text-card-foreground", destructive: "bg-card text-destructive *:data-[slot=alert-description]:text-destructive" } }, defaultVariants: { variant: "default" },
});

function Alert({ className, variant, ...props }: ComponentProps<"div"> & VariantProps<typeof variants>) {
  return <div data-slot="alert" className={cn(variants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("col-start-2 min-h-4 font-medium [overflow-wrap:anywhere]", className)} {...props} />;
}

function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [overflow-wrap:anywhere] [&_p]:leading-relaxed", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
