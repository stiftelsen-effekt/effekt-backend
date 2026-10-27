import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveIcon, PencilIcon, PlusIcon, ReceiptTextIcon } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Callout } from "@/components/domain/callout";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notify } from "@/lib/notify";
import { taxUnitStatus } from "@/lib/status";
import { strings } from "@/lib/strings";
import { useTRPC } from "@/lib/trpc";
import { ssnHint } from "./create-donor-dialog";
import { ssnMessage, toFormErrors, type FormErrors } from "./form-errors";
import { apiLocale, isArchived, maskSsn, type TaxUnit } from "./model";

/** The donor's tax units: deductions per year, create, edit, archive. */
export function TaxUnitsSection({ donorId, donorName }: { donorId: number; donorName: string }) {
  const trpc = useTRPC();
  const units = useQuery(
    trpc.donors.taxUnits.list.queryOptions({ donorId, locale: apiLocale }),
  );

  if (units.isPending) return <Skeleton className="h-32" />;
  if (units.isError)
    return (
      <ErrorState
        error={units.error}
        title="Couldn't load tax units"
        onRetry={() => void units.refetch()}
      />
    );

  const sorted = [...units.data].sort(
    (a, b) => Number(isArchived(a)) - Number(isArchived(b)) || a.id - b.id,
  );
  const active = sorted.filter((unit) => !isArchived(unit));
  const add = (
    <TaxUnitDialog
      donorId={donorId}
      defaultName={donorName}
      trigger={
        <Button size="sm">
          <PlusIcon />
          Add tax unit
        </Button>
      }
    />
  );

  if (sorted.length === 0)
    return (
      <EmptyState
        size="sm"
        icon={ReceiptTextIcon}
        title="No tax units"
        description="Donations by this donor aren't reported for tax deduction. Add a tax unit when they give a personal or organization number."
        action={add}
      />
    );

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Donations on a tax unit are reported for deduction each year.
        </p>
        {add}
      </div>
      {sorted.map((unit) => (
        <TaxUnitCard
          key={unit.id}
          unit={unit}
          donorId={donorId}
          transferTargets={active.filter((other) => other.id !== unit.id)}
        />
      ))}
    </div>
  );
}

function TaxUnitCard({
  unit,
  donorId,
  transferTargets,
}: {
  unit: TaxUnit;
  donorId: number;
  transferTargets: TaxUnit[];
}) {
  const archived = isArchived(unit);
  const years = (unit.taxDeductions ?? [])
    .filter((row) => (row.sumDonations ?? 0) !== 0)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  return (
    <section
      aria-label={`Tax unit ${unit.name}`}
      className="rounded-md border border-border bg-surface"
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h3 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
            {unit.name}
            <Status catalog={taxUnitStatus} value={archived ? "archived" : "active"} />
          </h3>
          <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
            <span className="num">{maskSsn(unit.ssn)}</span>
            <span aria-hidden>·</span>
            <span>
              <Num value={unit.numDonations ?? 0} /> donations,{" "}
              <Money value={unit.sumDonations ?? 0} /> deductible
            </span>
            {unit.registered && (
              <>
                <span aria-hidden>·</span>
                <span>
                  Added <DateTime value={unit.registered} />
                </span>
              </>
            )}
            {archived && (
              <>
                <span aria-hidden>·</span>
                <span>
                  Archived <DateTime value={unit.archived} />
                </span>
              </>
            )}
          </p>
        </div>
        {!archived && (
          <div className="flex items-center gap-1">
            <TaxUnitDialog
              donorId={donorId}
              unit={unit}
              trigger={
                <Button size="sm" variant="ghost">
                  <PencilIcon />
                  {strings.actions.edit}
                </Button>
              }
            />
            <ArchiveTaxUnit unit={unit} donorId={donorId} transferTargets={transferTargets} />
          </div>
        )}
      </header>
      {years.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">No deductible donations yet.</p>
      ) : (
        <Table aria-label={`Tax deductions for ${unit.name}`}>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Year</TableHead>
              <TableHead className="text-right">Donations</TableHead>
              <TableHead className="text-right">Deduction</TableHead>
              <TableHead className="pr-4 text-right">Tax benefit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {years.map((row) => (
              <TableRow key={row.year}>
                <TableCell className="num pl-4">{row.year}</TableCell>
                <TableCell className="text-right">
                  <Money value={row.sumDonations} />
                </TableCell>
                <TableCell className="text-right font-semibold">
                  <Money value={row.deduction} />
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <Money value={row.benefit} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function useInvalidateTaxUnits(donorId: number) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.donors.taxUnits.list.queryKey({ donorId, locale: apiLocale }),
      }),
      queryClient.invalidateQueries({ queryKey: trpc.donors.donations.queryKey({ donorId }) }),
    ]);
}

type TaxUnitFields = "name" | "ssn";

/** Create (no `unit`) or edit a tax unit. The server validates the number for the country. */
function TaxUnitDialog({
  donorId,
  unit,
  defaultName = "",
  trigger,
}: {
  donorId: number;
  unit?: TaxUnit;
  defaultName?: string;
  trigger: ReactNode;
}) {
  const trpc = useTRPC();
  const invalidate = useInvalidateTaxUnits(donorId);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ name: "", ssn: "" });
  const [errors, setErrors] = useState<FormErrors<TaxUnitFields>>({ fields: {} });

  const options = {
    onSuccess: async () => {
      await invalidate();
      notify.success(unit ? "Tax unit updated" : "Tax unit added", values.name.trim());
      setOpen(false);
    },
    onError: (error: unknown) => setErrors(toFormErrors(error, { ssn: ssnMessage })),
  };
  const create = useMutation(trpc.donors.taxUnits.create.mutationOptions(options));
  const update = useMutation(trpc.donors.taxUnits.update.mutationOptions(options));
  const pending = create.isPending || update.isPending;

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setValues({ name: unit?.name ?? defaultName, ssn: unit?.ssn ?? "" });
      setErrors({ fields: {} });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const name = values.name.trim();
    const ssn = values.ssn.trim();
    const missing: Partial<Record<TaxUnitFields, string>> = {};
    if (!name) missing.name = "Enter the name on the tax unit";
    if (!ssn) missing.ssn = "Enter the personal or organization number";
    if (Object.keys(missing).length) return setErrors({ fields: missing });
    setErrors({ fields: {} });
    if (unit) update.mutate({ id: unit.id, name, ssn, locale: apiLocale });
    else create.mutate({ donorId, name, ssn, locale: apiLocale });
  }

  const formId = unit ? `tax-unit-${unit.id}` : "tax-unit-new";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{unit ? `Edit tax unit ${unit.name}` : "Add tax unit"}</DialogTitle>
          <DialogDescription>
            {unit
              ? "Changes apply to deductions that haven't been reported yet."
              : "Donations on this tax unit will be reported for deduction."}
          </DialogDescription>
        </DialogHeader>
        <form id={formId} className="grid gap-4" onSubmit={submit} noValidate>
          <Field label="Name" hint="The person or organization, as registered" error={errors.fields.name} required>
            <Input
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              autoComplete="off"
            />
          </Field>
          <Field label="Tax ID" hint={ssnHint} error={errors.fields.ssn} required>
            <Input
              value={values.ssn}
              onChange={(e) => setValues((v) => ({ ...v, ssn: e.target.value }))}
              inputMode="numeric"
              autoComplete="off"
              className="num"
              autoFocus={Boolean(unit)}
            />
          </Field>
          {errors.form && (
            <Callout tone="danger" title={errors.form.title}>
              {errors.form.hint}
            </Callout>
          )}
        </form>
        <DialogFooter>
          <Button disabled={pending} onClick={() => onOpenChange(false)}>
            {strings.actions.cancel}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={pending}>
            {unit ? strings.actions.saveChanges : "Add tax unit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const KEEP = "keep";

function ArchiveTaxUnit({
  unit,
  donorId,
  transferTargets,
}: {
  unit: TaxUnit;
  donorId: number;
  transferTargets: TaxUnit[];
}) {
  const trpc = useTRPC();
  const invalidate = useInvalidateTaxUnits(donorId);
  const archive = useMutation(trpc.donors.taxUnits.archive.mutationOptions());
  const [transfer, setTransfer] = useState(KEEP);
  const target = transferTargets.find((other) => String(other.id) === transfer);

  return (
    <ConfirmDialog
      title={`Archive tax unit ${unit.name}?`}
      tone="danger"
      confirmLabel="Archive tax unit"
      consequences={[
        "It gets no new donations and can't be edited afterwards.",
        "Deductions already reported stay as they are.",
        target ? (
          <>
            This year's donations move to <strong>{target.name}</strong>.
          </>
        ) : (
          "This year's donations stay on this tax unit."
        ),
      ]}
      trigger={
        <Button size="sm" variant="ghost" onClick={() => setTransfer(KEEP)}>
          <ArchiveIcon />
          Archive
        </Button>
      }
      onConfirm={async () => {
        await archive.mutateAsync({
          donorId,
          taxUnitId: unit.id,
          transferId: target?.id,
        });
        await invalidate();
        notify.success("Tax unit archived", unit.name);
      }}
    >
      {transferTargets.length > 0 && (
        <Field label="This year's donations">
          <Select value={transfer} onValueChange={setTransfer}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KEEP}>Keep on this tax unit</SelectItem>
              {transferTargets.map((other) => (
                <SelectItem key={other.id} value={String(other.id)}>
                  Move to {other.name} ({maskSsn(other.ssn)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </ConfirmDialog>
  );
}
