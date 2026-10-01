import type { ComponentProps } from "react";
import type { VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";

import { buttonVariants } from "./button-variants";
import { cn } from "./utils";

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
  asChild?: boolean;
};

// Registry composition API with React 19 ref-as-prop support. Native controls
// default to type=button so adopting one inside an editor form cannot submit it.
function Button({ className, variant = "default", size = "default", asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp
    data-slot="button"
    data-variant={variant}
    data-size={size}
    type={type ?? (asChild ? undefined : "button")}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  />;
}

export { Button };
export type { ButtonProps };
