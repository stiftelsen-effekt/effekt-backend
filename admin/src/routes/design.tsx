import { createFileRoute, Link, Outlet, type LinkProps } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { fakeSearchProviders } from "@/design-system/fake-search";
import { useOpenReviewCount } from "@/features/review-queue/store";
import { SearchProvidersProvider } from "@/features/search/providers";
import { cn } from "@/lib/utils";

/**
 * The living style guide. Works without the API or auth: every demo uses fake data typed
 * with RouterOutputs. Visual regression and axe tests run against these routes.
 */
export const Route = createFileRoute("/design")({
  component: DesignLayout,
});

export const designPages: { to: string; label: string; group: "Reference" | "Templates" }[] = [
  { to: "/design", label: "Foundations", group: "Reference" },
  { to: "/design/components", label: "Components", group: "Reference" },
  { to: "/design/patterns", label: "Patterns", group: "Reference" },
  { to: "/design/home", label: "Home", group: "Templates" },
  { to: "/design/list", label: "List", group: "Templates" },
  { to: "/design/agreements", label: "Agreements", group: "Templates" },
  { to: "/design/detail", label: "Detail", group: "Templates" },
  { to: "/design/flow", label: "Flow", group: "Templates" },
  { to: "/design/settings", label: "Settings", group: "Templates" },
];

function DesignLayout() {
  const reviewCount = useOpenReviewCount();
  return (
    <SearchProvidersProvider value={fakeSearchProviders}>
      <AppShell reviewCount={reviewCount}>
        <nav
          aria-label="Design system"
          className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-4 py-1.5 text-sm sm:px-6"
        >
          {(["Reference", "Templates"] as const).map((group) => (
            <div key={group} className="flex items-center gap-1">
              <span
                className={cn(
                  "pr-1 text-xs text-faint-foreground",
                  group === "Templates" && "ml-3 border-l border-border pl-4",
                )}
              >
                {group}
              </span>
              {designPages
                .filter((page) => page.group === group)
                .map((page) => (
                  <Link
                    key={page.to}
                    to={page.to as LinkProps["to"]}
                    activeOptions={{ exact: true, includeSearch: false }}
                    className="rounded-sm px-2 py-1 whitespace-nowrap text-muted-foreground hover:bg-hover hover:text-foreground focus-ring data-[status=active]:bg-pressed data-[status=active]:font-semibold data-[status=active]:text-foreground"
                  >
                    {page.label}
                  </Link>
                ))}
            </div>
          ))}
        </nav>
        <Outlet />
      </AppShell>
    </SearchProvidersProvider>
  );
}
