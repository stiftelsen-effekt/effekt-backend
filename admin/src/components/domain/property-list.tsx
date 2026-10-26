import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Label/value facts about one record, e.g. a donor's contact details. Labels sit left of
 * values in a fixed column so the eye runs down one edge; on narrow screens they stack.
 *
 *   <PropertyList>
 *     <Property label="Email"><InlineEdit … /></Property>
 *     <Property label="KID"><CopyValue value={kid} label="KID" /></Property>
 *   </PropertyList>
 */
export function PropertyList({
  className,
  children,
  labelWidth = "9rem",
}: {
  className?: string;
  children: ReactNode;
  labelWidth?: string;
}) {
  return (
    <dl
      data-slot="property-list"
      style={{ "--property-label": labelWidth } as CSSProperties}
      className={cn("grid text-sm", className)}
    >
      {children}
    </dl>
  );
}

export function Property({
  label,
  children,
  hint,
  className,
}: {
  label: ReactNode;
  children?: ReactNode;
  /** Small muted text under the value, e.g. "since 2019". */
  hint?: ReactNode;
  className?: string;
}) {
  const empty = children === undefined || children === null || children === "";
  return (
    <div
      data-slot="property"
      className={cn(
        "grid gap-0.5 border-b border-border py-2 last:border-b-0 sm:grid-cols-[var(--property-label)_minmax(0,1fr)] sm:gap-4",
        className,
      )}
    >
      <dt className="pt-px text-muted-foreground">{label}</dt>
      <dd className="min-w-0">
        {empty ? <span className="text-faint-foreground">–</span> : children}
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </dd>
    </div>
  );
}
