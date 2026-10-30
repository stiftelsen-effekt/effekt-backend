import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import type { PaymentMethod } from "./api";

/**
 * Some procedures send a payment method's short name ("AMF", "AutoGiro"), others its name
 * ("AMF direkte", "Autogiro"). Pages show the name, always.
 */
export function paymentMethodName(
  value: string | null | undefined,
  methods: readonly PaymentMethod[] | undefined,
) {
  if (!value) return value ?? "";
  const method = methods?.find((m) => m.abbriviation === value || m.name === value);
  return method?.name ?? value;
}

/** A payment method as sent by the API, shown by its full name. */
export function PaymentMethodName({ value }: { value: string | null | undefined }) {
  const trpc = useTRPC();
  const methods = useQuery({
    ...trpc.config.paymentMethods.list.queryOptions(),
    staleTime: 300_000,
  });
  return <>{paymentMethodName(value, methods.data)}</>;
}
