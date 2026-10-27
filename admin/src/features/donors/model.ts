/**
 * Donors: list definition, filter → API mapping and the read models the donor page shows
 * (totals, yearly chart, agreements across providers). Pages never compute these inline.
 */
import { defineList, param, type FilterValues } from "@/components/filters";
import { fromAvtaleGiro, fromVipps, type AgreementRow } from "@/features/agreements/model";
import { fromMinorUnits, moneyToNumber, sumMoney, toMinorUnits } from "@/lib/money";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";

export type DonorListRow = RouterOutputs["donors"]["list"]["rows"][number];
export type DonorFilter = NonNullable<RouterInputs["donors"]["list"]["filter"]>;
export type DonorSort = NonNullable<RouterInputs["donors"]["list"]["sort"]>;
export type YearlyAggregateRow = RouterOutputs["donors"]["donationsAggregated"][number];
export type TaxUnit = RouterOutputs["donors"]["taxUnits"]["list"][number];

export const fundraiserGivingOptions = [
  { value: "atLeastOnce", label: "Gave to a fundraiser" },
  { value: "only", label: "Only gave to fundraisers" },
  { value: "never", label: "Never gave to a fundraiser" },
] as const;
export type FundraiserGiving = (typeof fundraiserGivingOptions)[number]["value"];

export const fundraiserTypes = ["facebook", "homebrew"] as const;

export const donorsList = defineList({
  id: "donors",
  filters: {
    q: param.text,
    registered: param.dateRange,
    donated: param.dateRange,
    lastDonation: param.dateRange,
    sum: param.range,
    count: param.range,
    fundraiser: param.oneOf(fundraiserGivingOptions.map((option) => option.value)),
    fundraiserType: param.list(fundraiserTypes),
    newsletter: param.boolean,
    org: param.numberList,
    referral: param.numberList,
  },
  sortable: [
    "id",
    "name",
    "email",
    "registered",
    "lastDonationDate",
    "donationsCount",
    "donationsSum",
  ],
  defaultSort: { id: "id", desc: true },
});

export type DonorListFilters = FilterValues<typeof donorsList.filters>;

const range = (value: { min?: number; max?: number } | undefined) =>
  value && { from: value.min, to: value.max };

/**
 * The list's search box: digits are a donor id, anything else part of a name or an email
 * address (the API matches either).
 */
export function searchToFilter(q: string | undefined): Partial<DonorFilter> {
  const query = q?.trim();
  if (!query) return {};
  if (/^\d+$/.test(query)) return { donorId: Number(query) };
  return { nameOrEmail: query };
}

/**
 * URL filter values → donors.list / donors.export filter. Undefined when nothing applies.
 *
 * The API's donationsDateRange only scopes the totals (count, sum, last donation) to the period
 * and keeps donors without donations in it. "Donated between" means donors who gave in the
 * period, so unless a donation count range is set it also asks for at least one donation.
 */
export function toDonorFilter(filters: DonorListFilters): DonorFilter | undefined {
  const filter: DonorFilter = {
    ...searchToFilter(filters.q),
    registered: filters.registered,
    donationsDateRange: filters.donated,
    lastDonationDate: filters.lastDonation,
    donationsSum: range(filters.sum),
    donationsCount: range(filters.count) ?? (filters.donated ? { from: 1 } : undefined),
    fundraiserGiving: filters.fundraiser,
    fundraiserTypes: filters.fundraiserType,
    newsletter: filters.newsletter,
    recipientOrgIDs: filters.org,
    referralTypeIDs: filters.referral,
  };
  const present = Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined),
  ) as DonorFilter;
  return Object.keys(present).length > 0 ? present : undefined;
}

/** The organization abbreviation that marks a share to our own operations ("Drift"). */
export const OPERATIONS_ABBREVIATION = "Drift";

const subtractMoney = (a: string, b: string) => fromMinorUnits(toMinorUnits(a) - toMinorUnits(b));

export type DonorTotals = {
  total: string;
  operations: string;
  excludingOperations: string;
  byYear: Map<number, string>;
};

/** Exact totals from the yearly per-organization aggregate. */
export function donorTotals(rows: YearlyAggregateRow[]): DonorTotals {
  const total = sumMoney(rows.map((row) => row.value));
  const operations = sumMoney(
    rows.filter((row) => row.abbriv === OPERATIONS_ABBREVIATION).map((row) => row.value),
  );
  const byYear = new Map<number, string>();
  for (const year of new Set(rows.map((row) => row.year))) {
    byYear.set(year, sumMoney(rows.filter((row) => row.year === year).map((row) => row.value)));
  }
  return { total, operations, excludingOperations: subtractMoney(total, operations), byYear };
}

export type YearlyChart = {
  data: Record<string, string | number>[];
  series: { key: string; label: string }[];
};

/**
 * Yearly totals by organization for a stacked bar chart. The chart has five colours, so the
 * four largest organizations get their own series and the rest are grouped.
 */
export function yearlyChart(rows: YearlyAggregateRow[], maxSeries = 5): YearlyChart {
  const totals = new Map<number, { label: string; total: bigint }>();
  for (const row of rows) {
    const current = totals.get(row.ID) ?? { label: row.organization, total: 0n };
    current.total += toMinorUnits(row.value);
    totals.set(row.ID, current);
  }
  const ranked = [...totals.entries()].sort(([, a], [, b]) =>
    a.total === b.total ? 0 : a.total > b.total ? -1 : 1,
  );
  const grouped = ranked.length > maxSeries;
  const named = grouped ? ranked.slice(0, maxSeries - 1) : ranked;
  const namedIds = new Set(named.map(([id]) => id));
  const series = named.map(([id, { label }]) => ({ key: `org${id}`, label }));
  if (grouped) series.push({ key: "rest", label: "Remaining organizations" });

  const years = [...new Set(rows.map((row) => row.year))].sort((a, b) => a - b);
  const data = years.map((year) => {
    const point: Record<string, string | number> = { year: String(year) };
    for (const { key } of series) {
      const values = rows
        .filter((row) => row.year === year)
        .filter((row) => (key === "rest" ? !namedIds.has(row.ID) : `org${row.ID}` === key))
        .map((row) => row.value);
      point[key] = moneyToNumber(sumMoney(values));
    }
    return point;
  });
  return { data, series };
}

type Recurring = RouterOutputs["donors"]["recurring"];

/** A donor's Vipps and AvtaleGiro agreements, as one list. */
export function donorAgreements(
  donorName: string,
  recurring: { vipps?: Recurring["vipps"]; avtalegiro?: Recurring["avtalegiro"] },
): AgreementRow[] {
  return [
    ...(recurring.avtalegiro ?? []).map((row) =>
      fromAvtaleGiro({
        ...row,
        created: row.created ?? "",
        last_updated: row.last_updated ?? "",
        full_name: donorName,
      }),
    ),
    ...(recurring.vipps ?? []).map((row) =>
      fromVipps({
        ...row,
        // Stored lowercase in some databases; the model expects Vipps' uppercase states.
        status: String(row.status).toUpperCase(),
        full_name: row.full_name ?? donorName,
      }),
    ),
  ];
}

/**
 * Personal numbers are shown masked outside of edit forms: the birth date part stays (it's
 * what people match on), the individual digits don't. Organization numbers are public.
 */
export function maskSsn(ssn: string | null | undefined): string {
  if (!ssn) return "";
  const digits = ssn.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 6)} •••••`;
  return ssn;
}

export const isArchived = (unit: Pick<TaxUnit, "archived">) => Boolean(unit.archived);
