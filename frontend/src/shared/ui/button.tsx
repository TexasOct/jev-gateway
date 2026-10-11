import { Button as PrimitiveButton } from "./primitives/button";
import type { ButtonProps } from "./primitives/button";

function Button({ type, asChild = false, ...props }: ButtonProps) {
  return <PrimitiveButton {...props} asChild={asChild} type={type ?? (asChild ? undefined : "button")} />;
}

export { Button };
export type { ButtonProps };
