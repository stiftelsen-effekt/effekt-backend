/**
 * Vipps recurring charges: URL state of the charges list, its `vipps.charges.list` filter and
 * which charges can be refunded.
 */
import { defineList, param, type FilterValues } from "@/components/filters/list-state";
import { chargeStatus, type ChargeStatus } from "@/lib/status";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";
import { isVippsAgreementId } from "@/features/search/providers";

export const chargeStatuses = Object.keys(chargeStatus) as ChargeStatus[];

export const chargesList = defineList({
  id: "vipps-charges",
  filters: {
    /** Donor name; all digits is a KID, "agr_…" / "VA_…" an agreement id */
    q: param.text,
    kid: param.text,
    agreement: param.text,
    charge: param.text,
    status: param.list(chargeStatuses),
    amount: param.range,
    due: param.dateRange,
  },
  sortable: ["dueDate", "amountNOK", "full_name", "status", "created", "kid"],
  defaultSort: { id: "dueDate", desc: true },
});

export type ChargeListFilters = FilterValues<typeof chargesList.filters>;
export type ChargeApiFilter = NonNullable<RouterInputs["vipps"]["charges"]["list"]["filter"]>;
export type ChargeRow = RouterOutputs["vipps"]["charges"]["list"]["rows"][number];

/** URL filters → vipps.charges.list filter, undefined when nothing applies. */
export function toChargeFilter(filters: ChargeListFilters): ChargeApiFilter | undefined {
  const q = filters.q?.trim();
  const filter: ChargeApiFilter = {};
  if (q && /^\d+$/.test(q)) filter.KID = q;
  else if (q && isVippsAgreementId(q)) filter.agreementID = q;
  else if (q) filter.donor = q;
  if (filters.kid) filter.KID = filters.kid;
  if (filters.agreement) filter.agreementID = filters.agreement;
  if (filters.charge) filter.chargeID = filters.charge;
  if (filters.status?.length) filter.statuses = filters.status;
  // The API ignores 0 as a bound; that's the same as no lower bound.
  if (filters.amount) filter.amount = { from: filters.amount.min, to: filters.amount.max };
  if (filters.due) filter.dueDate = filters.due;
  return Object.keys(filter).length ? filter : undefined;
}

/** Only charged money can go back: the API refunds CHARGED charges in full. */
export const canRefund = (charge: Pick<ChargeRow, "status">) => charge.status === "CHARGED";

/** Histogram buckets (lower edges) → bins for the amount filter. */
export function chargeHistogramBins(buckets: RouterOutputs["vipps"]["charges"]["histogram"]) {
  return buckets.map((bucket, index) => {
    const next = buckets[index + 1]?.bucket;
    const previous = buckets[index - 1]?.bucket ?? 0;
    return {
      from: Number(bucket.bucket),
      to:
        next !== undefined
          ? Number(next)
          : Number(bucket.bucket) + Math.max(Number(bucket.bucket) - Number(previous), 1),
      count: Number(bucket.items),
    };
  });
}
