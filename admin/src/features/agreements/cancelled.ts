/**
 * URL state of the Cancelled agreements list and its translation into the
 * `agreements.cancelled` filter. Vipps and AvtaleGiro only, like the rest of the admin.
 */
import { defineList, param, type FilterValues } from "@/components/filters/list-state";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";
import { listProviders } from "./list";

export const cancelledAgreementsList = defineList({
  id: "cancelled-agreements",
  filters: {
    /** Donor name or email; all digits also matches a donor id or part of a KID */
    q: param.text,
    cancelled: param.dateRange,
    provider: param.list(listProviders),
    reason: param.numberList,
    otherActive: param.boolean,
  },
  sortable: [
    "cancelled",
    "created",
    "amount",
    "donorName",
    "latestDonation",
    "donationSum",
    "donationCount",
  ],
  defaultSort: { id: "cancelled", desc: true },
});

export type CancelledListFilters = FilterValues<typeof cancelledAgreementsList.filters>;
export type CancelledApiFilter = NonNullable<RouterInputs["agreements"]["cancelled"]["filter"]>;
export type CancelledAgreementRow = RouterOutputs["agreements"]["cancelled"]["rows"][number];
export type CancelledSummary = RouterOutputs["agreements"]["cancelled"]["summary"];

/** URL filters → agreements.cancelled filter; empty values are left out */
export function toCancelledFilter(filters: CancelledListFilters): CancelledApiFilter {
  const filter: CancelledApiFilter = {
    providers: filters.provider?.length ? filters.provider : undefined,
    cancelled: filters.cancelled,
    reasonIds: filters.reason?.length ? filters.reason : undefined,
    hasOtherActiveAgreement: filters.otherActive,
    donor: filters.q?.trim() || undefined,
  };
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined),
  ) as CancelledApiFilter;
}

/** One line for a row's reasons: names joined, with the donor's own words for "other" */
export function reasonText(reasons: CancelledAgreementRow["reasons"]): string {
  return reasons
    .map((reason) => (reason.comment ? `${reason.name}: “${reason.comment}”` : reason.name))
    .join(" · ");
}

/** Share (0–1) of the cancellations whose donor has another active agreement; null for none */
export function otherActiveShare(
  summary: Pick<CancelledSummary, "count" | "withOtherActiveCount">,
) {
  return summary.count === 0 ? null : summary.withOtherActiveCount / summary.count;
}
