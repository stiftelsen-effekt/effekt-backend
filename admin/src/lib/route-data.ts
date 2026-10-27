import type { FetchQueryOptions, QueryClient } from "@tanstack/react-query";

/*
 * Route loaders for pages reachable from lists. They start the page's queries before the
 * page renders (on link hover/focus too: `defaultPreload: "intent"`), and on navigation
 * hold the previous page, with the top progress bar, until its data is in, so the next page
 * appears finished instead of as skeletons. Pages still read their data with
 * useQuery; the loaders only warm the same cache entries.
 */

// Options for different procedures share only their key and fetcher.
type AnyFetchOptions = FetchQueryOptions<any, any, any, any>;

/**
 * How long a navigation keeps the previous page while the next one's data loads. After
 * that the next page shows with its first-load placeholders, so a slow API never makes a
 * click look ignored.
 */
export const ROUTE_WAIT_MS = 1000;

let firstLoadDone = false;
/** Called by the router once the first page has rendered (router.tsx). */
export function markFirstLoadDone() {
  firstLoadDone = true;
}

export type LoadCause = "preload" | "enter" | "stay";

/**
 * Loader body for a page around one record.
 *
 *   loader: ({ context: { queryClient, trpc }, params, cause }) =>
 *     loadPage(queryClient, cause, trpc.donors.get.queryOptions({ donorId }), [
 *       trpc.donors.donations.queryOptions({ donorId }), …
 *     ]),
 *
 * `primary` is what the page can't be drawn without (one record, or a few for a dashboard);
 * `rest` is everything else it shows.
 *
 * - `enter` (navigating here) and `preload` (hover/focus on a link or row): fetch everything,
 *   resolve when it's in, or after ROUTE_WAIT_MS. The router reuses a preloaded match
 *   without running the loader again, so a preload must warm the whole page; a navigation
 *   that starts while its preload is running waits for it. Not on the app's first load:
 *   there is no previous page to keep, so render at once.
 * - `stay` (search params changed on this page): fetch, never wait; the page keeps its
 *   previous data on its own (usePageQuery).
 *
 * Errors never reach the router: the page shows them in place with Try again.
 */
/**
 * Fetch unless fresh (staleTime); resolve at once when anything is cached, so cached data,
 * even stale, never holds up a navigation (it refreshes in the background).
 */
function warm(queryClient: QueryClient, options: AnyFetchOptions): Promise<unknown> {
  const fetching = queryClient.prefetchQuery(options);
  return queryClient.getQueryData(options.queryKey) === undefined ? fetching : Promise.resolve();
}

export async function loadPage(
  queryClient: QueryClient,
  cause: LoadCause,
  primary: AnyFetchOptions | AnyFetchOptions[] | null,
  rest: AnyFetchOptions[] = [],
) {
  const records = primary === null ? [] : Array.isArray(primary) ? primary : [primary];
  const loaded = Promise.all(records.map((options) => warm(queryClient, options)));
  // The rest one task later, so they go in a batch of their own (httpBatchLink sends what was
  // asked for in the same task together): the record shouldn't wait for the slowest of them.
  const restLoaded = new Promise((resolve) =>
    setTimeout(
      () => void Promise.all(rest.map((options) => warm(queryClient, options))).then(resolve),
      0,
    ),
  );
  if (cause === "stay" || (cause === "enter" && !firstLoadDone)) return;
  // Wait for the whole page, so it arrives finished rather than as a record with placeholders
  // that blink away a moment later; never longer than ROUTE_WAIT_MS.
  await Promise.race([
    Promise.all([loaded, restLoaded]),
    new Promise((resolve) => setTimeout(resolve, ROUTE_WAIT_MS)),
  ]);
}
