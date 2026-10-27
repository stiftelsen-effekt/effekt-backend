import { defineList, param, type FilterValues } from "@/components/filters";
import { config } from "@/lib/config";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";

export type FundraiserRow = RouterOutputs["reports"]["fundraisers"]["list"]["rows"][number];
export type FundraiserFilter = NonNullable<
  RouterInputs["reports"]["fundraisers"]["list"]["filter"]
>;

export const fundraisersList = defineList({
  id: "fundraisers",
  filters: {
    q: param.text,
    registered: param.dateRange,
    count: param.range,
    sum: param.range,
    org: param.numberList,
  },
  sortable: ["id", "registered", "donor", "totalSum", "donationCount", "averageDonation"],
  defaultSort: { id: "registered", desc: true },
});

export type FundraiserListFilters = FilterValues<typeof fundraisersList.filters>;

const range = (value: { min?: number; max?: number } | undefined) =>
  value && { from: value.min, to: value.max };

/** Digits in the search box are a fundraiser id; anything else part of the owner's name. */
export function toFundraiserFilter(filters: FundraiserListFilters): FundraiserFilter | undefined {
  const q = filters.q?.trim();
  const filter: FundraiserFilter = {
    fundraiserId: q && /^\d+$/.test(q) ? Number(q) : undefined,
    donor: q && !/^\d+$/.test(q) ? q : undefined,
    registrationDate: filters.registered,
    donationCount: range(filters.count),
    donationSum: range(filters.sum),
    organizationIDs: filters.org,
  };
  const present = Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined),
  ) as FundraiserFilter;
  return Object.keys(present).length > 0 ? present : undefined;
}

/** The fundraiser owner's dashboard, served by the API (the secret is the access key). */
export const dashboardUrl = (secret: string) =>
  `${config.apiUrl}/fundraisers/dashboard/${encodeURIComponent(secret)}`;
