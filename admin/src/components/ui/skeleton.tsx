import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Placeholder for content on its first load. Only inside the real structure: a component's
 * own loading state (DataTable rows, `Stat pending`, `Property pending`, `ChartFrame pending`)
 * or a box that reserves the exact final size. Never a hand-drawn page layout, and never on a
 * parameter change (keep the previous data, see `usePageQuery`).
 *
 * Invisible for the first 300 ms (`--delay-pending`), so fast loads show nothing; then fades
 * in. `data-static` shows it at once (design demos).
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-skeleton rounded-xs bg-border data-[static]:animate-none", className)}
      {...props}
    />
  );
}

/**
 * A text-sized placeholder: renders `children` as transparent text on a skeleton background,
 * so it has exactly the line height and roughly the width of the value it stands in for.
 * Put it where the value goes, inside the real label/heading/cell.
 *
 *   <Stat label="Expected" value={<SkeletonText>00 000 kr</SkeletonText>} />
 */
export function SkeletonText({
  children = "0 000",
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "animate-skeleton rounded-xs bg-border whitespace-nowrap text-transparent select-none data-[static]:animate-none",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
