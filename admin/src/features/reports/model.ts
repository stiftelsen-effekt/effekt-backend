import { osloDateTimeText } from "@/lib/dates";
import { sumMoney } from "@/lib/money";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";

export type TransactionRow = RouterOutputs["reports"]["transactions"]["range"]["rows"][number];
type TransactionRangeInput = RouterInputs["reports"]["transactions"]["range"];

/** Form state → procedure input. No payment method chosen means all of them. */
export function transactionRangeInput(form: {
  from: string;
  to: string;
  paymentMethodIds: number[];
}): TransactionRangeInput {
  return {
    fromDate: form.from,
    toDate: form.to,
    ...(form.paymentMethodIds.length ? { paymentMethodIDs: form.paymentMethodIds } : {}),
  };
}

/**
 * One CSV line per donation and organization (the split), so the file opens as a flat
 * table. Amounts stay decimal strings.
 */
export function transactionCsvRows(rows: TransactionRow[]): Record<string, unknown>[] {
  return rows.flatMap((donation): Record<string, unknown>[] => {
    const base = {
      donationId: donation.ID,
      time: donation.time == null ? null : osloDateTimeText(donation.time),
      donorId: donation.donorID,
      donorName: donation.name,
      sum: donation.sum,
      paymentMethod: donation.paymentMethod,
      transactionCost: donation.transactionCost,
    };
    if (donation.split.length === 0) {
      return [
        { ...base, organizationId: null, organization: null, percentage: null, amount: null },
      ];
    }
    return donation.split.map((share) => ({
      ...base,
      organizationId: share.id,
      organization: share.name,
      percentage: share.percentage,
      amount: share.amount,
    }));
  });
}

/** Count and exact total of a transaction report, for the result line. */
export function transactionTotals(rows: TransactionRow[]) {
  return { count: rows.length, sum: sumMoney(rows.map((row) => row.sum)) };
}
