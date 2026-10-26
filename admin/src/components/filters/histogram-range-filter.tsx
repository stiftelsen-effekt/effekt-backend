import { useEffect, useMemo, useState } from "react";
import { formatCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { FilterGroup } from "./filter-panel";
import { NumberRangeInputs, type NumberRange } from "./fields";

export type HistogramBin = { from: number; to: number; count: number };

const VIEW_HEIGHT = 48;

/**
 * Bars for a distribution plus a two-thumb slider snapping to bin edges.
 * Values outside the selection are dimmed. Typed inputs allow exact bounds.
 */
export function HistogramRangeFilter({
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
  const active = value.min !== undefined || value.max !== undefined;

  function commit([lo, hi]: number[]) {
    onChange({
      min: lo === 0 ? undefined : edges[lo ?? 0],
      max: hi === lastIndex ? undefined : edges[hi ?? lastIndex],
    });
  }

  return (
    <FilterGroup label={label} onClear={active ? () => onChange({}) : undefined}>
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
                className={cn(
                  "transition-colors",
                  inRange ? "fill-foreground" : "fill-border-strong",
                )}
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
          onValueCommit={commit}
          thumbLabels={[`Minimum ${label.toLowerCase()}`, `Maximum ${label.toLowerCase()}`]}
        />
        <div className="num flex justify-between text-2xs text-muted-foreground">
          <span>{formatCompact(edges[0] ?? 0)}</span>
          <span>{formatCompact(edges[lastIndex] ?? 0)}+</span>
        </div>
      </div>
      <NumberRangeInputs value={value} onChange={onChange} unit={unit} />
    </FilterGroup>
  );
}

/** Buckets raw values into bins with round, log-ish edges suited to donation amounts. */
export function binValues(values: number[], edges: number[]): HistogramBin[] {
  const bins = edges.slice(0, -1).map((from, index) => ({ from, to: edges[index + 1]!, count: 0 }));
  for (const value of values) {
    const bin = bins.find((b) => value >= b.from && value < b.to) ?? bins[bins.length - 1];
    if (bin) bin.count += 1;
  }
  return bins;
}
