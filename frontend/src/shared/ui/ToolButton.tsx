import type { ButtonProps } from "./button";
import { Button } from "./button";

interface ToolButtonProps extends Omit<ButtonProps, "variant"> {
  tone?: "neutral" | "primary";
}

export function ToolButton({ tone = "neutral", size = "sm", ...props }: ToolButtonProps) {
  return <Button {...props} size={size} variant={tone === "primary" ? "default" : "outline"} />;
}
