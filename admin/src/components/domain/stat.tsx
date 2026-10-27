import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SkeletonText } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Headline numbers in one strip with hairline dividers (not a row of boxed cards).
 * Keep to 2–5 stats; the first is usually the one that matters.
 */
export function StatGroup({ className, children }: { className?: string; children: ReactNode }) {
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
  className?: string;
}) {
  const up = delta !== undefined && delta >= 0;
  if (pending) {
    return (
      <div
        data-slot="stat"
        aria-busy
        className={cn("grid content-start gap-1 px-4 py-3", className)}
      >
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="num text-xl font-semibold tracking-tight">
          <SkeletonText>{placeholder}</SkeletonText>
        </span>
        <span className="text-xs">
          <SkeletonText>00 agreements</SkeletonText>
        </span>
      </div>
    );
  }
  return (
    <div data-slot="stat" className={cn("grid content-start gap-1 px-4 py-3", className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="num text-xl font-semibold tracking-tight">{value}</span>
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
          {deltaLabel}
          {hint}
        </span>
      )}
    </div>
  );
}
