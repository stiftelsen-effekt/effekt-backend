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
  {
    prefetch = [],
  }: {
    /** Neighbouring inputs to fetch once this one is in; a function to decide from its data. */
    prefetch?: AnyFetchOptions[] | ((data: TData) => AnyFetchOptions[]);
  } = {},
) {
  const query = useQuery({ placeholderData: keepPreviousData, ...options });
  const queryClient = useQueryClient();
  useReportUpdating(query.isPlaceholderData && query.isFetching);

  const settled = query.isSuccess && !query.isPlaceholderData;
  const neighbours = !settled
    ? []
    : typeof prefetch === "function"
      ? prefetch(query.data as TData)
      : prefetch;
  // The key captures the neighbours; the array itself is rebuilt every render.
  const neighboursKey = JSON.stringify(neighbours.map((neighbour) => neighbour.queryKey));
  useEffect(() => {
    for (const neighbour of neighbours) void queryClient.prefetchQuery(neighbour);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- neighboursKey stands for neighbours, which is rebuilt every render
  }, [neighboursKey, queryClient]);

  return query;
}

/** The next page of a paged list, when there is one (`pages` as the list procedures return it). */
export function nextPage<T>(page: number, pages: number | undefined, options: (page: number) => T) {
  return pages !== undefined && page < pages ? [options(page + 1)] : [];
}
