import { Link, useRouterState, type LinkProps } from "@tanstack/react-router";
import { LogInIcon, LogOutIcon, MenuIcon, MoonIcon, SunIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/auth";
import { useTheme } from "@/hooks/use-theme";
import { appLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { navGroups, type NavGroup, type NavItem } from "./nav";

const sidebarItemClasses = [
  "relative flex h-8 items-center justify-between gap-3 pr-6 pl-6 text-base text-sidebar-foreground/80",
  "transition-colors outline-none hover:bg-sidebar-hover hover:text-sidebar-foreground",
  "focus-visible:bg-sidebar-hover focus-visible:text-sidebar-foreground focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-sidebar-foreground",
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-sidebar-muted",
];

function SidebarLink({
  item,
  notch,
  onNavigate,
}: {
  item: NavItem;
  notch: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  // Nav targets are plain paths until every page exists as a typed route.
  const to = item.to as LinkProps["to"];
  return (
    <Link
      to={to}
      activeOptions={{ exact: item.exact ?? false }}
      onClick={onNavigate}
      className={cn(
        sidebarItemClasses,
        "data-[status=active]:font-semibold data-[status=active]:text-sidebar-foreground data-[status=active]:[&_svg]:text-sidebar-foreground",
        notch
          ? [
              "after:absolute after:top-1/2 after:right-0 after:h-4 after:w-2 after:-translate-y-1/2 after:bg-background",
              "after:opacity-0 after:[clip-path:polygon(100%_0,0_50%,100%_100%)]",
              "data-[status=active]:after:animate-notch-in data-[status=active]:after:opacity-100",
            ]
          : "data-[status=active]:bg-sidebar-hover",
      )}
    >
      <span className="truncate">{item.label}</span>
      <Icon strokeWidth={1.75} />
    </Link>
  );
}

function SidebarContent({
  groups,
  notch,
  onNavigate,
}: {
  groups: NavGroup[];
  notch: boolean;
  onNavigate?: () => void;
}) {
  const auth = useAuth();
  const { resolved, toggle } = useTheme();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link
        to="/"
        onClick={onNavigate}
        className="mx-6 mt-8 mb-8 block w-36 rounded-xs outline-none focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-sidebar-foreground"
      >
        <img src={appLocale.logo} alt={appLocale.orgName} className="w-full" />
      </Link>

      <nav aria-label="Main" className="flex-1 overflow-y-auto pb-6">
        {groups.map((group, index) => (
          <div key={group.label} className={cn(index > 0 && "mt-5")}>
            <h2 className="mb-1 px-6 label-caps text-sidebar-muted">{group.label}</h2>
            <ul>
              {group.items.map((item) => (
                <li key={item.to}>
                  <SidebarLink item={item} notch={notch} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border py-3">
        {auth.user && (
          <p className="truncate px-6 pb-2 text-xs text-sidebar-muted" title={auth.user.email}>
            {auth.user.email ?? auth.user.name}
          </p>
        )}
        <button type="button" onClick={toggle} className={cn(sidebarItemClasses, "w-full")}>
          <span>{resolved === "dark" ? "Light mode" : "Dark mode"}</span>
          {resolved === "dark" ? <SunIcon strokeWidth={1.75} /> : <MoonIcon strokeWidth={1.75} />}
        </button>
        {auth.isAuthenticated ? (
          <button type="button" onClick={auth.logout} className={cn(sidebarItemClasses, "w-full")}>
            <span>Log out</span>
            <LogOutIcon strokeWidth={1.75} />
          </button>
        ) : (
          <Link to="/login" className={cn(sidebarItemClasses)}>
            <span>Sign in</span>
            <LogInIcon strokeWidth={1.75} />
          </Link>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const groups = navGroups(appLocale.locale, {
    includeDesign: import.meta.env.DEV || pathname.startsWith("/design"),
  });

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 lg:block">
        <SidebarContent groups={groups} notch />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 bg-sidebar px-3 text-sidebar-foreground lg:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger className="grid size-8 place-content-center rounded-sm outline-none hover:bg-sidebar-hover focus-visible:outline-1 focus-visible:outline-sidebar-foreground">
              <MenuIcon className="size-5" />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-64 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">Main navigation</SheetDescription>
              <SidebarContent groups={groups} notch={false} onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <img src={appLocale.logo} alt={appLocale.orgName} className="h-5 w-auto" />
        </header>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
