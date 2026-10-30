import { useQuery } from "@tanstack/react-query";
import { useCauseAreaConfig } from "@/features/distribution/queries";
import { visiblePaymentMethods } from "@/features/donations/api";
import { useTRPC } from "@/lib/trpc";
import { param } from "@/components/filters/list-state";
import { queueSources } from "./model";

/** What the registration form needs: active cause areas, payment methods, data owners. */
export function useRegistrationReferenceData() {
  const trpc = useTRPC();
  const causeAreas = useCauseAreaConfig();
  const methods = useQuery({
    ...trpc.config.paymentMethods.list.queryOptions(),
    staleTime: 300_000,
  });
  const owners = useQuery({ ...trpc.meta.owners.queryOptions(), staleTime: 300_000 });
  const error = causeAreas.error ?? methods.error ?? owners.error;
  const data =
    causeAreas.data && methods.data && owners.data
      ? {
          config: causeAreas.data,
          paymentMethods: visiblePaymentMethods(methods.data),
          owners: owners.data,
        }
      : undefined;
  return {
    data,
    error,
    refetch: () => {
      void causeAreas.refetch();
      void methods.refetch();
      void owners.refetch();
    },
  };
}

/** `?source=ocr,vipps` (the list's source filter), carried into the workbench. */
export const sourceParam = param.list(queueSources);
