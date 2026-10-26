import { createRouter, parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import type { AuthState } from "@/auth";
import { ErrorState } from "@/components/domain/error-state";
import { routeTree } from "./routeTree.gen";

export type RouterContext = { auth: AuthState };

export const router = createRouter({
  routeTree,
  context: { auth: undefined as unknown as AuthState },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
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

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
