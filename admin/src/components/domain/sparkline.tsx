import { useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  swatchClasses,
  formatValue,
  type ChartColor,
  type ValueFormat,
} from "@/components/charts/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCompact, formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SparklineSeries = {
  label: string;
  /** One value per month, oldest first */
  values: number[];
  color?: ChartColor | "muted";
};

/** The line itself; the min/max labels to its left take the rest of the old 96 px */
const WIDTH = 76;
const HEIGHT = 32;
/** Room for the stroke and the end dot at the edges */
const PAD = 3;

/** Scale labels: money as compact whole kroner ("350k", "1,2M"), counts in full */
const scaleLabel = (value: number, format: ValueFormat) =>
  format === "money" ? formatCompact(Math.round(value)) : formatNumber(Math.round(value));

const swatch = (color: SparklineSeries["color"]) => (
  <span
    className={cn(
      "h-0.5 w-2.5 shrink-0 rounded-full",
      color === "muted" ? "bg-faint-foreground" : swatchClasses[color ?? "chart-1"],
    )}
  />
);

/** Fixed width, so the line doesn't move when the labels change; as tall as the line */
const scaleClasses =
  "num flex h-8 min-w-7 flex-col justify-between py-px text-right text-[10px] leading-none text-muted-foreground";

const strokeColor = (color: SparklineSeries["color"]) =>
  color === "muted" ? "var(--faint-foreground)" : `var(--${color ?? "chart-1"})`;

/**
 * A small trend line (about 104 × 32), for a `Stat`: no axes, just its lowest and highest value
 * in tiny type at the left edge. Months are "YYYY-MM", oldest first.
 * With `partialLast`, the last month is still running: its segment is dashed and lighter, and
 * the readout says "so far". Hover, or focus and the arrow keys, show a month's value.
 *
 * `months` undefined reserves the box (first load), so the stat doesn't move when it arrives.
 * Several series share one scale from zero (labels 0 and max); one series is scaled to its own
 * range (labels min and max). There is no legend: the readout names each series.
 */
export function Sparkline({
  months,
  series,
  format = "number",
  partialLast = false,
  label,
  className,
}: {
  months: string[] | undefined;
  series: SparklineSeries[];
  format?: ValueFormat;
  partialLast?: boolean;
  /** Accessible name, e.g. "Donations, last 13 months" */
  label: string;
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const count = months?.length ?? 0;

  if (!months || count < 2) {
    return (
      <span data-slot="sparkline" aria-hidden className={cn("flex gap-1", className)}>
        <span className={scaleClasses} />
        <span className="block" style={{ width: WIDTH, height: HEIGHT }} />
      </span>
    );
  }

  const all = series.flatMap((item) => item.values);
  const shared = series.length > 1;
  const min = shared ? 0 : Math.min(...all);
  const top = Math.max(...all);
  const max = Math.max(top, min + 1);
  const x = (index: number) => PAD + (index / (count - 1)) * (WIDTH - 2 * PAD);
  const y = (value: number) => HEIGHT - PAD - ((value - min) / (max - min)) * (HEIGHT - 2 * PAD);
  const path = (values: number[], from: number, to: number) =>
    values
      .slice(from, to + 1)
      .map(
        (value, offset) =>
          `${offset ? "L" : "M"}${x(from + offset).toFixed(1)},${y(value).toFixed(1)}`,
      )
      .join("");
  const solidEnd = partialLast ? count - 2 : count - 1;

  const indexAt = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio =
      (event.clientX - box.left - (PAD * box.width) / WIDTH) /
      (box.width * (1 - (2 * PAD) / WIDTH));
    return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    setActive((index) => Math.min(count - 1, Math.max(0, (index ?? count - 1) + step)));
  };

  const shown = active ?? count - 1;
  const monthLabel = (index: number) => {
    const text = formatDate(`${months[index]}-01`, "month");
    return partialLast && index === count - 1 ? `${text} (so far)` : text;
  };

  return (
    <span data-slot="sparkline" className={cn("flex gap-1", className)}>
      <span aria-hidden className={scaleClasses}>
        {/* A flat line sits on its minimum: then there is no separate top */}
        <span>{top > min ? scaleLabel(top, format) : ""}</span>
        <span>{scaleLabel(min, format)}</span>
      </span>
      <Tooltip open={active !== null} delayDuration={0}>
        <TooltipTrigger asChild>
          <svg
            role="img"
            aria-label={label}
            tabIndex={0}
            width={WIDTH}
            height={HEIGHT}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="block shrink-0 cursor-crosshair overflow-visible rounded-xs focus-ring"
            onPointerMove={(event) => setActive(indexAt(event))}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(count - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={onKeyDown}
          >
            {active !== null && (
              <line
                x1={x(active)}
                x2={x(active)}
                y1={0}
                y2={HEIGHT}
                stroke="var(--border-strong)"
                strokeWidth={1}
              />
            )}
            {series.map((item) => {
              const stroke = strokeColor(item.color);
              const last = item.values[count - 1] ?? 0;
              return (
                <g key={item.label} fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d={path(item.values, 0, solidEnd)} stroke={stroke} strokeWidth={1.5} />
                  {partialLast && (
                    <path
                      d={path(item.values, count - 2, count - 1)}
                      stroke={stroke}
                      strokeWidth={1.5}
                      strokeDasharray="2 2.5"
                      opacity={0.55}
                    />
                  )}
                  <circle
                    cx={x(active ?? count - 1)}
                    cy={y(active === null ? last : item.values[active] ?? 0)}
                    r={2}
                    fill={
                      partialLast && (active ?? count - 1) === count - 1 ? "var(--surface)" : stroke
                    }
                    stroke={stroke}
                    strokeWidth={1.25}
                  />
                </g>
              );
            })}
          </svg>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="grid min-w-36 gap-1 rounded-md border border-border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-overlay [&_svg]:hidden"
        >
          <span className="font-semibold">{monthLabel(shown)}</span>
          {series.map((item) => (
            <span key={item.label} className="flex items-center gap-2">
              {shared && swatch(item.color)}
              <span className="text-muted-foreground">{item.label}</span>
              <span className="num ml-auto font-semibold">
                {formatValue(item.values[shown] ?? 0, format)}
              </span>
            </span>
          ))}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}
