import { createRouter, parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { AuthState } from "@/auth";
import { ErrorState } from "@/components/domain/error-state";
import { markFirstLoadDone } from "@/lib/route-data";
import type { useTRPC } from "@/lib/trpc";
import { routeTree } from "./routeTree.gen";

/** Loaders get the query client and the tRPC options proxy to warm the page's queries. */
export type RouterContext = {
  auth: AuthState;
  queryClient: QueryClient;
  trpc: ReturnType<typeof useTRPC>;
};

export const router = createRouter({
  routeTree,
  context: undefined as unknown as RouterContext, // provided by <RouterProvider> in app.tsx
  // Hovering or focusing a link runs the target's loader, which warms its queries.
  defaultPreload: "intent",
  // Freshness is TanStack Query's job (staleTime in createQueryClient); always ask the loader.
  defaultPreloadStaleTime: 0,
  // When a loader does run again for a match already shown, wait for it rather than reload
  // behind the page; loaders return at once for search-param changes, so those stay instant.
  defaultStaleReloadMode: "blocking",
  // No pending components: a navigation keeps the previous page (with the top progress bar)
  // while the next page's loader waits for its record (route-data.ts › loadPage).
  scrollRestoration: true,
  // Readable URLs: plain strings stay unquoted (?amount=100..500&method=4,8). Lists decode
  // their params with codecs (components/filters/list-state.ts), so "4" vs 4 doesn't matter.
  parseSearch: parseSearchWith((value) => {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }),
  stringifySearch: stringifySearchWith((value) =>
    typeof value === "string" ? value : JSON.stringify(value),
  ),
  defaultErrorComponent: ({ error, reset }) => (
    <ErrorState error={error} onRetry={reset} className="m-8" />
  ),
});

router.subscribe("onResolved", markFirstLoadDone);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
