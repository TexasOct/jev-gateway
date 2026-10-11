import type { ComponentProps } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "../utils";

// Preserve the native numeric size/multiple API. Single selects use one SVG
// chevron; listboxes keep their native appearance and have no decorative arrow.
function NativeSelect({ className, size, multiple, ...props }: ComponentProps<"select">) {
  const listbox = multiple || (size !== undefined && size > 1);
  return <div className="group/native-select relative w-full min-w-0" data-slot="native-select-wrapper">
    <select data-slot="native-select" size={size} multiple={multiple} className={cn(
      "min-h-11 w-full min-w-0 max-w-full rounded-md border border-solid border-input bg-card px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive",
      !listbox && "h-11 appearance-none pr-9",
      className,
    )} {...props} />
    {!listbox && <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-foreground select-none" aria-hidden="true" data-slot="native-select-icon" />}
  </div>;
}

function NativeSelectOption({ className, ...props }: ComponentProps<"option">) {
  return <option data-slot="native-select-option" className={cn("bg-[Canvas] text-[CanvasText]", className)} {...props} />;
}

function NativeSelectOptGroup({ className, ...props }: ComponentProps<"optgroup">) {
  return <optgroup data-slot="native-select-optgroup" className={cn("bg-[Canvas] text-[CanvasText]", className)} {...props} />;
}

export { NativeSelect, NativeSelectOption, NativeSelectOptGroup };
