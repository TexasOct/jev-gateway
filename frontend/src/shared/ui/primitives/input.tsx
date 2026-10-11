import type { ComponentProps } from "react";
import { cn } from "../utils";

// CLI 4.21.4 new-york Input; local palette, 44px sizing and explicit borders.
function Input({ className, type, ...props }: ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(
    "h-11 w-full min-w-0 max-w-full rounded-md border border-solid border-input bg-card px-3 py-2 text-sm text-foreground selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive",
    className,
  )} {...props} />;
}

export { Input };
