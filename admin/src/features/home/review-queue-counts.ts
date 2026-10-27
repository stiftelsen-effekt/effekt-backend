import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";

/**
 * The persistent review queue's counts come from `reports.reviewQueue.counts`, which is
 * being added to the API separately. Until it is in the router types, Home hides the
 * review card.
 *
 * Feature check: `reviewQueueCountsAvailable` must equal whether the procedure is in the
 * router types. When the procedure lands, `npm run typecheck` fails on the line below;
 * change `false` to `true` there and the card appears (and `openReviewCount` may need its
 * shape adjusted).
 */
type ReviewQueueCounts = RouterOutputs["reports"] extends {
  reviewQueue: { counts: infer Counts };
}
  ? Counts
  : never;
type CountsInTypes = [ReviewQueueCounts] extends [never] ? false : true;

export const reviewQueueCountsAvailable = false satisfies CountsInTypes;

/** Open items, from whatever shape the counts take: a number, `{ open }` or `{ total }`. */
export function openReviewCount(counts: unknown): number | undefined {
  if (typeof counts === "number") return counts;
  if (counts && typeof counts === "object") {
    const { open, total } = counts as { open?: unknown; total?: unknown };
    if (typeof open === "number") return open;
    if (typeof total === "number") return total;
  }
  return undefined;
}

type CountsProcedure = {
  queryOptions: () => UseQueryOptions<unknown, unknown, unknown, readonly unknown[]>;
};

/** Open review items, or undefined while unavailable (no procedure, loading or failed). */
export function useOpenReviewItems(): number | undefined {
  const trpc = useTRPC();
  // Typed loosely so this compiles before the procedure exists; disabled until it does.
  const counts = (trpc.reports as unknown as { reviewQueue: { counts: CountsProcedure } })
    .reviewQueue.counts;
  const query = useQuery({
    ...counts.queryOptions(),
    enabled: reviewQueueCountsAvailable,
    retry: false,
  });
  return query.isSuccess ? openReviewCount(query.data) : undefined;
}
