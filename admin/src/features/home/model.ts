/**
 * Pure helpers behind Home: month windows, the per-cause-area monthly chart, and the
 * greeting. Kept out of the route so they can be unit tested.
 */
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { enGB } from "date-fns/locale";
import type { ChartSeries } from "@/components/charts/chart";
import { moneyToNumber, sumMoney } from "@/lib/money";
import type { RouterOutputs } from "@/lib/trpc";

type CauseArea = RouterOutputs["config"]["causeAreas"]["listAll"][number];
export type OrganizationTotal = RouterOutputs["donations"]["total"][number];
type MonthlyTotal = RouterOutputs["donations"]["totalMonthly"][number];

/** Local calendar date as the API's YYYY-MM-DD. */
export const isoDay = (date: Date) => format(date, "yyyy-MM-dd");

export type MonthWindow = {
  /** "2026-10" */
  key: string;
  year: number;
  /** 1–12 */
  month: number;
  fromDate: string;
  /** Inclusive; today for the current month */
  toDate: string;
};

/** The last `count` calendar months, oldest first, the current month (to today) last. */
export function lastMonths(today: Date, count = 12): MonthWindow[] {
  return Array.from({ length: count }, (_, index) => {
    const start = startOfMonth(subMonths(today, count - 1 - index));
    const end = index === count - 1 ? today : endOfMonth(start);
    return {
      key: format(start, "yyyy-MM"),
      year: start.getFullYear(),
      month: start.getMonth() + 1,
      fromDate: isoDay(start),
      toDate: isoDay(end),
    };
  });
}

/** Exact sum for one month from `donations.totalMonthly` ("0.00" when there is no row). */
export function monthSum(rows: MonthlyTotal[] | undefined, year: number, month: number) {
  return sumMoney(
    (rows ?? []).filter((row) => row.year === year && row.month === month).map((r) => r.sum),
  );
}

const OTHER = "other";
const MAX_SERIES = 5; // chart-1…5

/**
 * Turns one `donations.total` result per month (sums per organization) into stacked chart
 * rows per cause area. The five colours fit five series: with more cause areas, the
 * smallest are folded into "Other". Organizations missing from the config also go to Other.
 */
export function monthlyByCauseArea(
  months: MonthWindow[],
  totals: (OrganizationTotal[] | undefined)[],
  causeAreas: CauseArea[],
): { series: ChartSeries[]; rows: Record<string, string | number>[] } {
  const areaOfOrg = new Map<number, number>();
  for (const area of causeAreas) {
    for (const org of area.organizations) areaOfOrg.set(org.id, area.id);
  }
  const keyOf = (orgId: number) => {
    const areaId = areaOfOrg.get(orgId);
    return areaId === undefined ? OTHER : `area-${areaId}`;
  };

  // Exact sums per month and series key.
  const exact = months.map((_, index) => {
    const byKey = new Map<string, string[]>();
    for (const row of totals[index] ?? []) {
      const key = keyOf(row.id);
      byKey.set(key, [...(byKey.get(key) ?? []), row.sum]);
    }
    return new Map([...byKey].map(([key, sums]) => [key, sumMoney(sums)]));
  });

  const grand = new Map<string, number>();
  for (const month of exact) {
    for (const [key, sum] of month) grand.set(key, (grand.get(key) ?? 0) + moneyToNumber(sum));
  }

  const ordered = [...causeAreas]
    .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
    .map((area) => ({ key: `area-${area.id}`, label: area.name }))
    .filter((series) => (grand.get(series.key) ?? 0) !== 0);

  let kept = ordered;
  const folded = new Set<string>();
  const hasOther = (grand.get(OTHER) ?? 0) !== 0;
  if (ordered.length + (hasOther ? 1 : 0) > MAX_SERIES) {
    const byTotal = [...ordered].sort((a, b) => (grand.get(b.key) ?? 0) - (grand.get(a.key) ?? 0));
    const keep = new Set(byTotal.slice(0, MAX_SERIES - 1).map((s) => s.key));
    kept = ordered.filter((s) => keep.has(s.key));
    ordered.filter((s) => !keep.has(s.key)).forEach((s) => folded.add(s.key));
  }
  const showOther = hasOther || folded.size > 0;

  const series: ChartSeries[] = [...kept, ...(showOther ? [{ key: OTHER, label: "Other" }] : [])];

  const rows = months.map((month, index) => {
    const row: Record<string, string | number> = { month: month.key };
    const otherSums: string[] = [];
    for (const [key, sum] of exact[index]!) {
      if (key === OTHER || folded.has(key)) otherSums.push(sum);
      else row[key] = moneyToNumber(sum);
    }
    for (const s of series) if (row[s.key] === undefined) row[s.key] = 0;
    if (showOther) row[OTHER] = moneyToNumber(sumMoney(otherSums));
    return row;
  });

  return { series, rows };
}

export function greeting(givenName: string | undefined, now = new Date()) {
  const hour = now.getHours();
  const part = hour < 10 ? "Good morning" : hour < 17 ? "Hello" : "Good evening";
  return givenName ? `${part}, ${givenName}` : part;
}

/** Short axis label for "2026-10": "Oct", with the year on January ("Jan 2026"). */
export function monthTick(key: string) {
  const [year, month] = key.split("-").map(Number);
  const name = format(new Date(year!, month! - 1, 1), "LLL", { locale: enGB });
  return month === 1 ? `${name} ${year}` : name;
}
