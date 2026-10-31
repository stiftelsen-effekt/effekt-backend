import type { CohortRow, NewDonorRow, ReferralType } from "./donorCohorts";

/**
 * Shapes the donor-cohort query rows into what the admin shows. Pure, so the rules are tested
 * without a database. Money stays exact: decimal strings are added up in øre (BigInt).
 */

/** First cohort shown; earlier donors still count as earlier cohorts, never as new ones */
export const FIRST_COHORT_YEAR = 2016;
/** Named referral sources in the by-source series; the rest goes into "Other / unknown" */
const TOP_REFERRAL_SOURCES = 6;
const OTHER_SOURCE = { key: "other", label: "Other / unknown" } as const;
/** Referral type names that mean "other" already (Annet) */
const OTHER_TYPE_NAMES = new Set(["annet", "other", "andet", "övrigt", "annat"]);

const toOre = (value: string): bigint => {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  const negative = whole.startsWith("-");
  const ore = BigInt(whole.replace("-", "") || "0") * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -ore : ore;
};

const fromOre = (ore: bigint): string => {
  const negative = ore < 0n;
  const abs = negative ? -ore : ore;
  return `${negative ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
};

/** The `count` months ending with `lastMonth` (YYYY-MM), oldest first */
export function monthsEndingWith(lastMonth: string, count: number): string[] {
  const [year, month] = lastMonth.split("-").map(Number) as [number, number];
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const index = year * 12 + (month - 1) - i;
    months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`);
  }
  return months;
}

export type NewDonorsSource = { key: string; label: string };

export type NewDonorsMonth = {
  month: string;
  donors: number;
  /** Their donations in that month, decimal string */
  volume: string;
  /** New donors per source key (every key in `sources`, zeros included) */
  bySource: Record<string, number>;
};

export type NewDonors = {
  months: NewDonorsMonth[];
  /** Top sources by new donors in the window, then "Other / unknown" */
  sources: NewDonorsSource[];
  /** The current month, still in progress */
  partialMonth: string;
};

export function buildNewDonors(
  rows: NewDonorRow[],
  types: ReferralType[],
  { currentMonth, months: count }: { currentMonth: string; months: number },
): NewDonors {
  const months = monthsEndingWith(currentMonth, count);
  const inWindow = new Set(months);
  const window = rows.filter((r) => inWindow.has(r.month));
  const names = new Map(types.map((t) => [t.id, t.name]));
  const isOther = (id: number | null) =>
    id === null || !names.has(id) || OTHER_TYPE_NAMES.has(names.get(id)!.trim().toLowerCase());

  const totals = new Map<number, number>();
  for (const r of window) {
    if (!isOther(r.referralId)) {
      totals.set(r.referralId!, (totals.get(r.referralId!) ?? 0) + r.donors);
    }
  }
  const top = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, TOP_REFERRAL_SOURCES)
    .map(([id]) => id);
  const keyOf = (id: number | null) =>
    id !== null && top.includes(id) ? `ref-${id}` : OTHER_SOURCE.key;
  const sources: NewDonorsSource[] = [
    ...top.map((id) => ({ key: `ref-${id}`, label: names.get(id)! })),
    OTHER_SOURCE,
  ];

  const byMonth = new Map(
    months.map((month) => [
      month,
      {
        donors: 0,
        volume: 0n,
        bySource: Object.fromEntries(sources.map((s) => [s.key, 0])) as Record<string, number>,
      },
    ]),
  );
  for (const r of window) {
    const entry = byMonth.get(r.month)!;
    entry.donors += r.donors;
    entry.volume += toOre(r.volume);
    entry.bySource[keyOf(r.referralId)]! += r.donors;
  }

  return {
    months: months.map((month) => {
      const entry = byMonth.get(month)!;
      return {
        month,
        donors: entry.donors,
        volume: fromOre(entry.volume),
        bySource: entry.bySource,
      };
    }),
    sources,
    partialMonth: currentMonth,
  };
}

export type CohortCell = {
  year: number;
  /** Cohort donors who gave in this year */
  donors: number;
  /** donors / cohort size, 0–1 (1 in the cohort's own year) */
  share: number;
  /** The cohort's donations in this year, decimal string */
  volume: string;
};

export type Cohort = {
  /** The year of the first donation */
  year: number;
  size: number;
  /** Donations in the first year, decimal string */
  firstYearVolume: string;
  /** One per calendar year from the cohort's year to the current one */
  cells: CohortCell[];
};

export type Cohorts = {
  /** Column years, oldest first; the last is the current one */
  years: number[];
  /** The current year, still in progress */
  partialYear: number;
  cohorts: Cohort[];
};

export function buildCohorts(rows: CohortRow[], currentYear: number): Cohorts {
  const firstYear = Math.min(
    currentYear,
    Math.max(FIRST_COHORT_YEAR, Math.min(...rows.map((r) => r.cohort), currentYear)),
  );
  const years: number[] = [];
  for (let y = firstYear; y <= currentYear; y++) years.push(y);
  const cell = new Map(rows.map((r) => [`${r.cohort}:${r.year}`, r]));

  const cohorts = years
    .map((cohortYear): Cohort => {
      const own = cell.get(`${cohortYear}:${cohortYear}`);
      const size = own?.donors ?? 0;
      return {
        year: cohortYear,
        size,
        firstYearVolume: fromOre(toOre(own?.volume ?? "0")),
        cells: years
          .filter((y) => y >= cohortYear)
          .map((y) => {
            const r = cell.get(`${cohortYear}:${y}`);
            const donors = r?.donors ?? 0;
            return {
              year: y,
              donors,
              share: size > 0 ? donors / size : 0,
              volume: fromOre(toOre(r?.volume ?? "0")),
            };
          }),
      };
    })
    .filter((c) => c.size > 0);

  return { years, partialYear: currentYear, cohorts };
}
