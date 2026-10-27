import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

/**
 * Open items in the shared review queue (`reports.reviewQueue.counts`), for the nav badge and
 * Home. Undefined while loading or when the request failed, so the badge stays hidden rather
 * than showing a wrong number.
 */
export function useOpenReviewItems(): number | undefined {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.reports.reviewQueue.counts.queryOptions(),
    refetchInterval: 60_000,
  });
  return query.data?.open;
}
