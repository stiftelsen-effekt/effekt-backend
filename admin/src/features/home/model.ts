/**
 * Pure helpers behind Home: month windows, the per-organization monthly chart, and the
 * greeting. Kept out of the route so they can be unit tested.
 */
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { enGB } from "date-fns/locale";
import type { ChartSeries } from "@/components/charts/chart";
import { orgChartSeries } from "@/features/distribution/orgs";
import { moneyToNumber, sumMoney } from "@/lib/money";
import type { RouterOutputs } from "@/lib/trpc";

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

/**
 * Turns one `donations.total` result per month (sums per organization) into stacked chart
 * rows per organization, coloured like the organization everywhere else. The largest
 * `maxSeries − 1` organizations over the window get their own series; the rest are "Other".
 */
export function monthlyByOrganization(
  months: MonthWindow[],
  totals: (OrganizationTotal[] | undefined)[],
  maxSeries = 6,
): { series: ChartSeries[]; rows: Record<string, string | number>[] } {
  const grand = new Map<number, { label: string; sums: string[] }>();
  for (const month of totals) {
    for (const row of month ?? []) {
      const entry = grand.get(row.id) ?? { label: row.orgName, sums: [] };
      entry.sums.push(row.sum);
      grand.set(row.id, entry);
    }
  }
  const { series, keyOf } = orgChartSeries(
    [...grand].map(([id, { label, sums }]) => ({
      id,
      label,
      total: moneyToNumber(sumMoney(sums)),
    })),
    maxSeries,
  );

  const rows = months.map((month, index) => {
    const byKey = new Map<string, string[]>();
    for (const row of totals[index] ?? []) {
      const key = keyOf(row.id);
      byKey.set(key, [...(byKey.get(key) ?? []), row.sum]);
    }
    const row: Record<string, string | number> = { month: month.key };
    for (const s of series) row[s.key] = moneyToNumber(sumMoney(byKey.get(s.key) ?? []));
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
