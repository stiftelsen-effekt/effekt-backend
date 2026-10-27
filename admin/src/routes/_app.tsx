import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { useOpenReviewItems } from "@/features/home/review-queue-counts";
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
  const reviewCount = useOpenReviewItems();
  return (
    <SearchProvidersProvider value={providers}>
      <AppShell reviewCount={reviewCount}>
        <Outlet />
      </AppShell>
    </SearchProvidersProvider>
  );
}
