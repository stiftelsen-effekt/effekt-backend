import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { formatCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NumberRange } from "./list-state";

export type HistogramBin = { from: number; to: number; count: number };

const VIEW_HEIGHT = 48;

function parseNumber(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value.replace(/[\s  ]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** A bound as input text: Norwegian decimal comma, no grouping ("1000", "249,5"). */
const inputText = (value: number | undefined) =>
  value === undefined ? "" : String(value).replace(".", ",");

/** Min/max inputs that accept "1 000" and "1000,5" and commit on Enter or blur. */
export function NumberRangeInputs({
  value,
  onChange,
  unit,
  label,
}: {
  value: NumberRange;
  onChange: (value: NumberRange) => void;
  unit?: string;
  label: string;
}) {
  const [min, setMin] = useState(inputText(value.min));
  const [max, setMax] = useState(inputText(value.max));
  useEffect(() => setMin(inputText(value.min)), [value.min]);
  useEffect(() => setMax(inputText(value.max)), [value.max]);

  const commit = () => onChange({ min: parseNumber(min), max: parseNumber(max) });
  const field = (which: "min" | "max") => (
    <div className="relative">
      <Input
        inputMode="decimal"
        aria-label={`${which === "min" ? "Minimum" : "Maximum"} ${label.toLowerCase()}`}
        placeholder={which === "min" ? "Min" : "Max"}
        value={which === "min" ? min : max}
        className={cn("num", unit && "pr-8")}
        onChange={(event) => (which === "min" ? setMin : setMax)(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
      {unit && (
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  );
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      {field("min")}
      <span className="text-muted-foreground">–</span>
      {field("max")}
    </div>
  );
}

/**
 * Distribution bars with a two-thumb slider snapping to bin edges, plus exact inputs.
 * Used inside the amount filter so people see where the money is before picking bounds.
 */
export function HistogramRange({
  label,
  bins,
  value,
  onChange,
  unit,
}: {
  label: string;
  bins: HistogramBin[];
  value: NumberRange;
  onChange: (value: NumberRange) => void;
  unit?: string;
}) {
  const edges = useMemo(
    () => (bins.length ? [bins[0]!.from, ...bins.map((bin) => bin.to)] : [0, 1]),
    [bins],
  );
  const lastIndex = edges.length - 1;
  const toIndex = (amount: number | undefined, fallback: number) => {
    if (amount === undefined) return fallback;
    const index = edges.findIndex((edge) => edge >= amount);
    return index === -1 ? lastIndex : index;
  };
  const [range, setRange] = useState<[number, number]>([
    toIndex(value.min, 0),
    toIndex(value.max, lastIndex),
  ]);
  useEffect(() => {
    setRange([toIndex(value.min, 0), toIndex(value.max, lastIndex)]);
  }, [value.min, value.max, lastIndex]);

  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  const barWidth = 100 / Math.max(bins.length, 1);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <svg
          viewBox={`0 0 100 ${VIEW_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-12 w-full"
          role="img"
          aria-label={`Distribution of ${label.toLowerCase()}`}
        >
          {bins.map((bin, index) => {
            const height = Math.max((bin.count / maxCount) * VIEW_HEIGHT, bin.count ? 1 : 0);
            const inRange = index >= range[0] && index < range[1];
            return (
              <rect
                key={index}
                x={index * barWidth + barWidth * 0.08}
                width={barWidth * 0.84}
                y={VIEW_HEIGHT - height}
                height={height}
                className={cn("transition-colors", inRange ? "fill-accent" : "fill-border-strong")}
              >
                <title>{`${formatNumber(bin.from)}–${formatNumber(bin.to)}: ${formatNumber(
                  bin.count,
                )}`}</title>
              </rect>
            );
          })}
        </svg>
        <Slider
          min={0}
          max={lastIndex}
          step={1}
          minStepsBetweenThumbs={1}
          value={range}
          onValueChange={(next) => setRange([next[0] ?? 0, next[1] ?? lastIndex])}
          onValueCommit={([lo, hi]) =>
            onChange({
              min: lo === 0 ? undefined : edges[lo ?? 0],
              max: hi === lastIndex ? undefined : edges[hi ?? lastIndex],
            })
          }
          thumbLabels={[`Minimum ${label.toLowerCase()}`, `Maximum ${label.toLowerCase()}`]}
        />
        <div className="num flex justify-between text-xs text-muted-foreground">
          <span>{formatCompact(edges[0] ?? 0)}</span>
          <span>{formatCompact(edges[lastIndex] ?? 0)}+</span>
        </div>
      </div>
      <NumberRangeInputs value={value} onChange={onChange} unit={unit} label={label} />
    </div>
  );
}

/** Buckets raw values into bins with the given edges; overflow goes in the last bin. */
export function binValues(values: number[], edges: number[]): HistogramBin[] {
  const bins = edges.slice(0, -1).map((from, index) => ({ from, to: edges[index + 1]!, count: 0 }));
  for (const value of values) {
    const bin = bins.find((b) => value >= b.from && value < b.to) ?? bins[bins.length - 1];
    if (bin) bin.count += 1;
  }
  return bins;
}
