import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { ComponentProps } from "react";
import { cn } from "./utils";

// Native compatibility adapter: existing consumers need ChangeEvent<HTMLInputElement>,
// native checked/name/value submission and fieldset disablement.
export const Checkbox = forwardRef<HTMLInputElement, Omit<ComponentProps<"input">, "type"> & { indeterminate?: boolean }>(function Checkbox({ className, indeterminate = false, ...props }, ref) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!, []);
  useLayoutEffect(() => { if (input.current) input.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input {...props} ref={input} type="checkbox" data-slot="checkbox" className={cn("size-4 shrink-0 cursor-pointer border-0 bg-transparent p-0 accent-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", className)} />;
});
