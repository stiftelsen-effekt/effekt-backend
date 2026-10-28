import { InboxIcon, type LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * What to show when a list or section has nothing in it. Say what is missing and, when
 * there is one, offer the next step as `action`.
 */
export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  className,
  size = "md",
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "sm" ? "gap-2 py-8" : "gap-3 py-16",
        className,
      )}
    >
      <Icon className="size-6 text-faint-foreground" strokeWidth={1.5} aria-hidden />
      <div className="grid max-w-sm gap-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
