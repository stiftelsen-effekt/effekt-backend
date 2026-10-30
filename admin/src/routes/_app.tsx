import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { PanelHost, validatePanelSearch } from "@/components/panels";
import { recordPanels } from "@/features/record-panels";
import { useOpenReviewItems } from "@/features/home/review-queue-counts";
import { useApiSearchProviders } from "@/features/search/api-providers";
import { SearchProvidersProvider } from "@/features/search/providers";

export const Route = createFileRoute("/_app")({
  // The record panels open over any page (components/panels): `?panel=donor:12,donation:345`.
  validateSearch: (raw: Record<string, unknown>) => validatePanelSearch(raw, recordPanels),
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
        <PanelHost kinds={recordPanels}>
          <Outlet />
        </PanelHost>
      </AppShell>
    </SearchProvidersProvider>
  );
}
