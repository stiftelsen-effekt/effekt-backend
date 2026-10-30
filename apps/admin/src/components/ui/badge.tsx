import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A small label for a category (payment method, agreement type, "Default"). For lifecycle
 * states use <Status>, which adds the dot and the shared status vocabulary.
 */
export const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center gap-1 rounded-xs px-1.5",
    "text-xs leading-5 font-semibold whitespace-nowrap",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ],
  {
    variants: {
      tone: {
        neutral: "bg-pressed text-foreground",
        outline: "text-muted-foreground shadow-[inset_0_0_0_1px_var(--border-strong)]",
        accent: "bg-accent-subtle text-accent",
        success: "bg-success-subtle text-success",
        warning: "bg-warning-subtle text-warning",
        danger: "bg-danger-subtle text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;
export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}
