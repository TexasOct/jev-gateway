import type { ComponentProps } from "react";
import { cn } from "../utils";

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(
    "flex min-h-28 w-full min-w-0 max-w-full resize-y rounded-md border border-solid border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive",
    className,
  )} {...props} />;
}

export { Textarea };
