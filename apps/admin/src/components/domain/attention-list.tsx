import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronRightIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SkeletonText } from "@/components/ui/skeleton";
import type { StatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";

export type AttentionItem = {
  id: string;
  icon: LucideIcon;
  tone: StatusTone;
  title: ReactNode;
  description?: ReactNode;
  /** The number that makes this urgent, e.g. 12 open review items. */
  count?: number;
  href: string;
  /** Search params for `href`, e.g. the filters that show exactly the items counted. */
  search?: Record<string, string>;
  /** Verb for the link: "Review", "Check", "Retry". */
  action: string;
};

const toneClasses: Record<StatusTone, string> = {
  success: "text-success bg-success-subtle",
  warning: "text-warning bg-warning-subtle",
  danger: "text-danger bg-danger-subtle",
  neutral: "text-muted-foreground bg-muted",
  accent: "text-accent bg-accent-subtle",
};

/**
 * "What needs me today", for Home. Each item is a job with a count and a direct link to
 * where it gets done. When nothing needs attention, say so (empty is good news).
 */
export function AttentionList({
  items,
  empty,
  pending = false,
}: {
  items: AttentionItem[];
  empty?: ReactNode;
  /**
   * The checks behind the items are still running: placeholder rows the height of an item
   * (and of `AttentionClear`). A number reserves that many rows: pass how many there were
   * last time, so the usual outcome moves nothing below.
   */
  pending?: boolean | number;
}) {
  if (pending) {
    const rows = Array.from({ length: pending === true ? 1 : Math.max(1, pending) }, (_, i) => i);
    return (
      <ul
        aria-busy
        className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface"
      >
        {rows.map((row) => (
          <li key={row} className="flex items-center gap-3 px-4 py-3">
            <span className="size-8 shrink-0 rounded-md bg-muted" />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="font-semibold">
                <SkeletonText>Transactions to review 00</SkeletonText>
              </span>
              <span className="text-sm">
                <SkeletonText>
                  From imported payment reports that could not be matched.
                </SkeletonText>
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.id}>
            <Link
              to={item.href as LinkProps["to"]}
              search={item.search as LinkProps["search"]}
              className="group flex items-center gap-3 px-4 py-3 hover:bg-hover focus-ring-inset"
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-content-center rounded-md",
                  toneClasses[item.tone],
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex items-center gap-2 font-semibold">
                  {item.title}
                  {item.count !== undefined && (
                    <span className="num text-muted-foreground">{item.count}</span>
                  )}
                </span>
                {item.description && (
                  <span className="text-sm text-muted-foreground">{item.description}</span>
                )}
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold text-accent">
                {item.action}
                <ChevronRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** "Nothing needs you": an item-shaped row, so it takes the place of the list without a jump. */
export function AttentionClear({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3">
      <span className="grid size-8 shrink-0 place-content-center rounded-md bg-success-subtle text-success">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="font-semibold">{title}</span>
        {description && <span className="text-sm text-muted-foreground">{description}</span>}
      </span>
    </div>
  );
}
