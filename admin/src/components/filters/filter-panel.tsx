import { DownloadIcon, ListFilterIcon, RotateCcwIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export type ActiveFilter = { id: string; label: ReactNode; onRemove: () => void };

const PERSISTENT_QUERY = "(min-width: 96rem)";

/**
 * Right-hand filter panel. Persistent at ≥1536px, a Sheet below that. Renders in
 * the dark scheme regardless of page theme, echoing the old admin's black drawer.
 */
export function FilterPanel({
  title = "Filters",
  open,
  onOpenChange,
  activeFilters = [],
  onReset,
  stats,
  actions,
  children,
}: {
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeFilters?: ActiveFilter[];
  onReset?: () => void;
  stats?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const persistent = useMediaQuery(PERSISTENT_QUERY);

  const body = (
    <div className="dark flex h-full min-h-0 flex-col bg-sidebar text-foreground">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 pt-6 pb-4">
        <h2 className="font-display text-xl">{title}</h2>
        {onReset && activeFilters.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onReset} className="mr-6 2xl:mr-0">
            <RotateCcwIcon />
            Reset
          </Button>
        )}
      </div>
      {activeFilters.length > 0 && (
        <div className="border-b border-border px-5 py-3">
          <ActiveFilterChips filters={activeFilters} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {(stats || actions) && (
        <div className="border-t border-border bg-sidebar">
          {stats && <div className="px-5 py-4">{stats}</div>}
          {actions && <div className="flex gap-2 px-5 pb-4">{actions}</div>}
        </div>
      )}
    </div>
  );

  if (persistent) {
    return (
      <aside
        aria-label={title}
        className="sticky top-0 h-dvh w-80 shrink-0 border-l border-sidebar-border"
      >
        {body}
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(22rem,calc(100%-3rem))] border-0 p-0 text-sidebar-foreground"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">Filter the list</SheetDescription>
        {body}
      </SheetContent>
    </Sheet>
  );
}

/** Opens the panel below 1536px; hidden when the panel is persistent. */
export function FilterPanelTrigger({
  count = 0,
  className,
  ...props
}: ButtonProps & { count?: number }) {
  return (
    <Button variant="outline" size="sm" className={cn("2xl:hidden", className)} {...props}>
      <ListFilterIcon />
      Filters
      {count > 0 && (
        <span className="num rounded-sm bg-primary px-1 text-2xs leading-4 text-primary-foreground">
          {count}
        </span>
      )}
    </Button>
  );
}

export function FilterGroup({
  label,
  htmlFor,
  onClear,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  onClear?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="group" className={cn("grid gap-2.5 border-b border-border px-5 py-4", className)}>
      <div className="flex h-5 items-center justify-between">
        <label htmlFor={htmlFor} className="label-caps text-muted-foreground">
          {label}
        </label>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-xs text-xs text-muted-foreground underline-offset-2 focus-ring hover:text-foreground hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function ActiveFilterChips({
  filters,
  className,
}: {
  filters: ActiveFilter[];
  className?: string;
}) {
  if (filters.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Active filters">
      {filters.map((filter) => (
        <li key={filter.id}>
          <span className="inline-flex h-6 items-center gap-1 rounded-sm border border-border-strong bg-background pr-0.5 pl-2 text-xs">
            {filter.label}
            <button
              type="button"
              onClick={filter.onRemove}
              aria-label="Remove filter"
              className="grid size-5 place-content-center rounded-xs text-muted-foreground focus-ring hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FilterStats({
  items,
}: {
  items: { label: ReactNode; value: ReactNode; emphasis?: boolean }[];
}) {
  return (
    <dl className="grid gap-1.5 text-sm">
      {items.map((item, index) => (
        <div key={index} className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className={cn("num text-right", item.emphasis && "text-md font-semibold")}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ExportButton({
  onExport,
  rowCount,
  disabled,
}: {
  onExport: () => void;
  rowCount?: number;
  disabled?: boolean;
}) {
  return (
    <Button variant="primary" className="w-full" onClick={onExport} disabled={disabled}>
      <DownloadIcon />
      Export {rowCount !== undefined && <span className="num">{formatNumber(rowCount)}</span>} rows
    </Button>
  );
}
