import { Badge, type BadgeProps } from "@/components/ui/badge";

type Variant = NonNullable<BadgeProps["variant"]>;

const statusVariants: Record<string, Variant> = {
  ACTIVE: "success",
  COMPLETED: "success",
  SUCCESS: "success",
  CHARGED: "success",
  PROCESSED: "success",
  APPROVED: "success",
  PENDING: "warning",
  RESERVED: "warning",
  DRAFTED: "info",
  CREATED: "info",
  NEW: "info",
  STOPPED: "muted",
  EXPIRED: "muted",
  CANCELLED: "muted",
  INACTIVE: "muted",
  ARCHIVED: "muted",
  FAILED: "destructive",
  REJECTED: "destructive",
  REFUNDED: "destructive",
  ERROR: "destructive",
  DUE: "accent",
};

export function statusVariant(status: string): Variant {
  return statusVariants[status.toUpperCase()] ?? "neutral";
}

function humanize(status: string) {
  const lower = status.toLowerCase().replace(/_/g, " ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  return (
    <Badge variant={statusVariant(status)} dot className={className}>
      {label ?? humanize(status)}
    </Badge>
  );
}
