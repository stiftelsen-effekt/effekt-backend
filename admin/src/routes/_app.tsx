import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { useApiSearchProviders } from "@/features/search/api-providers";
import { SearchProvidersProvider } from "@/features/search/providers";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const providers = useApiSearchProviders();
  return (
    <SearchProvidersProvider value={providers}>
      <AppShell>
        <Outlet />
      </AppShell>
    </SearchProvidersProvider>
  );
}
