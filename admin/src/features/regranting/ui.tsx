/**
 * Small pieces shared by the regranting pages: flags, inline issues, pickers for recipients,
 * projects and payees, and foreign amounts.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { formatNumber } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { BalanceFlag } from "./balances";
import type { Issue } from "./model";

export function Flags({ flags, className }: { flags: BalanceFlag[]; className?: string }) {
  if (flags.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {flags.map((flag) => (
        <Badge key={flag.id} tone={flag.tone} title={flag.title}>
          {flag.label}
        </Badge>
      ))}
    </span>
  );
}

/** Validation issues next to the row they're about. Errors block approval; warnings don't. */
export function InlineIssues({ issues, className }: { issues: Issue[]; className?: string }) {
  if (issues.length === 0) return null;
  return (
    <ul className={cn("grid gap-0.5 text-xs", className)} aria-label="Issues">
      {issues.map((issue, index) => {
        const Icon = issue.severity === "error" ? CircleAlertIcon : TriangleAlertIcon;
        return (
          <li
            key={`${issue.code}-${index}`}
            className={cn(
              "flex items-start gap-1",
              issue.severity === "error" ? "font-semibold text-danger" : "text-foreground",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-3 shrink-0",
                issue.severity === "error" ? "text-danger" : "text-warning",
              )}
              aria-hidden
            />
            <span>
              <span className="sr-only">
                {issue.severity === "error" ? "Error: " : "Warning: "}
              </span>
              {issue.message}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function RecipientLink({
  organizationId,
  children,
  className,
}: {
  organizationId: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      to="/regranting/recipients/$organizationId"
      params={{ organizationId: String(organizationId) }}
      className={cn("rounded-xs text-accent hover:underline focus-ring", className)}
    >
      {children}
    </Link>
  );
}

/** `underline` for links inside running text (they must not rely on colour alone). */
export function RoundLink({
  id,
  children,
  underline,
}: {
  id: number;
  children: React.ReactNode;
  underline?: boolean;
}) {
  return (
    <Link
      to="/regranting/rounds/$id"
      params={{ id: String(id) }}
      className={cn("rounded-xs text-accent hover:underline focus-ring", underline && "underline")}
    >
      {children}
    </Link>
  );
}

export function ProjectLink({ id, children }: { id: number; children: React.ReactNode }) {
  return (
    <Link
      to="/regranting/projects/$id"
      params={{ id: String(id) }}
      className="rounded-xs text-accent hover:underline focus-ring"
    >
      {children}
    </Link>
  );
}

/** An amount in a foreign currency (EUR, USD, BTC): up to 8 decimals, code after. Display only. */
export function ForeignAmount({ value, currency }: { value: string | null; currency: string }) {
  if (value == null) return <span className="text-faint-foreground">–</span>;
  const decimals = value.includes(".") ? value.split(".")[1]!.replace(/0+$/, "").length : 0;
  return (
    <span className="num whitespace-nowrap">
      {formatNumber(Number(value), { decimals: Math.max(decimals, currency === "BTC" ? 0 : 2) })}{" "}
      {currency}
    </span>
  );
}

export function useOrganizations() {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.config.organizations.listAll.queryOptions(),
    select: (orgs) =>
      [...orgs].sort(
        (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "nb"),
      ),
  });
}

export function OrganizationPicker({
  value,
  onValueChange,
  exclude,
  disabled,
}: {
  value: number | null;
  onValueChange: (id: number | null) => void;
  exclude?: ReadonlySet<number>;
  disabled?: boolean;
}) {
  const orgs = useOrganizations();
  return (
    <Combobox
      disabled={disabled}
      value={value === null ? null : String(value)}
      onValueChange={(next) => onValueChange(next === null ? null : Number(next))}
      placeholder={orgs.isPending ? "Loading recipients…" : "Choose a recipient"}
      searchPlaceholder="Search recipients"
      options={(orgs.data ?? [])
        .filter((o) => !exclude?.has(o.id))
        .map((o) => ({
          value: String(o.id),
          label: o.abbreviation ? `${o.name} (${o.abbreviation})` : o.name,
          hint: o.isActive ? undefined : "Inactive",
        }))}
    />
  );
}

/** A project of one recipient, or Unrestricted (null) when `allowUnrestricted`. */
export function ProjectPicker({
  organizationId,
  value,
  onValueChange,
  allowUnrestricted = true,
  disabled,
}: {
  organizationId: number | null;
  value: number | null;
  onValueChange: (id: number | null, name: string | null) => void;
  allowUnrestricted?: boolean;
  disabled?: boolean;
}) {
  const trpc = useTRPC();
  const projects = useQuery({
    ...trpc.regranting.projects.list.queryOptions({ organizationId: organizationId ?? 0 }),
    enabled: organizationId !== null,
  });
  const options = [
    ...(allowUnrestricted ? [{ value: "none", label: "Unrestricted" }] : []),
    ...(projects.data ?? []).map((p) => ({
      value: String(p.id),
      label: p.name,
      hint: p.status === "active" ? undefined : p.status,
    })),
  ];
  return (
    <Combobox
      disabled={disabled || organizationId === null}
      value={value === null ? (allowUnrestricted ? "none" : null) : String(value)}
      onValueChange={(next) => {
        if (next === null || next === "none") return onValueChange(null, null);
        const project = projects.data?.find((p) => String(p.id) === next);
        onValueChange(Number(next), project?.name ?? null);
      }}
      placeholder={organizationId === null ? "Choose a recipient first" : "Choose a project"}
      searchPlaceholder="Search projects"
      emptyText="No projects for this recipient"
      options={options}
    />
  );
}

export function PayeePicker({
  value,
  onValueChange,
  disabled,
}: {
  value: number | null;
  onValueChange: (id: number | null) => void;
  disabled?: boolean;
}) {
  const trpc = useTRPC();
  const payees = useQuery(trpc.regranting.payees.list.queryOptions());
  return (
    <Combobox
      disabled={disabled}
      value={value === null ? null : String(value)}
      onValueChange={(next) => onValueChange(next === null ? null : Number(next))}
      placeholder="Choose a payee"
      searchPlaceholder="Search payees"
      emptyText="No payees yet"
      options={(payees.data ?? []).map((p) => ({
        value: String(p.id),
        label: `${p.name} · ${p.currency}`,
        hint: p.isActive ? undefined : "Inactive",
      }))}
    />
  );
}
