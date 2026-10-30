/**
 * AvtaleGiro charges (the claims we send to the bank): URL state of the charges list, its
 * `giro.avtalegiro.charges.list` filter, and what a charge's state means for the people reading it.
 */
import { defineList, param, type FilterValues } from "@/components/filters/list-state";
import { addDays } from "@/lib/dates";
import { avtaleGiroChargeStatus, type AvtaleGiroChargeStatus } from "@/lib/status";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";

export const avtaleGiroChargeStatuses = Object.keys(
  avtaleGiroChargeStatus,
) as AvtaleGiroChargeStatus[];

export const avtaleGiroChargesList = defineList({
  id: "avtalegiro-charges",
  filters: {
    /** Donor name; all digits is a KID */
    q: param.text,
    kid: param.text,
    agreement: param.number,
    donor: param.number,
    shipment: param.number,
    status: param.list(avtaleGiroChargeStatuses),
    matched: param.boolean,
    amount: param.range,
    due: param.dateRange,
  },
  sortable: ["dueDate", "amount", "status", "created", "donorName", "kid"],
  defaultSort: { id: "dueDate", desc: true },
});

export type AvtaleGiroChargeListFilters = FilterValues<typeof avtaleGiroChargesList.filters>;
export type AvtaleGiroChargeApiFilter = NonNullable<
  RouterInputs["giro"]["avtalegiro"]["charges"]["list"]["filter"]
>;
export type AvtaleGiroChargeRow =
  RouterOutputs["giro"]["avtalegiro"]["charges"]["list"]["rows"][number];
export type AvtaleGiroChargeSummary =
  RouterOutputs["giro"]["avtalegiro"]["charges"]["list"]["summary"];

/** URL filters → giro.avtalegiro.charges.list filter, undefined when nothing applies. */
export function toAvtaleGiroChargeFilter(
  filters: AvtaleGiroChargeListFilters,
): AvtaleGiroChargeApiFilter | undefined {
  const q = filters.q?.trim();
  const filter: AvtaleGiroChargeApiFilter = {};
  if (q && /^\d+$/.test(q)) filter.KID = q;
  else if (q) filter.donor = q;
  if (filters.kid) filter.KID = filters.kid;
  if (filters.agreement !== undefined && filters.agreement > 0)
    filter.agreementId = filters.agreement;
  if (filters.donor !== undefined && filters.donor > 0) filter.donorId = filters.donor;
  if (filters.shipment !== undefined && filters.shipment > 0) filter.shipmentId = filters.shipment;
  if (filters.status?.length) filter.statuses = filters.status;
  if (filters.matched !== undefined) filter.matched = filters.matched;
  if (filters.amount) {
    filter.amount = {
      ...(filters.amount.min !== undefined && { from: Math.max(0, filters.amount.min) }),
      ...(filters.amount.max !== undefined && { to: Math.max(0, filters.amount.max) }),
    };
  }
  if (filters.due) filter.dueDate = filters.due;
  return Object.keys(filter).length ? filter : undefined;
}

/**
 * The OCR import links a payment to a claim due up to 14 days earlier
 * (src/custom_modules/avtalegiro/charges.ts in the API).
 */
export const PAYMENT_MATCH_DAYS = 14;

/**
 * A claim still unpaid after the matching window: either the donor's bank didn't pay it, or the
 * payment came in but couldn't be linked. Worth a look in the AvtaleGiro check.
 */
export function isOverdue(
  charge: Pick<AvtaleGiroChargeRow, "status" | "dueDate">,
  today: string,
): boolean {
  return charge.status === "CLAIMED" && addDays(charge.dueDate, PAYMENT_MATCH_DAYS) < today;
}

/** What happened to the claim, in a sentence for its details. */
export function describeCharge(
  charge: Pick<
    AvtaleGiroChargeRow,
    "status" | "dueDate" | "donationId" | "shipmentId" | "deletionShipmentId"
  >,
  today: string,
): string {
  switch (charge.status) {
    case "CLAIMED":
      if (isOverdue(charge, today)) {
        return `No payment has been matched, and it's more than ${PAYMENT_MATCH_DAYS} days past the due date. Check the AvtaleGiro check for the day, or whether the payment was registered by hand.`;
      }
      return charge.dueDate >= today
        ? `Sent to the bank in shipment ${charge.shipmentId}. The donor is charged on the due date.`
        : `Sent to the bank in shipment ${charge.shipmentId}. The payment usually arrives in the OCR file within a few banking days of the due date.`;
    case "COMPLETED":
      return charge.donationId != null
        ? `Paid. The payment is registered as donation ${charge.donationId}.`
        : "Paid.";
    case "SUPERSEDED":
      return `The bank didn't accept shipment ${charge.shipmentId}, so a retry sent this claim again in a new shipment. The newer claim is the one that counts.`;
    case "DELETION_REQUESTED":
      return "The agreement was cancelled before the due date. The claim goes in the next deletion file (sent on banking days at 10:00–13:00).";
    case "DELETION_SENT":
      return `Sent for deletion in shipment ${charge.deletionShipmentId ?? "–"}. Waiting for the bank to accept the file; a retry sends it again if not.`;
    case "DELETED":
      // A payment that arrives anyway is linked and marks the claim paid, so a deleted claim has none
      return `The bank accepted the deletion (shipment ${charge.deletionShipmentId ?? "–"}). The donor isn't charged.`;
  }
}

/** Per-status counts from the summary, in the catalog's order, for the status filter. */
export function statusCounts(summary: AvtaleGiroChargeSummary | undefined) {
  const counts = new Map(summary?.byStatus.map((row) => [row.status, row.count]));
  return avtaleGiroChargeStatuses.map((status) => ({
    status,
    count: summary ? (counts.get(status) ?? 0) : undefined,
  }));
}
