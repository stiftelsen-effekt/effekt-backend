import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createApiClient, createQueryClient, TRPCProvider } from "@/lib/trpc";
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
  useEffect(() => {
    void router.invalidate();
  }, [auth.isAuthenticated]);

  if (auth.isLoading) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-60 bg-sidebar lg:block" />
        <div className="flex-1 space-y-4 p-10">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>
    );
  }
  return <RouterProvider router={router} context={{ auth }} />;
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
