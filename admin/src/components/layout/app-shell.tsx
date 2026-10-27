import { Link, useNavigate, useRouterState, type LinkProps } from "@tanstack/react-router";
import {
  ChevronsUpDownIcon,
  KeyboardIcon,
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  PaletteIcon,
  Rows3Icon,
  SearchIcon,
  SunIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { ProgressBar, useAnyUpdating } from "@/components/ui/pending";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useHotkey } from "@/hooks/use-hotkey";
import { org } from "@/lib/org";
import { usePreferences, type Density, type ThemePreference } from "@/lib/preferences";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { CommandPalette, type PaletteCommand } from "./command-palette";
import { navGroups, settingsItem, type NavGroup, type NavItem } from "./nav";
import { ShortcutsDialog } from "./shortcuts-dialog";

const designItem: NavItem = { to: "/design", label: "Design system", icon: PaletteIcon };

const itemClasses = [
  "group/nav flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-sm text-muted-foreground",
  "transition-colors duration-(--duration-fast) focus-ring-inset",
  "hover:bg-hover hover:text-foreground",
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-faint-foreground",
];

const activeClasses = [
  "data-[status=active]:bg-surface data-[status=active]:font-semibold data-[status=active]:text-foreground",
  "data-[status=active]:shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.04)]",
  "data-[status=active]:[&_svg]:text-accent",
];

function NavLink({
  item,
  count,
  onNavigate,
}: {
  item: NavItem;
  count?: number;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      // Nav targets are plain paths until every page exists as a typed route.
      to={item.to as LinkProps["to"]}
      activeOptions={{ exact: item.exact ?? false }}
      onClick={onNavigate}
      className={cn(itemClasses, activeClasses)}
    >
      <Icon strokeWidth={1.75} />
      <span className="flex-1 truncate">{item.label}</span>
      {count ? (
        <span className="num rounded-full bg-warning-subtle px-1.5 text-xs leading-5 font-semibold text-warning">
          {count}
          <span className="sr-only"> open</span>
        </span>
      ) : null}
    </Link>
  );
}

function UserMenu() {
  const auth = useAuth();
  const prefs = usePreferences();
  const name = auth.user?.name ?? "Signed out";
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(itemClasses, "h-10 w-full text-foreground data-[state=open]:bg-pressed")}
      >
        <span className="grid size-6 shrink-0 place-content-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initials || "?"}
        </span>
        <span className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate font-semibold">{name}</span>
          {auth.user?.email && (
            <span className="truncate text-xs text-muted-foreground">{auth.user.email}</span>
          )}
        </span>
        <ChevronsUpDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel>{strings.preferences.theme}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={prefs.theme}
          onValueChange={(value) => prefs.setTheme(value as ThemePreference)}
        >
          <DropdownMenuRadioItem value="light">{strings.preferences.light}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{strings.preferences.dark}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">{strings.preferences.system}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{strings.preferences.density}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={prefs.density}
          onValueChange={(value) => prefs.setDensity(value as Density)}
        >
          <DropdownMenuRadioItem value="comfortable">
            {strings.preferences.comfortable}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">
            {strings.preferences.compact}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {auth.isAuthenticated ? (
          <DropdownMenuItem onSelect={auth.logout}>
            <LogOutIcon />
            Log out
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link to="/login">
              <LogInIcon />
              Sign in
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar({
  groups,
  showDesign,
  reviewCount,
  onSearch,
  onNavigate,
}: {
  groups: NavGroup[];
  showDesign: boolean;
  reviewCount?: number;
  onSearch: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 bg-canvas px-3 pt-4 pb-3">
      <Link
        to="/"
        onClick={onNavigate}
        className="mx-2.5 block w-28 rounded-xs focus-ring"
        aria-label={`${org.name} admin home`}
      >
        <img
          src={org.logo}
          alt=""
          width={org.logoSize.width}
          height={org.logoSize.height}
          className="h-auto w-full invert dark:invert-0"
        />
      </Link>

      <button
        type="button"
        onClick={onSearch}
        className={cn(
          "flex h-8 items-center gap-2 rounded-sm border border-border-strong bg-surface px-2.5 text-sm text-muted-foreground",
          "transition-colors hover:border-input hover:text-foreground focus-ring",
        )}
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left">Search</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav aria-label="Main" className="-mx-1 flex-1 overflow-y-auto px-1">
        {groups.map((group, index) => (
          <div key={group.label ?? index} className={cn(index > 0 && "mt-4")}>
            {group.label && (
              <h2 className="mb-1 px-2.5 text-xs font-semibold text-faint-foreground">
                {group.label}
              </h2>
            )}
            <ul className="grid gap-px">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    item={item}
                    onNavigate={onNavigate}
                    count={item.badge === "reviewQueue" ? reviewCount : undefined}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="grid gap-px">
        <NavLink item={settingsItem} onNavigate={onNavigate} />
        {showDesign && <NavLink item={designItem} onNavigate={onNavigate} />}
        <div className="mt-2 border-t border-border pt-2">
          <UserMenu />
        </div>
      </div>
    </div>
  );
}

/**
 * The one "updating" line, along the top of the content sheet: a route change waiting for
 * its data, or a page whose content is being replaced (usePageQuery). After 300 ms only.
 */
function TopProgress() {
  const navigating = useRouterState({ select: (state) => state.isLoading });
  const updating = useAnyUpdating();
  return <ProgressBar active={navigating || updating} className="absolute inset-x-0 top-0 z-40" />;
}

/**
 * The frame around every page: quiet paper-coloured sidebar, white content sheet, ⌘K
 * palette and global shortcuts. Pages render templates (ListPage, DetailPage, …) inside.
 */
export function AppShell({
  children,
  reviewCount,
}: {
  children: ReactNode;
  /** Open review-queue items, shown as the nav badge; hidden while unknown */
  reviewCount?: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const navigate = useNavigate();
  const prefs = usePreferences();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const showDesign = import.meta.env.DEV || pathname.startsWith("/design");
  const groups = navGroups;

  useHotkey("mod+k", () => setPaletteOpen((open) => !open));
  useHotkey("?", () => setShortcutsOpen(true));

  const commands = useMemo<PaletteCommand[]>(() => {
    const items = [...groups.flatMap((group) => group.items), settingsItem];
    if (showDesign) items.push(designItem);
    return [
      ...items.map<PaletteCommand>((item) => ({
        id: `nav:${item.to}`,
        label: item.label,
        group: "Go to",
        icon: item.icon,
        keywords: item.keywords,
        run: () => void navigate({ to: item.to as LinkProps["to"] }),
      })),
      {
        id: "action:shortcuts",
        label: "Keyboard shortcuts",
        group: "Actions",
        icon: KeyboardIcon,
        shortcut: "?",
        run: () => setShortcutsOpen(true),
      },
      {
        id: "pref:theme",
        label: prefs.resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        group: "Preferences",
        icon: prefs.resolvedTheme === "dark" ? SunIcon : MoonIcon,
        keywords: ["dark mode", "light mode", "theme"],
        run: prefs.toggleTheme,
      },
      {
        id: "pref:density",
        label: prefs.density === "compact" ? "Use comfortable density" : "Use compact density",
        group: "Preferences",
        icon: Rows3Icon,
        keywords: ["density", "compact", "rows"],
        run: prefs.toggleDensity,
      },
    ];
  }, [groups, showDesign, navigate, prefs]);

  return (
    <div className="flex min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only z-50 rounded-sm bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 lg:block">
        <Sidebar
          groups={groups}
          showDesign={showDesign}
          reviewCount={reviewCount}
          onSearch={() => setPaletteOpen(true)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:h-dvh lg:py-2 lg:pr-2">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-canvas px-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="grid size-9 place-content-center rounded-sm hover:bg-hover focus-ring"
          >
            <MenuIcon className="size-5" />
            <span className="sr-only">Open menu</span>
          </button>
          <img
            src={org.logo}
            alt={org.name}
            width={org.logoSize.width}
            height={org.logoSize.height}
            className="h-4 w-auto invert dark:invert-0"
          />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto grid size-9 place-content-center rounded-sm hover:bg-hover focus-ring"
          >
            <SearchIcon className="size-5" />
            <span className="sr-only">Search</span>
          </button>
        </header>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-64 bg-canvas p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Main navigation</SheetDescription>
            <Sidebar
              groups={groups}
              showDesign={showDesign}
              reviewCount={reviewCount}
              onSearch={() => {
                setMenuOpen(false);
                setPaletteOpen(true);
              }}
              onNavigate={() => setMenuOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <main
          id="main"
          className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-background lg:overflow-hidden lg:rounded-lg lg:border lg:border-border"
        >
          <TopProgress />
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
