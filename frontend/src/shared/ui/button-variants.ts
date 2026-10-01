import { cva } from "class-variance-authority";

// Adapted from shadcn's new-york-v4 registry. The app reset lives in Tailwind's
// base layer, so component utilities do not need important overrides.
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-solid! text-sm font-medium whitespace-nowrap cursor-pointer transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring! disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-pressed:border-primary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:bg-primary-hover hover:border-primary-hover active:bg-primary-active active:border-primary-active aria-pressed:bg-primary-hover aria-pressed:text-primary-foreground",
        destructive: "border-destructive! bg-destructive! text-destructive-foreground! hover:bg-destructive/90!",
        outline: "border-border bg-card text-foreground shadow-xs hover:border-primary hover:bg-panel-muted aria-pressed:bg-panel-muted aria-pressed:text-foreground",
        secondary: "border-border bg-secondary text-secondary-foreground shadow-xs hover:border-primary",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-panel-muted aria-pressed:bg-panel-muted",
        link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-9 h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "min-h-9 h-9 gap-1.5 px-3 py-1.5 has-[>svg]:px-2.5",
        lg: "min-h-10 h-10 px-6 py-2 has-[>svg]:px-4",
        icon: "min-h-10 size-10 p-0",
        "icon-sm": "min-h-9 size-9 p-0",
        "icon-lg": "min-h-11 size-11 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
