import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center gap-1 rounded-sm border px-1.5 py-px",
    "text-xs leading-4 font-semibold whitespace-nowrap",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ],
  {
    variants: {
      variant: {
        neutral: "border-transparent bg-subtle text-foreground",
        solid: "border-transparent bg-primary text-primary-foreground",
        outline: "border-border-strong text-foreground",
        success: "border-transparent bg-success-subtle text-success",
        warning: "border-transparent bg-warning-subtle text-warning",
        destructive: "border-transparent bg-destructive-subtle text-destructive",
        info: "border-transparent bg-info-subtle text-info",
        accent: "border-transparent bg-accent-subtle text-accent",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
      dot: { true: "before:size-1.5 before:rounded-full before:bg-current" },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean };

export function Badge({ className, variant, dot, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant, dot }), className)} {...props} />
  );
}
