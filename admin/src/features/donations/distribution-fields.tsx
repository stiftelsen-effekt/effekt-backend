import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Callout } from "@/components/domain/callout";
import { DistributionEditor, DistributionSummary } from "@/components/domain/distribution-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  draftFromApi,
  type CauseAreaConfig,
  type DistributionDraft,
} from "@/features/distribution/model";
import { useCauseAreaConfig } from "@/features/distribution/queries";
import { errorCode, useTRPC } from "@/lib/trpc";
import { apiLocale } from "./api";
import type { DonorSearch } from "@/features/donors/donor-picker";
import { DonorPicker } from "./donor-picker";

const NO_TAX_UNIT = "none";

/** The donor's tax units (not archived), for a distribution's optional tax unit. */
export function TaxUnitSelect({
  donorId,
  value,
  onValueChange,
}: {
  donorId: number | null;
  /** "" = no tax unit */
  value: string;
  onValueChange: (value: string) => void;
}) {
  const trpc = useTRPC();
  const taxUnits = useQuery({
    ...trpc.donors.taxUnits.list.queryOptions({ donorId: donorId ?? 0, locale: apiLocale }),
    enabled: donorId != null,
  });
  const options = (taxUnits.data ?? []).filter((unit) => !unit.archived);
  return (
    <Select
      value={value || NO_TAX_UNIT}
      onValueChange={(next) => onValueChange(next === NO_TAX_UNIT ? "" : next)}
      disabled={donorId == null}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TAX_UNIT}>No tax unit</SelectItem>
        {options.map((unit) => (
          <SelectItem key={unit.id} value={String(unit.id)}>
            {unit.name}
            {unit.ssn ? ` · ${unit.ssn.replace(/^(\d{6})\d+/, "$1 •••••")}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Donor, tax unit and split for a new distribution (creating a KID, or registering a
 * donation without one). Uses the active cause areas and their standard split shares.
 */
export function NewDistributionFields({
  donorId,
  onDonorChange,
  taxUnitId,
  onTaxUnitChange,
  distribution,
  onDistributionChange,
  config,
  errors,
  donorSearch,
}: {
  donorId: number | null;
  onDonorChange: (donorId: number | null) => void;
  taxUnitId: string;
  onTaxUnitChange: (taxUnitId: string) => void;
  distribution: DistributionDraft;
  onDistributionChange: (draft: DistributionDraft) => void;
  config: CauseAreaConfig[];
  errors: { donorId?: ReactNode; taxUnitId?: ReactNode; distribution?: ReactNode };
  /** Replace the API donor search (the /design demo uses fake data). */
  donorSearch?: DonorSearch;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Donor" error={errors.donorId} required>
          <DonorPicker
            value={donorId}
            search={donorSearch}
            onChange={(next) => {
              onDonorChange(next);
              onTaxUnitChange("");
            }}
          />
        </Field>
        <Field
          label="Tax unit"
          hint={donorId == null ? "Choose the donor first." : "For the tax deduction, if any."}
          error={errors.taxUnitId}
        >
          <TaxUnitSelect donorId={donorId} value={taxUnitId} onValueChange={onTaxUnitChange} />
        </Field>
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-semibold">Distribution</span>
        <DistributionEditor config={config} value={distribution} onChange={onDistributionChange} />
        {errors.distribution && (
          <p className="text-xs text-danger" role="alert">
            {errors.distribution}
          </p>
        )}
      </div>
    </div>
  );
}

/** What an entered KID points at: donor and split, or a warning that it doesn't exist. */
export function KidPreview({ kid }: { kid: string }) {
  const trpc = useTRPC();
  const valid = /^\d{5,32}$/.test(kid);
  const distribution = useQuery({
    ...trpc.donations.distributions.get.queryOptions({ kid }),
    enabled: valid,
  });
  const causeAreas = useCauseAreaConfig({ includeInactive: true });

  if (!valid) return null;
  if (distribution.isError) {
    return errorCode(distribution.error) === "NOT_FOUND" ? (
      <Callout tone="warning" title={`No distribution has KID ${kid}`}>
        Check the number, or register on a new distribution instead.
      </Callout>
    ) : (
      <Callout tone="danger" title="Couldn't look up the KID" />
    );
  }
  if (!distribution.data || !causeAreas.data) return <Skeleton className="h-20 w-full" />;
  const d = distribution.data;
  return (
    <div className="grid gap-3 rounded-md border border-border bg-surface p-4">
      <p className="text-sm">
        <span className="text-muted-foreground">KID {kid} belongs to </span>
        <Link
          to="/distributions/$kid"
          params={{ kid }}
          className="font-semibold text-accent hover:underline"
        >
          {d.donor?.name ?? d.donor?.email ?? `donor #${d.donorId}`}
        </Link>
        {d.taxUnit && <span className="text-muted-foreground"> · tax unit {d.taxUnit.name}</span>}
      </p>
      <DistributionSummary draft={draftFromApi(causeAreas.data, d)} config={causeAreas.data} />
    </div>
  );
}
