/**
 * Small adapters between the money pages and the tRPC procedures they call.
 */
import type { RouterOutputs } from "@/lib/trpc";

export type PaymentMethod = RouterOutputs["config"]["paymentMethods"]["list"][number];
export type DataOwner = RouterOutputs["meta"]["owners"][number];

/**
 * The payment methods Norway uses, masked as in the old admin: the table also holds the
 * Swedish AutoGiro and Swish (ids 11–12), which are hidden.
 */
const hiddenPaymentMethodIds: ReadonlySet<number> = new Set([11, 12]);

export function visiblePaymentMethods<T extends { id: number }>(methods: readonly T[]): T[] {
  return methods.filter((method) => !hiddenPaymentMethodIds.has(method.id));
}

/** The owner new records get unless someone picks another. */
export const defaultOwner = (owners: readonly DataOwner[] | undefined) =>
  owners?.find((owner) => owner.default) ?? owners?.[0];

/** Starts a browser download of a CSV export (`{ filename, csv }` from the export procedures). */
export function downloadCsv({ filename, csv }: { filename: string; csv: string }) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
