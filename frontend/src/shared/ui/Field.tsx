import type { ReactNode } from "react";
import { Label } from "./label";

type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  required?: boolean;
};

// The render callback adds associations without cloning or replacing events.
export function Field({ id, label, description, error, required, children }: {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const describedBy = [description ? `${id}-help` : undefined, error ? `${id}-error` : undefined].filter(Boolean).join(" ") || undefined;
  return <div className="grid min-w-0 gap-2">
    <Label htmlFor={id}>{label}</Label>
    {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required })}
    {description && <p id={`${id}-help`} className="m-0 text-xs text-muted-foreground">{description}</p>}
    {error && <p id={`${id}-error`} className="m-0 text-xs text-destructive">{error}</p>}
  </div>;
}
