import { createRouter } from "@tanstack/react-router";
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
  defaultErrorComponent: ({ error, reset }) => (
    <ErrorState error={error} onRetry={reset} className="m-8" />
  ),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
