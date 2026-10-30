/**
 * Downstream regrants (docs/regranting-downstream.md): what an intermediary payee (GiveWell)
 * did with our transfer lines, as it reports to us. Documentation beside the ledger: entered
 * after the transfer is paid, in any round status, and never changes a balance.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { DateTime, Money } from "@/components/domain/format";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { parseMoneyInput } from "@/features/donations/form";
import { RecordDialog, textError } from "@/features/settings/record-dialog";
import { osloDay } from "@/lib/dates";
import { formatDate, formatMoneyInput } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useTRPC, type RouterOutputs } from "@/lib/trpc";
import { validateDocument } from "./documents";
import { parsePreciseDecimal } from "./payment-form";
import { ForeignAmount, OrganizationPicker, ProjectPicker, RecipientLink } from "./ui";

export type OnwardLine = RouterOutputs["regranting"]["onward"]["transfer"]["lines"][number];
export type OnwardAllocation = OnwardLine["allocations"][number];
export type OnwardStatus = OnwardLine["status"];

export const onwardStatusLabels: Record<OnwardStatus, string> = {
  awaiting: "Awaiting report",
  partly_forwarded: "Partly forwarded",
  forwarded: "Forwarded",
  forwarded_assumed: "Forwarded (assumed)",
};

const onwardStatusTones: Record<OnwardStatus, BadgeTone> = {
  awaiting: "warning",
  partly_forwarded: "warning",
  forwarded: "success",
  forwarded_assumed: "outline",
};

export function OnwardStatusBadge({ status }: { status: OnwardStatus }) {
  return <Badge tone={onwardStatusTones[status]}>{onwardStatusLabels[status]}</Badge>;
}

/** Which payees are intermediaries (their paid lines get an onward status) */
export function useIntermediaryPayees() {
  const trpc = useTRPC();
  const settings = useQuery(trpc.regranting.onward.settings.queryOptions());
  return new Set(settings.data?.intermediaries.map((i) => i.payeeId) ?? []);
}

const allocationTarget = (a: OnwardAllocation) =>
  a.kind === "retained"
    ? "Retained by the payee"
    : a.externalGranteeName
    ? `${a.externalGranteeName} (external)`
    : `${a.organizationName}${a.projectName ? ` · ${a.projectName}` : ""}`;

/**
 * Under a paid transfer to an intermediary payee on the round page: each line's onward status
 * and allocations, with Confirm forwarded (pass-through lines), Add grant (regranting-fund
 * lines) and Add retained.
 */
export function TransferOnward({ transferId, payeeId }: { transferId: number; payeeId: number }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.regranting.onward.transfer.queryOptions({ transferId }));
  if (!query.data?.intermediary || !query.data.paid) return null;
  return (
    <section aria-label={`Onward from transfer #${transferId}`} data-onward={transferId}>
      <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
        Onward, as the payee reports it
      </h4>
      <ul className="grid gap-2">
        {query.data.lines.map((line) => (
          <li
            key={line.id}
            data-onward-line={line.id}
            className="rounded-md border border-border px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">
                {line.organizationName}
                {line.projectName && (
                  <span className="font-normal text-muted-foreground"> · {line.projectName}</span>
                )}
              </span>
              <Money value={line.amountNok} />
              <OnwardStatusBadge status={line.status} />
              {line.regrantingFund && <Badge tone="outline">Regranting fund</Badge>}
              <span className="text-xs text-muted-foreground">
                {line.status !== "awaiting" && (
                  <>
                    Reported <Money value={line.reportedNok} />
                    {line.assumedNok !== "0.00" && (
                      <>
                        {" "}
                        · assumed <Money value={line.assumedNok} />
                      </>
                    )}
                    {line.awaitingNok !== "0.00" && (
                      <>
                        {" "}
                        · awaiting <Money value={line.awaitingNok} />
                      </>
                    )}
                  </>
                )}
              </span>
              <span className="ml-auto flex flex-wrap gap-1">
                {line.forwardedPrefill && (
                  <AllocationDialog line={line} payeeId={payeeId} mode="forwarded" />
                )}
                {line.regrantingFund && line.awaitingNok !== "0.00" && (
                  <AllocationDialog line={line} payeeId={payeeId} mode="grant" />
                )}
                <AllocationDialog line={line} payeeId={payeeId} mode="retained" />
              </span>
            </div>
            {line.allocations.length > 0 && (
              <table
                className="mt-1 w-full text-sm"
                aria-label={`Onward allocations of ${line.organizationName}`}
              >
                <tbody className="[&>tr>td]:py-0.5 [&>tr>td]:pr-3">
                  {line.allocations.map((a) => (
                    <tr key={a.id} data-onward-allocation={a.id}>
                      <td className="min-w-48">{allocationTarget(a)}</td>
                      <td className="whitespace-nowrap">
                        <DateTime value={a.forwardedAt} />
                      </td>
                      <td className="text-right">
                        <Money value={a.amountNok} />
                      </td>
                      <td className="text-right">
                        <ForeignAmount value={a.amountForeign} currency={a.currency} />
                      </td>
                      <td>
                        {a.basis === "assumed" ? (
                          <Badge tone="outline" title={a.note ?? undefined}>
                            Assumed
                          </Badge>
                        ) : a.reportId ? (
                          <Link
                            to="/regranting/onward-reports"
                            hash={`report-${a.reportId}`}
                            className="rounded-xs text-accent hover:underline focus-ring"
                          >
                            {a.reportReference ?? `Report #${a.reportId}`}
                          </Link>
                        ) : null}
                      </td>
                      <td
                        className="max-w-64 truncate text-muted-foreground"
                        title={a.note ?? undefined}
                      >
                        {a.basis === "reported" ? a.note : null}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <AllocationDialog
                          line={line}
                          payeeId={payeeId}
                          mode={a.kind === "retained" ? "retained" : "grant"}
                          allocation={a}
                        />
                        <DeleteAllocation allocation={a} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DeleteAllocation({ allocation: a }: { allocation: OnwardAllocation }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const remove = useMutation(trpc.regranting.onward.allocations.delete.mutationOptions());
  return (
    <ConfirmDialog
      trigger={
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Delete the allocation to ${allocationTarget(a)}`}
        >
          <Trash2Icon />
        </Button>
      }
      tone="danger"
      title={`Delete the allocation to ${allocationTarget(a)}?`}
      description={
        a.basis === "assumed"
          ? "Do this to replace it with what the payee reported."
          : "The amount goes back to awaiting report. The report itself stays."
      }
      confirmLabel="Delete allocation"
      onConfirm={async () => {
        await remove.mutateAsync({ id: a.id });
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        notify.success("Allocation deleted", allocationTarget(a));
      }}
    />
  );
}

type Mode = "forwarded" | "grant" | "retained";

type AllocationForm = {
  target: "recipient" | "grantee";
  organizationId: number | null;
  projectId: number | null;
  externalGranteeId: string;
  newGrantee: string;
  reportId: string;
  reportedAt: string;
  reportReference: string;
  reportLink: string;
  forwardedAt: string;
  currency: string;
  amountForeign: string;
  amountNok: string;
  note: string;
};

const NEW = "new";

export function validateAllocation(v: AllocationForm, mode: Mode) {
  const foreign = v.amountForeign.trim();
  const nok = v.amountNok.trim();
  return {
    organizationId:
      mode !== "retained" && v.target === "recipient" && v.organizationId === null
        ? "Choose the recipient"
        : undefined,
    externalGranteeId:
      mode !== "retained" && v.target === "grantee" && !v.externalGranteeId && !v.newGrantee.trim()
        ? "Choose a grantee or name a new one"
        : undefined,
    newGrantee: textError(v.newGrantee, { label: "the name", max: 255 }),
    reportId: v.reportId ? undefined : "Pick the report this comes from",
    reportedAt: v.reportId === NEW && !v.reportedAt ? "Enter the report's date" : undefined,
    reportReference: textError(v.reportReference, { label: "the reference", max: 255 }),
    reportLink: v.reportLink.trim()
      ? validateDocument({ url: v.reportLink, label: "" }).url
      : undefined,
    forwardedAt: v.forwardedAt ? undefined : "Enter the date",
    currency: /^[A-Z]{3,8}$/.test(v.currency.trim()) ? undefined : "Enter a code like USD",
    amountForeign:
      foreign && parsePreciseDecimal(foreign) === null ? "Enter a positive amount" : undefined,
    amountNok:
      nok && parseMoneyInput(nok) === null
        ? "Enter the amount in kroner with at most two decimals"
        : !nok && !foreign
        ? "Enter the amount"
        : undefined,
    note:
      mode === "retained" && !v.note.trim()
        ? "Say why the payee kept it"
        : textError(v.note, { label: "the note", max: 5000 }),
  };
}

const modeLabels: Record<Mode, string> = {
  forwarded: "Confirm forwarded…",
  grant: "Add grant…",
  retained: "Add retained…",
};

/** Create (by mode) or edit (with `allocation`) one onward allocation */
export function AllocationDialog({
  line,
  payeeId,
  mode,
  allocation,
}: {
  line: OnwardLine;
  payeeId: number;
  mode: Mode;
  allocation?: OnwardAllocation;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const reports = useQuery(trpc.regranting.onward.reports.list.queryOptions({ payeeId }));
  const grantees = useQuery({
    ...trpc.regranting.onward.grantees.list.queryOptions(),
    enabled: line.regrantingFund,
  });
  const createReport = useMutation(trpc.regranting.onward.reports.create.mutationOptions());
  const addDocument = useMutation(trpc.regranting.documents.add.mutationOptions());
  const createGrantee = useMutation(trpc.regranting.onward.grantees.create.mutationOptions());
  const create = useMutation(trpc.regranting.onward.allocations.create.mutationOptions());
  const update = useMutation(trpc.regranting.onward.allocations.update.mutationOptions());
  const what = line.projectName
    ? `${line.organizationName} · ${line.projectName}`
    : line.organizationName;

  const initial = (): AllocationForm => {
    const latestReport = reports.data?.[0];
    const base: AllocationForm = {
      target: "recipient",
      organizationId: null,
      projectId: null,
      externalGranteeId: "",
      newGrantee: "",
      reportId: latestReport ? String(latestReport.id) : NEW,
      reportedAt: osloDay(),
      reportReference: "",
      reportLink: "",
      forwardedAt: "",
      currency: line.transferCurrency,
      amountForeign: "",
      amountNok: "",
      note: "",
    };
    if (allocation)
      return {
        ...base,
        target: allocation.externalGranteeId ? "grantee" : "recipient",
        organizationId: allocation.organizationId,
        projectId: allocation.projectId,
        externalGranteeId: allocation.externalGranteeId ? String(allocation.externalGranteeId) : "",
        reportId: allocation.reportId ? String(allocation.reportId) : base.reportId,
        forwardedAt: allocation.forwardedAt,
        currency: allocation.currency,
        amountForeign: allocation.amountForeign ?? "",
        amountNok: formatMoneyInput(allocation.amountNok),
        note: allocation.note ?? "",
      };
    if (mode === "forwarded" && line.forwardedPrefill) {
      const p = line.forwardedPrefill;
      return {
        ...base,
        organizationId: p.organizationId,
        projectId: p.projectId,
        currency: p.currency,
        amountForeign: p.amountForeign ?? "",
        amountNok: formatMoneyInput(p.amountNok),
      };
    }
    return base;
  };

  return (
    <RecordDialog<AllocationForm>
      contentClassName="sm:max-w-xl"
      trigger={
        allocation ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Edit the allocation to ${allocationTarget(allocation)}`}
          >
            <PencilIcon />
          </Button>
        ) : (
          <Button size="sm" variant={mode === "retained" ? "ghost" : "secondary"}>
            {mode !== "retained" && <PlusIcon />}
            {modeLabels[mode]}
          </Button>
        )
      }
      title={
        allocation
          ? `Edit the allocation from ${what}`
          : mode === "forwarded"
          ? `Confirm ${what} forwarded`
          : mode === "grant"
          ? `Add a grant from ${what}`
          : `Add an amount the payee kept from ${what}`
      }
      description={
        <>
          Line <Money value={line.amountNok} />, paid <DateTime value={line.paidAt} /> to{" "}
          {line.payeeName}
          {line.fxRate ? ` at ${line.fxRate} NOK/${line.transferCurrency}` : ""}. Awaiting{" "}
          <Money value={line.awaitingNok} />.
        </>
      }
      initial={initial}
      validate={(v) => validateAllocation(v, mode)}
      saveLabel={
        allocation
          ? "Save allocation"
          : mode === "forwarded"
          ? "Confirm forwarded"
          : "Add allocation"
      }
      onSave={async (v) => {
        let reportId = Number(v.reportId);
        if (v.reportId === NEW) {
          const report = await createReport.mutateAsync({
            payeeId,
            reportedAt: v.reportedAt,
            reference: v.reportReference.trim() || null,
          });
          reportId = report.id;
          if (v.reportLink.trim())
            await addDocument.mutateAsync({
              onwardReportId: reportId,
              url: v.reportLink.trim(),
              label: v.reportReference.trim() || null,
            });
        }
        let externalGranteeId: number | null = null;
        if (mode !== "retained" && v.target === "grantee") {
          externalGranteeId = v.externalGranteeId
            ? Number(v.externalGranteeId)
            : (await createGrantee.mutateAsync({ name: v.newGrantee.trim() })).id;
        }
        const fields = {
          kind: mode === "retained" ? ("retained" as const) : ("grant" as const),
          basis: "reported" as const,
          organizationId: mode !== "retained" && v.target === "recipient" ? v.organizationId : null,
          externalGranteeId,
          projectId: mode !== "retained" && v.target === "recipient" ? v.projectId : null,
          currency: v.currency.trim(),
          amountForeign: v.amountForeign.trim() ? parsePreciseDecimal(v.amountForeign) : null,
          amountNok: v.amountNok.trim() ? Number(parseMoneyInput(v.amountNok)) : null,
          forwardedAt: v.forwardedAt,
          reportId,
          note: v.note.trim() || null,
        };
        const result = allocation
          ? await update.mutateAsync({ id: allocation.id, ...fields })
          : await create.mutateAsync({ transferLineId: line.id, ...fields });
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        notify.success(
          allocation ? "Allocation saved" : "Allocation added",
          [
            `${what}: ${onwardStatusLabels[result.line.status].toLowerCase()}`,
            ...result.warnings,
          ].join(". "),
        );
      }}
    >
      {({ values, set, errors }) => (
        <>
          {mode !== "retained" && line.regrantingFund && (
            <SegmentedControl
              label="Grantee"
              value={values.target}
              onValueChange={(target) => set({ target })}
              options={[
                { value: "recipient", label: "One of our recipients" },
                { value: "grantee", label: "External grantee" },
              ]}
            />
          )}
          {mode !== "retained" && values.target === "recipient" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Recipient" required error={errors.organizationId}>
                <OrganizationPicker
                  value={values.organizationId}
                  onValueChange={(organizationId) => set({ organizationId, projectId: null })}
                />
              </Field>
              <Field label="Project" error={errors.projectId}>
                <ProjectPicker
                  organizationId={values.organizationId}
                  value={values.projectId}
                  onValueChange={(projectId) => set({ projectId })}
                />
              </Field>
            </div>
          )}
          {mode !== "retained" && values.target === "grantee" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="External grantee" error={errors.externalGranteeId}>
                <Select
                  value={values.externalGranteeId || "none"}
                  onValueChange={(id) => set({ externalGranteeId: id === "none" ? "" : id })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">New grantee</SelectItem>
                    {(grantees.data ?? []).map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {!values.externalGranteeId && (
                <Field
                  label="New grantee's name"
                  error={errors.newGrantee}
                  hint="Only for grantees that aren't our recipients"
                >
                  <Input
                    value={values.newGrantee}
                    onChange={(e) => set({ newGrantee: e.target.value })}
                  />
                </Field>
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Report" required error={errors.reportId}>
              <Select value={values.reportId} onValueChange={(reportId) => set({ reportId })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW}>New report…</SelectItem>
                  {(reports.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {formatDate(r.reportedAt)} · {r.reference ?? `Report #${r.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={
                mode === "grant" ? "Granted on" : mode === "retained" ? "Kept on" : "Forwarded on"
              }
              required
              error={errors.forwardedAt}
              hint="When the money reached the recipient"
            >
              <DateInput
                value={values.forwardedAt}
                onValueChange={(forwardedAt) => set({ forwardedAt })}
              />
            </Field>
          </div>
          {values.reportId === NEW && (
            <div className="grid gap-4 rounded-md border border-border p-3 sm:grid-cols-2">
              <Field label="Report date" required error={errors.reportedAt}>
                <DateInput
                  value={values.reportedAt}
                  onValueChange={(reportedAt) => set({ reportedAt })}
                />
              </Field>
              <Field
                label="Reference"
                error={errors.reportReference}
                hint="E.g. GiveWell statement July 2025"
              >
                <Input
                  value={values.reportReference}
                  onChange={(e) => set({ reportReference: e.target.value })}
                />
              </Field>
              <Field label="Link to the report" error={errors.reportLink} className="sm:col-span-2">
                <Input
                  type="url"
                  placeholder="https://drive.google.com/…"
                  value={values.reportLink}
                  onChange={(e) => set({ reportLink: e.target.value })}
                />
              </Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Currency" required error={errors.currency}>
              <Input
                className="num"
                value={values.currency}
                onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field
              label={`Amount in ${values.currency || "currency"}`}
              error={errors.amountForeign}
            >
              <Input
                inputMode="decimal"
                className="num"
                value={values.amountForeign}
                onChange={(e) => set({ amountForeign: e.target.value })}
              />
            </Field>
            <Field
              label="NOK share of the line"
              error={errors.amountNok}
              hint={
                values.currency === line.transferCurrency && line.fxRate
                  ? "Empty: converted at the transfer's rate"
                  : "Enter it directly"
              }
            >
              <Input
                inputMode="decimal"
                className="num"
                value={values.amountNok}
                onChange={(e) => set({ amountNok: e.target.value })}
              />
            </Field>
          </div>
          <Field
            label="Note"
            required={mode === "retained"}
            error={errors.note}
            hint={
              mode === "retained"
                ? "Why the payee kept it (fees, FX loss)"
                : "Required if it didn't go to the line's own recipient"
            }
          >
            <Textarea
              rows={2}
              value={values.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}

/** Lines awaiting a report, for the Awaiting report page */
export function OnwardLineLink({
  line,
}: {
  line: Pick<OnwardLine, "organizationId" | "organizationName" | "projectName">;
}) {
  return (
    <>
      <RecipientLink organizationId={line.organizationId}>{line.organizationName}</RecipientLink>
      {line.projectName && <span className="text-muted-foreground"> · {line.projectName}</span>}
    </>
  );
}
