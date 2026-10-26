import { ArrowDownRightIcon, ArrowUpRightIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
  footer,
  icon: Icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: number;
  deltaLabel?: ReactNode;
  footer?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const up = delta !== undefined && delta >= 0;
  return (
    <div
      data-slot="stat-card"
      className={cn("flex flex-col gap-2 border border-border bg-card p-4", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="label-caps text-muted-foreground">{label}</span>
        {Icon && <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />}
      </div>
      <div className="num text-2xl leading-none font-semibold tracking-tight">{value}</div>
      {(delta !== undefined || footer) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {delta !== undefined && (
            <span
              className={cn(
                "num inline-flex items-center gap-0.5 font-semibold",
                up ? "text-success" : "text-destructive",
              )}
            >
              {up ? (
                <ArrowUpRightIcon className="size-3.5" />
              ) : (
                <ArrowDownRightIcon className="size-3.5" />
              )}
              {formatPercent(Math.abs(delta))}
            </span>
          )}
          {deltaLabel && <span>{deltaLabel}</span>}
          {footer && <span className="ml-auto">{footer}</span>}
        </div>
      )}
    </div>
  );
}
