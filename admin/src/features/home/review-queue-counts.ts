import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

/** The shared review queue's counts (`reports.reviewQueue.counts`), refreshed every minute. */
export function reviewQueueCountsOptions(trpc: ReturnType<typeof useTRPC>) {
  return { ...trpc.reports.reviewQueue.counts.queryOptions(), refetchInterval: 60_000 };
}

/**
 * Open items in the shared review queue, for the nav badge and Home. Undefined while loading
 * or when the request failed, so the badge stays hidden rather than showing a wrong number.
 */
export function useOpenReviewItems(): number | undefined {
  const trpc = useTRPC();
  const query = useQuery(reviewQueueCountsOptions(trpc));
  return query.data?.open;
}
