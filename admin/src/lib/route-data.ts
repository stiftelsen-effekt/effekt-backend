import type { FetchQueryOptions, QueryClient } from "@tanstack/react-query";

/*
 * Route loaders for pages reachable from lists. They start the page's queries before the
 * page renders (on link hover/focus too: `defaultPreload: "intent"`), and on navigation
 * hold the previous page, with the top progress bar, until the record is in, so the next
 * page appears finished instead of as skeletons. Pages still read their data with
 * useQuery; the loaders only warm the same cache entries.
 */

// Options for different procedures share only their key and fetcher.
type AnyFetchOptions = FetchQueryOptions<any, any, any, any>;

/**
 * How long a navigation keeps the previous page while the next one's record loads. After
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
 * - `preload` (hover/focus on a link or row): fetch the record only.
 * - `enter` (navigating here): fetch everything, wait for the record up to ROUTE_WAIT_MS.
 *   Not on the app's first load: there is no previous page to keep, so render at once.
 * - `stay` (search params changed on this page): fetch, never wait; the page keeps its
 *   previous data on its own (usePageQuery).
 *
 * Errors never reach the router: the page shows them in place with Try again.
 */
export async function loadPage(
  queryClient: QueryClient,
  cause: LoadCause,
  primary: AnyFetchOptions | null,
  rest: AnyFetchOptions[] = [],
) {
  if (cause === "preload") {
    if (primary) await queryClient.prefetchQuery(primary);
    return;
  }
  for (const options of rest) void queryClient.prefetchQuery(options);
  if (!primary) return;
  const record = queryClient.prefetchQuery(primary);
  if (cause !== "enter" || !firstLoadDone) return;
  await Promise.race([record, new Promise((resolve) => setTimeout(resolve, ROUTE_WAIT_MS))]);
}
