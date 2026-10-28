import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircleIcon } from "lucide-react";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One button. Variant says how important the action is, not what colour it is:
 * - primary: the one main action in a view (at most one per header / dialog / form)
 * - secondary: other actions
 * - ghost: tertiary actions in toolbars, table rows and icon buttons
 * - danger: confirms something irreversible (only inside a confirmation)
 * - link: inline navigation in running text
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm font-semibold whitespace-nowrap",
    "transition-colors duration-(--duration-fast) select-none focus-ring",
    "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 data-[pending]:opacity-100",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary:
          "border border-border-strong bg-surface text-foreground shadow-[0_1px_0_var(--border)] hover:bg-hover active:bg-pressed",
        ghost: "text-foreground hover:bg-hover active:bg-pressed data-[state=open]:bg-pressed",
        danger: "bg-danger text-danger-foreground hover:bg-danger/90",
        link: "h-auto! px-0! text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent",
      },
      size: {
        sm: "h-7 px-2.5 text-sm max-sm:h-9",
        md: "h-control px-3 text-sm",
        lg: "h-10 px-4 text-base",
        icon: "size-control",
        "icon-sm": "size-7 max-sm:size-9 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner and blocks repeat clicks while an action runs. */
    pending?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  pending = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "secondary"}
      data-pending={pending || undefined}
      aria-busy={pending || undefined}
      disabled={asChild ? undefined : disabled || pending}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {pending && !asChild ? (
        <>
          <span className="inline-flex items-center gap-1.5 opacity-0">{children}</span>
          <LoaderCircleIcon className="absolute animate-spin" aria-hidden />
        </>
      ) : (
        children
      )}
    </Comp>
  );
}
