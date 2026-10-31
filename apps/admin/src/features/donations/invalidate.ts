import type { QueryClient } from "@tanstack/react-query";
import type { useTRPC } from "@/lib/trpc";

/**
 * After donations change (edited, deleted, moved to another tax unit): every donation query, and
 * the donor pages' donation lists and sums. With `donorIds`, only those donors' pages; without,
 * every donor's (when it isn't known whose donations moved).
 */
export function invalidateDonationQueries(
  queryClient: QueryClient,
  trpc: ReturnType<typeof useTRPC>,
  donorIds?: readonly (number | null | undefined)[],
) {
  const donors = [...new Set(donorIds?.filter((id): id is number => typeof id === "number"))];
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: trpc.donations.pathKey() }),
    ...(donorIds === undefined
      ? [queryClient.invalidateQueries({ queryKey: trpc.donors.pathKey() })]
      : donors.flatMap((donorId) => {
          const input = { donorId };
          return [
            queryClient.invalidateQueries({ queryKey: trpc.donors.donations.queryKey(input) }),
            queryClient.invalidateQueries({
              queryKey: trpc.donors.donationsAggregated.queryKey(input),
            }),
            queryClient.invalidateQueries({
              queryKey: trpc.donors.distributionsAggregated.queryKey(input),
            }),
          ];
        })),
  ]);
}
