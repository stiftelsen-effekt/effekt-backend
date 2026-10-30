import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money } from "@/components/domain/format";
import { ListPage } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pending } from "@/components/ui/pending";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AddDocumentDialog } from "@/features/regranting/documents";
import { NotesAndDocuments } from "@/features/regranting/notes";
import { ForeignAmount, RoundLink } from "@/features/regranting/ui";
import { RecordDialog, textError } from "@/features/settings/record-dialog";
import { osloDay } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { usePageQuery } from "@/lib/query";
import { useTRPC, type RouterOutputs } from "@/lib/trpc";

export const Route = createFileRoute("/_app/regranting/onward-reports")({
  component: OnwardReportsPage,
});

type Report = RouterOutputs["regranting"]["onward"]["reports"]["list"][number];

/**
 * Reports and statements from intermediary payees (GiveWell's forwarding statements and grant
 * reports), newest first, with their documents and the allocations entered from them.
 */
function OnwardReportsPage() {
  const trpc = useTRPC();
  const query = usePageQuery(trpc.regranting.onward.reports.list.queryOptions({}));
  return (
    <ListPage
      breadcrumbs={[{ label: "Regranting", to: "/regranting" }]}
      title="Onward reports"
      description="What intermediary payees such as GiveWell report about where our money went. Allocations are entered from them on the round page's transfers."
      actions={
        <>
          <Link
            to="/regranting/onward"
            className="rounded-xs text-sm text-accent hover:underline focus-ring"
          >
            Awaiting report
          </Link>
          <ReportDialog />
        </>
      }
    >
      <div className="grid gap-4 px-4 pb-8 sm:px-6">
        {query.isError ? (
          <ErrorState
            error={query.error}
            title="Couldn't load the onward reports"
            onRetry={() => void query.refetch()}
          />
        ) : !query.data ? (
          <Pending className="h-96" label="Loading the onward reports" />
        ) : query.data.length === 0 ? (
          <p className="rounded-md border border-border px-4 py-6 text-sm text-muted-foreground">
            No onward reports yet. Add one here, or while confirming a forward on a transfer.
          </p>
        ) : (
          query.data.map((r) => <ReportCard key={r.id} report={r} />)
        )}
      </div>
    </ListPage>
  );
}

function ReportCard({ report: r }: { report: Report }) {
  // Allocations load when the list is opened
  const [open, setOpen] = useState(false);
  return (
    <section
      id={`report-${r.id}`}
      aria-label={r.reference ?? `Report #${r.id}`}
      className="rounded-md border border-border bg-surface px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-semibold">{r.reference ?? `Report #${r.id}`}</h2>
        <span className="text-sm text-muted-foreground">
          {r.payeeName} · <DateTime value={r.reportedAt} />
        </span>
        <Badge tone="outline">
          {r.allocationCount} {r.allocationCount === 1 ? "allocation" : "allocations"} ·{" "}
          <Money value={r.allocationTotalNok} />
        </Badge>
        <span className="ml-auto flex gap-1">
          <ReportDialog report={r} />
          <DeleteReport report={r} />
        </span>
      </div>
      <NotesAndDocuments
        className="mt-2"
        notes={r.notes}
        documents={r.documents}
        parent={{ onwardReportId: r.id }}
        what="this report"
        actions={<AddDocumentDialog parent={{ onwardReportId: r.id }} what="this report" />}
      />
      {r.allocationCount > 0 && (
        <details className="mt-2" onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer rounded-xs text-sm text-accent focus-ring">
            Show allocations
          </summary>
          {open && <ReportAllocations id={r.id} />}
        </details>
      )}
    </section>
  );
}

function ReportAllocations({ id }: { id: number }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.regranting.onward.reports.get.queryOptions({ id }));
  if (!query.data) return <Pending className="h-16" label="Loading the allocations" />;
  return (
    <table className="mt-2 w-full text-sm" aria-label="Allocations from this report">
      <thead>
        <tr className="text-left text-xs text-muted-foreground [&>th]:py-1 [&>th]:pr-3 [&>th]:font-semibold">
          <th scope="col">Our line</th>
          <th scope="col">To</th>
          <th scope="col">Forwarded</th>
          <th scope="col" className="text-right">
            NOK
          </th>
          <th scope="col" className="text-right">
            Reported
          </th>
        </tr>
      </thead>
      <tbody className="[&>tr>td]:py-0.5 [&>tr>td]:pr-3">
        {query.data.allocations.map((a) => (
          <tr key={a.id}>
            <td>
              <RoundLink id={a.line.roundId}>{a.line.roundName}</RoundLink>{" "}
              <span className="text-muted-foreground">
                #{a.transferId} · {a.line.organizationName}
                {a.line.projectName ? ` · ${a.line.projectName}` : ""}
              </span>
            </td>
            <td>
              {a.kind === "retained"
                ? "Retained by the payee"
                : a.externalGranteeName
                  ? `${a.externalGranteeName} (external)`
                  : `${a.organizationName}${a.projectName ? ` · ${a.projectName}` : ""}`}
            </td>
            <td className="whitespace-nowrap">
              <DateTime value={a.forwardedAt} />
            </td>
            <td className="text-right">
              <Money value={a.amountNok} />
            </td>
            <td className="text-right">
              <ForeignAmount value={a.amountForeign} currency={a.currency} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type ReportForm = { payeeId: string; reportedAt: string; reference: string; notes: string };

function ReportDialog({ report }: { report?: Report }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settings = useQuery(trpc.regranting.onward.settings.queryOptions());
  const create = useMutation(trpc.regranting.onward.reports.create.mutationOptions());
  const update = useMutation(trpc.regranting.onward.reports.update.mutationOptions());
  const intermediaries = settings.data?.intermediaries ?? [];
  return (
    <RecordDialog<ReportForm>
      trigger={
        report ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Edit ${report.reference ?? `report #${report.id}`}`}
          >
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="primary">
            <PlusIcon />
            New report…
          </Button>
        )
      }
      title={report ? "Edit the onward report" : "New onward report"}
      description="One statement or letter from the payee. Add its document link after saving."
      initial={() => ({
        payeeId: String(report?.payeeId ?? intermediaries[0]?.payeeId ?? ""),
        reportedAt: report?.reportedAt ?? osloDay(),
        reference: report?.reference ?? "",
        notes: report?.notes ?? "",
      })}
      validate={(v) => ({
        payeeId: v.payeeId ? undefined : "Choose the payee",
        reportedAt: v.reportedAt ? undefined : "Enter the report's date",
        reference: textError(v.reference, { label: "the reference", max: 255 }),
        notes: textError(v.notes, { label: "the notes", max: 5000 }),
      })}
      saveLabel={report ? "Save report" : "Add report"}
      onSave={async (v) => {
        const fields = {
          payeeId: Number(v.payeeId),
          reportedAt: v.reportedAt,
          reference: v.reference.trim() || null,
          notes: v.notes.trim() || null,
        };
        const saved = report
          ? await update.mutateAsync({ id: report.id, ...fields })
          : await create.mutateAsync(fields);
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        notify.success(
          report ? "Report saved" : "Report added",
          saved.reference ?? `Report #${saved.id}`,
        );
      }}
    >
      {({ values, set, errors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payee" required error={errors.payeeId}>
              <Select value={values.payeeId} onValueChange={(payeeId) => set({ payeeId })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose the payee" />
                </SelectTrigger>
                <SelectContent>
                  {intermediaries.map((i) => (
                    <SelectItem key={i.payeeId} value={String(i.payeeId)}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Report date" required error={errors.reportedAt}>
              <DateInput
                value={values.reportedAt}
                onValueChange={(reportedAt) => set({ reportedAt })}
              />
            </Field>
          </div>
          <Field
            label="Reference"
            error={errors.reference}
            hint="E.g. GiveWell forwarding statement July 2025"
          >
            <Input value={values.reference} onChange={(e) => set({ reference: e.target.value })} />
          </Field>
          <Field label="Notes" error={errors.notes}>
            <Textarea
              rows={3}
              value={values.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}

function DeleteReport({ report: r }: { report: Report }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const remove = useMutation(trpc.regranting.onward.reports.delete.mutationOptions());
  const name = r.reference ?? `report #${r.id}`;
  if (r.allocationCount > 0) return null;
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="ghost" aria-label={`Delete ${name}`}>
          <Trash2Icon />
        </Button>
      }
      tone="danger"
      title={`Delete ${name}?`}
      description="Its document links are removed with it."
      confirmLabel="Delete report"
      onConfirm={async () => {
        await remove.mutateAsync({ id: r.id });
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        notify.success("Report deleted", name);
      }}
    />
  );
}
