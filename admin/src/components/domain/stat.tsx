import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SkeletonText } from "@/components/ui/skeleton";
import { MoneyPrecisionProvider } from "./format";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Headline numbers in one strip with hairline dividers (not a row of boxed cards).
 * Keep to 2–5 stats; the first is usually the one that matters.
 *
 * `columns={4}` makes it a grid instead of one row: 2 columns on small screens, 4 from `md`,
 * and stats can span columns (`className="md:col-span-2"`). Plan the spans so each row is full.
 */
export function StatGroup({
  columns,
  className,
  children,
}: {
  columns?: 4;
  className?: string;
  children: ReactNode;
}) {
  if (columns) {
    // Each stat draws its right and bottom hairline; the grid pokes 1px past the clipped frame,
    // so the outer ones disappear under the frame's own border, whatever the spans.
    return (
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <div
          data-slot="stat-group"
          className={cn(
            "-mr-px -mb-px grid grid-cols-2 md:grid-cols-4 [&>*]:border-r [&>*]:border-b [&>*]:border-border",
            className,
          )}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div
      data-slot="stat-group"
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface md:auto-cols-fr md:grid-flow-col md:grid-cols-none",
        "[&>*]:border-border max-md:[&>*:nth-child(2n)]:border-l max-md:[&>*:nth-child(n+3)]:border-t md:[&>*+*]:border-l",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  pending = false,
  placeholder = "00 000 kr",
  delta,
  deltaLabel,
  hint,
  chart,
  className,
}: {
  label: ReactNode;
  value?: ReactNode;
  /**
   * First load: the label stays, the value and hint line are text-sized placeholders, so the
   * strip has its final size before the numbers arrive.
   */
  pending?: boolean;
  /** Sample text the size of the value, for the placeholder ("00 000 kr", "12"). */
  placeholder?: string;
  /** Relative change as a fraction (0.18 = +18 %). Up is not assumed to be good. */
  delta?: number;
  deltaLabel?: ReactNode;
  hint?: ReactNode;
  /**
   * A small trend to the right of the number (`Sparkline`). It shows only where the stat is
   * wide enough for it (a container query), so the numbers never wrap to make room. Pass it
   * while `pending` too, with no data, so its space is reserved.
   */
  chart?: ReactNode;
  className?: string;
}) {
  const up = delta !== undefined && delta >= 0;
  if (pending) {
    return (
      <StatFrame aria-busy className={className} chart={chart}>
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="num text-xl font-semibold tracking-tight">
          <SkeletonText>{placeholder}</SkeletonText>
        </span>
        <span className="text-xs">
          <SkeletonText>00 agreements</SkeletonText>
        </span>
      </StatFrame>
    );
  }
  return (
    <StatFrame className={className} chart={chart}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="num text-xl font-semibold tracking-tight">
        <MoneyPrecisionProvider precision="whole">{value}</MoneyPrecisionProvider>
      </span>
      {(delta !== undefined || hint) && (
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {delta !== undefined && (
            <span className="num inline-flex items-center gap-0.5 font-semibold text-foreground">
              {up ? (
                <ArrowUpRightIcon className="size-3.5" aria-label="Up" />
              ) : (
                <ArrowDownRightIcon className="size-3.5" aria-label="Down" />
              )}
              {formatPercent(Math.abs(delta), { decimals: 0 })}
            </span>
          )}
          {/* One box each, so a hint like "<Num/> agreements" reads as one phrase and wraps as
              text rather than as separate flex items. */}
          <MoneyPrecisionProvider precision="whole">
            {deltaLabel && <span>{deltaLabel}</span>}
            {hint && <span className="min-w-0">{hint}</span>}
          </MoneyPrecisionProvider>
        </span>
      )}
    </StatFrame>
  );
}

function StatFrame({
  className,
  chart,
  children,
  ...props
}: {
  className?: string;
  chart?: ReactNode;
  children: ReactNode;
  "aria-busy"?: boolean;
}) {
  if (!chart) {
    return (
      <div
        data-slot="stat"
        className={cn("grid content-start gap-1 px-4 py-3", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
  return (
    <div data-slot="stat" className={cn("@container px-4 py-3", className)} {...props}>
      <div className="flex items-center justify-between gap-3">
        <div className="grid min-w-0 content-start gap-1">{children}</div>
        <div data-slot="stat-chart" className="hidden shrink-0 @min-[15rem]:block">
          {chart}
        </div>
      </div>
    </div>
  );
}
