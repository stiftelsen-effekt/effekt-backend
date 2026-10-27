/**
 * Small adapters between the money pages and the tRPC procedures they call.
 */
import { config } from "@/lib/config";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";

/**
 * The API types `locale` as its RequestLocale enum; the runtime values are the same strings
 * as the build locale ("NO" / "SV").
 */
export const apiLocale = config.locale as RouterInputs["donations"]["list"]["locale"];

export type PaymentMethod = RouterOutputs["config"]["paymentMethods"]["list"][number];
export type DataOwner = RouterOutputs["meta"]["owners"][number];

/**
 * Payment methods each country uses, masked as in the old admin: Norway hides AutoGiro and
 * Swish (ids 11–12), Sweden hides the Norwegian methods (ids 3–10: PayPal, Vipps,
 * AvtaleGiro, Facebook …).
 */
const hiddenPaymentMethods: Record<typeof config.locale, (id: number) => boolean> = {
  NO: (id) => id === 11 || id === 12,
  SV: (id) => id >= 3 && id <= 10,
};

export function paymentMethodsFor<T extends { id: number }>(
  methods: readonly T[],
  locale: typeof config.locale = config.locale,
): T[] {
  return methods.filter((method) => !hiddenPaymentMethods[locale](method.id));
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
