import { swatchClasses } from "@/components/charts/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { groupOther, type OrgSlice } from "@/features/distribution/orgs";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Money } from "./format";

export const formatShare = (value: number) =>
  `${formatNumber(value, { decimals: Math.round(value * 10) % 10 ? 1 : 0 })} %`;

const describe = (slices: OrgSlice[]) =>
  slices.map((slice) => `${slice.name}: ${formatShare(slice.share)}`).join(", ");

/**
 * One segmented bar of organizations, in their colours. In the editor, `unplaced` shows as a
 * hatched gap and `overflow` (over 100 %) in red.
 */
export function OrgSplitBar({
  slices,
  unplaced = 0,
  overflow = 0,
  size = "md",
  className,
}: {
  slices: OrgSlice[];
  /** Percent not yet placed (editor). */
  unplaced?: number;
  /** Percent over 100 (editor). */
  overflow?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const scale = Math.max(100, 100 + overflow);
  return (
    <div
      role="img"
      aria-label={describe(slices) || "Nothing placed yet"}
      data-slot="org-split-bar"
      className={cn(
        "flex w-full gap-px overflow-hidden rounded-full bg-border",
        size === "md" ? "h-2.5" : "h-1.5",
        className,
      )}
    >
      {slices.map((slice) => (
        <div
          key={slice.id ?? "other"}
          className={cn(
            "h-full transition-[width] duration-(--duration-base)",
            swatchClasses[slice.color],
          )}
          style={{ width: `${(slice.share / scale) * 100}%` }}
        />
      ))}
      {unplaced > 0 && (
        <div
          className="h-full flex-1 bg-[repeating-linear-gradient(135deg,var(--border-strong)_0_3px,transparent_3px_6px)]"
          aria-hidden
        />
      )}
      {overflow > 0 && (
        <div className="h-full bg-danger" style={{ width: `${(overflow / scale) * 100}%` }} />
      )}
    </div>
  );
}

export function OrgSwatch({
  slice,
  className,
}: {
  slice: Pick<OrgSlice, "color">;
  className?: string;
}) {
  return (
    <span
      className={cn("size-2.5 shrink-0 rounded-xs", swatchClasses[slice.color], className)}
      aria-hidden
    />
  );
}

/** Name, share and (when there is one) amount per organization, aligned in columns. */
export function OrgSplitLegend({ slices, className }: { slices: OrgSlice[]; className?: string }) {
  const amounts = slices.some((slice) => slice.amount != null);
  return (
    <ul className={cn("grid grid-cols-1 gap-1.5 text-sm", className)}>
      {slices.map((slice) => (
        <li key={slice.id ?? "other"} className="flex items-center gap-2">
          <OrgSwatch slice={slice} />
          <span className="min-w-0 flex-1 truncate">{slice.name}</span>
          <span className="num w-14 text-right font-semibold">{formatShare(slice.share)}</span>
          {amounts && (
            <Money value={slice.amount} className="w-28 text-right text-muted-foreground" />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * A distribution in a compact list cell: a small org bar and the largest organization, with
 * every organization and share in the tooltip.
 */
export function OrgSparkline({ slices, className }: { slices: OrgSlice[]; className?: string }) {
  if (slices.length === 0) return <span className="text-faint-foreground">–</span>;
  const shown = groupOther(slices, 5);
  const top = slices[0]!;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-slot="org-sparkline"
          tabIndex={0}
          className={cn("inline-flex max-w-full min-w-0 items-center gap-2", className)}
        >
          <OrgSplitBar slices={shown} size="sm" className="w-16 shrink-0" />
          <span className="min-w-0 truncate text-sm">
            {top.name}
            {slices.length > 1 && (
              <span className="text-muted-foreground"> +{slices.length - 1}</span>
            )}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="grid gap-1">
        {slices.map((slice) => (
          <span key={slice.id ?? "other"} className="flex items-center gap-2">
            <OrgSwatch slice={slice} className="size-2" />
            <span className="flex-1">{slice.name}</span>
            <span className="num font-semibold">{formatShare(slice.share)}</span>
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
