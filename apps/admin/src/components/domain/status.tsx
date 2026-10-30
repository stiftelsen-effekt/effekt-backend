import type { StatusDefinition, StatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";

const dotTone: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-faint-foreground",
  accent: "bg-accent",
};

const textTone: Record<StatusTone, string> = {
  success: "text-foreground",
  warning: "text-foreground",
  danger: "text-danger font-semibold",
  neutral: "text-muted-foreground",
  accent: "text-foreground",
};

/**
 * A lifecycle state: dot + label from a status catalog in lib/status.ts.
 * Deliberately quiet (no filled pill) so a column of 1 000 "Active" rows stays calm and the
 * failed ones stand out.
 *
 *   <Status catalog={agreementStatus} value={row.status} />
 */
export function Status<C extends Record<string, StatusDefinition>>({
  catalog,
  value,
  className,
}: {
  catalog: C;
  value: keyof C & string;
  className?: string;
}) {
  const definition: StatusDefinition = catalog[value] ?? {
    label: value,
    tone: "neutral",
    description: "",
  };
  return (
    <span
      data-slot="status"
      data-tone={definition.tone}
      title={definition.description || undefined}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm whitespace-nowrap",
        textTone[definition.tone],
        className,
      )}
    >
      <span
        className={cn("size-1.5 shrink-0 rounded-full", dotTone[definition.tone])}
        aria-hidden
      />
      {definition.label}
    </span>
  );
}
