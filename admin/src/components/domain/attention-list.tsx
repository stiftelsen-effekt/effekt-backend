import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronRightIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
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
export function AttentionList({ items, empty }: { items: AttentionItem[]; empty?: ReactNode }) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.id}>
            <Link
              to={item.href as LinkProps["to"]}
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
