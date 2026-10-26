import type { ReactNode } from "react";
import type { TooltipContentProps } from "recharts";
import { formatCompact, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ChartColor = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";
export type ValueFormat = "money" | "number";

export type ChartSeries = { key: string; label: string; color?: ChartColor };

export const chartColors: ChartColor[] = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

export const swatchClasses: Record<ChartColor, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
};

export const colorVar = (color: ChartColor) => `var(--${color})`;

export function seriesColor(series: ChartSeries, index: number): ChartColor {
  return series.color ?? chartColors[index % chartColors.length]!;
}

export function formatValue(value: number, format: ValueFormat) {
  return format === "money" ? formatMoney(value) : formatNumber(value);
}

export function formatAxis(value: number) {
  return Math.abs(value) >= 10_000 ? formatCompact(value) : formatNumber(value);
}

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  tickMargin: 8,
} as const;

export const gridProps = {
  vertical: false,
  stroke: "var(--border)",
} as const;

export function ChartFrame({
  className,
  children,
  legend,
}: {
  className?: string;
  children: ReactNode;
  legend?: ReactNode;
}) {
  return (
    <figure data-slot="chart" className="grid gap-3">
      <div className={cn("h-64 w-full text-xs [&_.recharts-surface]:outline-none", className)}>
        {children}
      </div>
      {legend}
    </figure>
  );
}

export function ChartLegend({
  items,
}: {
  items: { label: string; color: ChartColor; kind?: "bar" | "line" }[];
}) {
  return (
    <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              swatchClasses[item.color],
              item.kind === "line" ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-xs",
            )}
          />
          {item.label}
        </span>
      ))}
    </figcaption>
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
  format,
  colors,
  labels,
  heading: headingFormatter,
}: Pick<Partial<TooltipContentProps<number, string>>, "active" | "payload" | "label"> & {
  format: ValueFormat;
  colors: Record<string, ChartColor>;
  labels: Record<string, string>;
  heading?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((entry) => entry.value != null);
  const total =
    rows.length > 1 ? rows.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0) : null;
  const heading = headingFormatter ? headingFormatter(String(label)) : String(label);
  return (
    <div className="grid min-w-44 gap-1.5 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay">
      <p className="font-semibold">{heading}</p>
      {rows.map((entry) => {
        const key = String(entry.dataKey);
        const color = colors[key];
        return (
          <div key={key} className="flex items-center gap-2">
            {color && <span className={cn("size-2 rounded-xs", swatchClasses[color])} />}
            <span className="text-muted-foreground">{labels[key] ?? key}</span>
            <span className="num ml-auto font-semibold">
              {formatValue(Number(entry.value), format)}
            </span>
          </div>
        );
      })}
      {total !== null && (
        <div className="flex items-center gap-2 border-t border-border pt-1.5">
          <span className="text-muted-foreground">Total</span>
          <span className="num ml-auto font-semibold">{formatValue(total, format)}</span>
        </div>
      )}
    </div>
  );
}
