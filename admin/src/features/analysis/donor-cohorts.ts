import type { ChartColor, ChartSeries } from "@/components/charts";
import { moneyToNumber } from "@/lib/money";
import type { RouterOutputs } from "@/lib/trpc";

export type NewDonors = RouterOutputs["analysis"]["newDonors"];
export type Cohorts = RouterOutputs["analysis"]["cohorts"];
export type Cohort = Cohorts["cohorts"][number];
export type CohortCell = Cohort["cells"][number];

/** Months of new donors on Analysis and Home (one query, shared) */
export const NEW_DONOR_MONTHS = 24;

/** One line under both sections, so the numbers can be read without asking */
export const DONOR_DEFINITION =
  "First donation: a donor's earliest confirmed one, Oslo time, without Influenced (15) and AMF direkte (16).";

/**
 * Referral colours: the named sources in chart-1…4 then the softer 6…9; "Other / unknown"
 * is always the light grey (chart-5), as in organization splits.
 */
const sourceColors: ChartColor[] = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-6",
  "chart-7",
  "chart-8",
  "chart-9",
];

export type NewDonorsRow = { month: string; donors: number; volume: number } & Record<
  string,
  number | string
>;

/** Chart rows: one per month, the count per source spread out as columns */
export function newDonorRows(data: NewDonors): NewDonorsRow[] {
  return data.months.map((m) => ({
    ...m.bySource,
    month: m.month,
    donors: m.donors,
    volume: moneyToNumber(m.volume),
  }));
}

export function sourceSeries(data: NewDonors): ChartSeries[] {
  let named = 0;
  return data.sources.map((s) => ({
    key: s.key,
    label: s.label,
    color: s.key === "other" ? "chart-5" : sourceColors[named++ % sourceColors.length],
  }));
}

export type CohortMetric = "donors" | "volume";

/**
 * The scale for the heatmap: the largest later-year value in the table. A cohort's own first
 * year (100 % by definition, and usually its biggest volume) isn't coloured, so it doesn't
 * wash out the retention cells that are the point of the table.
 */
export function cohortScale(cohorts: Cohort[], metric: CohortMetric) {
  let max = 0;
  for (const c of cohorts) {
    for (const cell of c.cells) {
      if (cell.year === c.year) continue;
      max = Math.max(max, metric === "donors" ? cell.share : moneyToNumber(cell.volume));
    }
  }
  return max;
}

/** How strong a later-year cell's colour is, 0–1, against the table's scale; 0 for the first year */
export function cohortIntensity(
  cohort: Cohort,
  cell: CohortCell,
  metric: CohortMetric,
  scale: number,
) {
  if (cell.year === cohort.year || scale <= 0) return 0;
  const value = metric === "donors" ? cell.share : moneyToNumber(cell.volume);
  return Math.min(1, Math.max(0, value / scale));
}

/**
 * The cell's background: chart-4 (teal) mixed into the surface. Capped (CSS `--heat-max`,
 * lower in dark mode) so the cell text keeps AA contrast at full strength.
 */
export function heatBackground(intensity: number) {
  if (intensity <= 0) return undefined;
  const pct = `calc(var(--heat-max) * ${intensity.toFixed(3)})`;
  return `color-mix(in oklab, var(--chart-4) ${pct}, var(--surface))`;
}

/** The last `count` months of the series, for a sparkline */
export const lastMonths = (data: NewDonors, count: number) => data.months.slice(-count);
