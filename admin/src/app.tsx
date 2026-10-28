import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/auth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createApiClient, createQueryClient, TRPCProvider, useTRPC } from "@/lib/trpc";
import { router } from "./router";

function ApiProvider({ children }: { children: ReactNode }) {
  const { getAccessToken, isAuthenticated } = useAuth();
  const getAccessTokenRef = useLatest(getAccessToken);
  const [queryClient] = useState(createQueryClient);
  const [trpcClient] = useState(() =>
    createApiClient(() => getAccessTokenRef.current().catch(() => null)),
  );

  useEffect(() => {
    if (!isAuthenticated) queryClient.clear();
  }, [isAuthenticated, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

function useLatest<T>(value: T) {
  const [ref] = useState(() => ({ current: value }));
  ref.current = value;
  return ref;
}

function RoutedApp() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  useEffect(() => {
    void router.invalidate();
  }, [auth.isAuthenticated]);

  if (auth.isLoading) {
    // The app's frame, empty: the session is usually back before anything could be drawn.
    return (
      <div className="flex min-h-dvh bg-canvas" aria-busy>
        <div className="hidden w-60 lg:block" />
        <div className="flex-1 lg:py-2 lg:pr-2">
          <div className="h-full min-h-dvh bg-background lg:min-h-0 lg:rounded-lg lg:border lg:border-border" />
        </div>
      </div>
    );
  }
  return <RouterProvider router={router} context={{ auth, queryClient, trpc }} />;
}

export function App() {
  return (
    <AuthProvider onRedirect={(path) => void router.history.replace(path)}>
      <ApiProvider>
        <TooltipProvider>
          <RoutedApp />
          <Toaster />
        </TooltipProvider>
      </ApiProvider>
    </AuthProvider>
  );
}
