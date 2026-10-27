import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type DefaultError,
  type FetchQueryOptions,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { useReportUpdating } from "@/components/ui/pending";

// Neighbour queries of any procedure: only their key and fetcher matter here.
type AnyFetchOptions = FetchQueryOptions<any, any, any, any>;

/**
 * `useQuery` for a query whose input follows the page's URL or local state (filters, sort,
 * page, date, period, selected row). Use it for every such query; plain `useQuery` is for
 * inputs that never change while the page is open (a record by its route id).
 *
 * - Keeps the previous data while the next input loads (`keepPreviousData`), so content stays
 *   in place instead of turning into skeletons. `isPlaceholderData` is true meanwhile: wrap
 *   the region in `<Updating active={query.isPlaceholderData}>` (DataTable takes
 *   `isFetching`).
 * - Reports the update to the app's top progress bar.
 * - `prefetch`: what the person is likely to ask for next (the next page, the adjacent days),
 *   fetched once the current data is in, so that step is instant.
 *
 *   const query = usePageQuery(trpc.donors.list.queryOptions(input(list.page)), {
 *     prefetch: hasNext ? [trpc.donors.list.queryOptions(input(list.page + 1))] : [],
 *   });
 */
export function usePageQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  { prefetch = [] }: { prefetch?: AnyFetchOptions[] } = {},
) {
  const query = useQuery({ placeholderData: keepPreviousData, ...options });
  const queryClient = useQueryClient();
  useReportUpdating(query.isPlaceholderData && query.isFetching);

  const settled = query.isSuccess && !query.isPlaceholderData;
  const prefetchKey = JSON.stringify(prefetch.map((neighbour) => neighbour.queryKey));
  useEffect(() => {
    if (!settled) return;
    for (const neighbour of prefetch) void queryClient.prefetchQuery(neighbour);
    // The key captures the neighbours; the array itself is rebuilt every render.
  }, [settled, prefetchKey, queryClient]);

  return query;
}
