import type { ComponentProps } from "react";
import { Root as SeparatorPrimitive } from "@radix-ui/react-separator";

import { cn } from "./utils";

function Separator({ className, orientation = "horizontal", decorative = true, ...props }: ComponentProps<typeof SeparatorPrimitive>) {
  return <SeparatorPrimitive
    data-slot="separator"
    decorative={decorative}
    orientation={orientation}
    className={cn("shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px", className)}
    {...props}
  />;
}

export { Separator };
