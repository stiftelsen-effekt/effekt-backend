/**
 * Small adapters between the money pages and the tRPC procedures they call.
 */
import { createPersistentStore } from "@/lib/persistent-store";
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

/**
 * The data owner last used to register a donation by hand, per browser: legacy bank donations
 * are often registered in a row for the same owner. Only a convenience; the form always shows
 * the owner and it can be changed per donation.
 */
const lastOwner = createPersistentStore<number | null>("last-data-owner", null);

/** The owner a registration form starts with: the last one used here, else the default. */
export const preferredOwner = (owners: readonly DataOwner[] | undefined) =>
  owners?.find((owner) => owner.id === lastOwner.get()) ?? defaultOwner(owners);

/** Remembers the owner of a donation that was just registered (see preferredOwner). */
export const rememberOwner = (ownerId: number) => lastOwner.set(ownerId);

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
