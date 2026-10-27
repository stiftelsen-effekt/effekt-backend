import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";

export type SettingsNavItem = { id: string; label: string; count?: number };

/**
 * Template for configuration: a section list on the left, the chosen section on the right.
 * Each section is a SettingsSection: what it controls and its consequences on the left,
 * the controls on the right. Settings changes affect donors directly (what the widget
 * shows, how standard split is calculated), so every section saves explicitly.
 */
export function SettingsPage({
  title = "Settings",
  description,
  nav,
  value,
  onValueChange,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  nav: SettingsNavItem[];
  value: string;
  onValueChange: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div data-page-scroll data-slot="settings-page" className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader title={title} description={description} />
      <div className="grid gap-6 px-4 pb-10 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-4 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto border-b border-border pb-2 lg:grid lg:border-b-0 lg:pb-0">
            {nav.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onValueChange(item.id)}
                  aria-current={item.id === value ? "page" : undefined}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left text-sm whitespace-nowrap text-muted-foreground",
                    "hover:bg-hover hover:text-foreground focus-ring",
                    "aria-[current=page]:bg-pressed aria-[current=page]:font-semibold aria-[current=page]:text-foreground",
                  )}
                >
                  <span className="flex-1">{item.label}</span>
                  {item.count !== undefined && (
                    <span className="num text-xs text-muted-foreground">{item.count}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid min-w-0 content-start gap-10">{children}</div>
      </div>
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      data-slot="settings-section"
      className="grid gap-4 border-b border-border pb-10 last:border-b-0 2xl:grid-cols-[18rem_minmax(0,1fr)] 2xl:gap-10"
    >
      <div className="grid content-start gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Scrolls the page back to the top when the shown section changes. */
export function useScrollTopOn(section: string) {
  useEffect(() => {
    document.querySelector("[data-slot=settings-page]")?.scrollTo({ top: 0 });
  }, [section]);
}
