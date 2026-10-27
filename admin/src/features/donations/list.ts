/**
 * URL state of the Donations and Distributions lists, and its translation into the filter
 * shapes of donations.list / donations.distributions.list.
 */
import { defineList, param, type FilterValues, type HistogramBin } from "@/components/filters";
import { osloDayEnd, osloDayStart } from "@/lib/dates";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";

export const taxUnitTypes = ["person", "organization", "none"] as const;
export type TaxUnitTypeOption = (typeof taxUnitTypes)[number];
export const taxUnitTypeLabels: Record<TaxUnitTypeOption, string> = {
  person: "Person",
  organization: "Organization",
  none: "No tax unit",
};

export const donationsList = defineList({
  id: "donations",
  filters: {
    /** Donor name or email */
    q: param.text,
    date: param.dateRange,
    amount: param.range,
    method: param.numberList,
    id: param.text,
    kid: param.text,
    fundraiser: param.text,
    taxUnit: param.list(taxUnitTypes),
    org: param.numberList,
    owner: param.numberList,
  },
  sortable: [
    "timestamp",
    "sum",
    "donor",
    "id",
    "paymentMethod",
    "transactionCost",
    "kid",
    "taxUnitType",
  ],
  defaultSort: { id: "timestamp", desc: true },
});

type DonationFilterInput = NonNullable<RouterInputs["donations"]["list"]["filter"]>;
type TaxUnitTypeInput = NonNullable<DonationFilterInput["taxUnitTypes"]>[number];

/**
 * List filters → donations.list `filter`. Dates are inclusive Oslo days; the procedure
 * compares instants, so they go as the Oslo day's first and last instant (the same days the
 * other lists and reports use, whatever the browser's time zone). "No tax unit" is `null` in
 * taxUnitTypes.
 */
export function toDonationFilter(
  filters: FilterValues<typeof donationsList.filters>,
): DonationFilterInput | undefined {
  const filter: DonationFilterInput = {};
  if (filters.q) filter.donor = filters.q;
  if (filters.date)
    filter.date = {
      from: filters.date.from ? osloDayStart(filters.date.from) : undefined,
      to: filters.date.to ? osloDayEnd(filters.date.to) : undefined,
    };
  if (filters.amount) filter.sum = { from: filters.amount.min, to: filters.amount.max };
  if (filters.method) filter.paymentMethodIDs = filters.method;
  if (filters.id) filter.id = filters.id;
  if (filters.kid) filter.KID = filters.kid;
  if (filters.fundraiser) filter.fundraiserId = filters.fundraiser;
  if (filters.taxUnit)
    filter.taxUnitTypes = filters.taxUnit.map((type) =>
      type === "none" ? null : (type as TaxUnitTypeInput),
    );
  if (filters.org) filter.organizationIDs = filters.org;
  if (filters.owner) filter.dataOwnerIDs = filters.owner;
  return Object.keys(filter).length ? filter : undefined;
}

/**
 * donations.histogram returns the lower edge of each bucket with its count; the bins run to
 * the next edge, the last one as wide as the one before it. The long tail of rare large
 * amounts (above `coverage` of all donations) is folded into the last bin so the slider
 * isn't mostly empty buckets.
 */
export function histogramBins(
  buckets: RouterOutputs["donations"]["histogram"],
  coverage = 0.995,
): HistogramBin[] {
  const bins = buckets.map((bucket, index) => {
    const next = buckets[index + 1]?.bucket;
    const previous = buckets[index - 1]?.bucket ?? 0;
    return {
      from: bucket.bucket,
      to: next ?? bucket.bucket + Math.max(bucket.bucket - previous, 1),
      count: bucket.items,
    };
  });
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  let seen = 0;
  const cut = bins.findIndex((bin) => (seen += bin.count) >= total * coverage);
  if (cut < 0 || cut >= bins.length - 1) return bins;
  const kept = bins.slice(0, cut + 1);
  kept[cut] = { ...kept[cut]!, count: bins.slice(cut).reduce((sum, bin) => sum + bin.count, 0) };
  return kept;
}

export const distributionsList = defineList({
  id: "distributions",
  filters: {
    /** Donor name or email */
    q: param.text,
    kid: param.text,
  },
  sortable: ["KID", "full_name", "email", "sum", "count"],
  defaultSort: { id: "KID", desc: true },
});

export function toDistributionFilter(
  filters: FilterValues<typeof distributionsList.filters>,
): RouterInputs["donations"]["distributions"]["list"]["filter"] {
  if (!filters.q && !filters.kid) return undefined;
  return { donor: filters.q, KID: filters.kid };
}
