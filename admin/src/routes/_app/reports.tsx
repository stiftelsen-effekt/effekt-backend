import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DownloadIcon, PlusIcon, TruckIcon } from "lucide-react";
import { useState } from "react";
import { createColumns, DataTable } from "@/components/data-table";
import { Callout } from "@/components/domain/callout";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { describeError, ErrorState } from "@/components/domain/error-state";
import { EmptyState } from "@/components/domain/empty-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { FileDropzone } from "@/components/domain/file-dropzone";
import { SettingsPage, SettingsSection, useScrollTopOn } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { Field, useFieldControl } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { isoDay } from "@/features/home/model";
import {
  transactionCsvRows,
  transactionRangeInput,
  transactionTotals,
} from "@/features/reports/model";
import { config } from "@/lib/config";
import { downloadFile, toCsv } from "@/lib/download";
import { notify } from "@/lib/notify";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";

const isSweden = config.locale === "SV";

const sections = [
  { id: "transactions", label: "Transaction report" },
  ...(isSweden
    ? [
        { id: "ku65", label: "KU65 tax report" },
        { id: "shipments", label: "AutoGiro shipments" },
      ]
    : []),
];
type SectionId = "transactions" | "ku65" | "shipments";

export const Route = createFileRoute("/_app/reports")({
  validateSearch: (search: Record<string, unknown>): { section?: SectionId } =>
    sections.some((section) => section.id === search.section)
      ? { section: search.section as SectionId }
      : {},
  component: ReportsPage,
});

function ReportsPage() {
  const { section = "transactions" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  useScrollTopOn(section);
  return (
    <SettingsPage
      title="Reports"
      description="Files for accounting, the tax authorities and the bank."
      nav={sections}
      value={section}
      onValueChange={(id) =>
        void navigate({
          search: id === "transactions" ? {} : { section: id as SectionId },
          replace: true,
        })
      }
    >
      {section === "transactions" && <TransactionReport />}
      {section === "ku65" && isSweden && <Ku65Report />}
      {section === "shipments" && isSweden && <AutoGiroShipments />}
    </SettingsPage>
  );
}

//region Transaction report

/** DateRangePicker wired to the surrounding <Field>'s label. */
function FieldDateRange(props: {
  value: DateRange | undefined;
  onValueChange: (range: DateRange | undefined) => void;
}) {
  const { id } = useFieldControl();
  return <DateRangePicker id={id} placeholder="Choose dates" {...props} />;
}

function TransactionReport() {
  const trpc = useTRPC();
  const methods = useQuery(trpc.config.paymentMethods.list.queryOptions());
  const [range, setRange] = useState<DateRange | undefined>();
  const [methodIds, setMethodIds] = useState<number[]>([]);
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [missingRange, setMissingRange] = useState(false);
  const report = useMutation(trpc.reports.transactions.range.mutationOptions());
  const totals = report.data && transactionTotals(report.data.rows);

  async function download() {
    if (!range?.from || !range.to) {
      setMissingRange(true);
      return;
    }
    const result = await report
      .mutateAsync(
        transactionRangeInput({
          from: isoDay(range.from),
          to: isoDay(range.to),
          paymentMethodIds: methodIds,
        }),
      )
      .catch(() => null);
    if (!result) return;
    downloadFile(
      format === "csv"
        ? {
            filename: `${result.filename}.csv`,
            contentType: "text/csv;charset=utf-8",
            content: toCsv(transactionCsvRows(result.rows)),
          }
        : {
            filename: `${result.filename}.json`,
            contentType: "application/json",
            content: JSON.stringify(result.rows, null, 2),
          },
    );
  }

  const error = report.error && describeError(report.error);

  return (
    <SettingsSection
      title="Transaction report"
      description={
        <>
          <p>
            Every donation confirmed in the period, with how it was split between organizations.
            Both dates are included.
          </p>
          <p className="mt-2">
            CSV has one line per donation and organization; JSON one entry per donation.
          </p>
        </>
      }
    >
      <form
        className="grid max-w-xl gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void download();
        }}
      >
        <Field label="Period" error={missingRange && !range?.to ? "Choose a start and end date" : undefined}>
          <FieldDateRange
            value={range}
            onValueChange={(next) => {
              setRange(next);
              setMissingRange(false);
            }}
          />
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-semibold">
            Payment methods <span className="font-normal text-muted-foreground">(all when none are chosen)</span>
          </legend>
          {methods.error ? (
            <ErrorState error={methods.error} onRetry={() => void methods.refetch()} />
          ) : !methods.data ? (
            <Skeleton className="h-24" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {methods.data.map((method) => {
                const id = `method-${method.id}`;
                return (
                  <div key={method.id} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={methodIds.includes(method.id)}
                      onCheckedChange={(checked) =>
                        setMethodIds((ids) =>
                          checked ? [...ids, method.id] : ids.filter((other) => other !== method.id),
                        )
                      }
                    />
                    <Label htmlFor={id} className="font-normal">
                      {method.name}
                    </Label>
                  </div>
                );
              })}
            </div>
          )}
        </fieldset>
        <div className="grid gap-1.5">
          <span className="text-sm font-semibold" id="report-format">
            Format
          </span>
          <SegmentedControl
            label="Format"
            value={format}
            onValueChange={setFormat}
            options={[
              { value: "csv", label: "CSV" },
              { value: "json", label: "JSON" },
            ]}
          />
        </div>
        {error && (
          <Callout tone="danger" title={error.title}>
            {error.hint}
          </Callout>
        )}
        {totals && !report.isPending && (
          <Callout tone="success" title="Report downloaded">
            <Num value={totals.count} /> {totals.count === 1 ? "donation" : "donations"},{" "}
            <Money value={totals.sum} /> in total.
          </Callout>
        )}
        <div>
          <Button type="submit" variant="primary" pending={report.isPending}>
            <DownloadIcon />
            Download report
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}

//endregion

//region KU65

function Ku65Report() {
  const trpc = useTRPC();
  const [files, setFiles] = useState<File[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [missingFile, setMissingFile] = useState(false);
  const ku65 = useMutation(trpc.reports.tax.ku65.mutationOptions());
  const error = ku65.error && describeError(ku65.error);
  const yearValid = /^\d{4}$/.test(year.trim());

  async function generate() {
    const file = files[0];
    if (!file) {
      setMissingFile(true);
      return;
    }
    if (!yearValid) return;
    const form = new FormData();
    form.set("report", file);
    form.set("year", year.trim());
    const result = await ku65.mutateAsync(form).catch(() => null);
    if (!result) return;
    downloadFile(result);
    notify.success("KU65 file downloaded", result.filename);
  }

  return (
    <SettingsSection
      title="KU65 tax report"
      description={
        <>
          <p>
            Builds the XML file for Skatteverket from a CSV of each donor's deductible total for the
            year (personnummer and amount).
          </p>
          <p className="mt-2">Nothing is saved or sent; you upload the file to Skatteverket.</p>
        </>
      }
    >
      <form
        className="grid max-w-xl gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <div className="grid gap-1.5">
          <span className="text-sm font-semibold">Donations per donor (CSV)</span>
          <FileDropzone
            accept=".csv,text/csv"
            files={files}
            onFilesChange={(next) => {
              setFiles(next);
              setMissingFile(false);
              ku65.reset();
            }}
            hint="One file, up to 10 MB"
          />
          {missingFile && <p className="text-xs text-danger">Choose a CSV file</p>}
        </div>
        <Field
          label="Income year"
          error={!yearValid ? "Enter a year like 2025" : undefined}
          className="max-w-40"
        >
          <Input
            inputMode="numeric"
            className="num"
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />
        </Field>
        {error && (
          <Callout tone="danger" title={error.title}>
            {error.hint}
          </Callout>
        )}
        <div>
          <Button type="submit" variant="primary" pending={ku65.isPending}>
            <DownloadIcon />
            Generate KU65 file
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}

//endregion

//region AutoGiro shipments

type Shipment = RouterOutputs["giro"]["autogiro"]["shipments"]["list"][number];

function ShipmentDownload({ shipment }: { shipment: Shipment }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      pending={pending}
      aria-label={`Download file for shipment ${shipment.ID}`}
      onClick={async () => {
        setPending(true);
        try {
          downloadFile(
            await queryClient.fetchQuery(
              trpc.giro.autogiro.shipments.report.queryOptions({ id: shipment.ID }),
            ),
          );
        } catch (error) {
          notify.error(error, "Couldn't download the shipment file");
        } finally {
          setPending(false);
        }
      }}
    >
      <DownloadIcon />
      File
    </Button>
  );
}

const shipmentCol = createColumns<Shipment>();
const shipmentColumns = shipmentCol.columns([
  shipmentCol.accessor("ID", {
    header: "Shipment",
    enableSorting: false,
    meta: { numeric: true, cellClassName: "w-24" },
  }),
  shipmentCol.accessor("created", {
    header: "Created",
    enableSorting: false,
    cell: ({ getValue }) => <DateTime value={getValue()} format="datetime" />,
  }),
  shipmentCol.accessor("num_charges", {
    header: "Charges",
    enableSorting: false,
    meta: { numeric: true },
    cell: ({ getValue }) => <Num value={getValue()} />,
  }),
  shipmentCol.display({
    id: "file",
    header: () => <span className="sr-only">File</span>,
    meta: { align: "right", cellClassName: "w-24" },
    cell: ({ row }) => <ShipmentDownload shipment={row.original} />,
  }),
]);

function AutoGiroShipments() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const shipments = useQuery({
    ...trpc.giro.autogiro.shipments.list.queryOptions(),
    placeholderData: keepPreviousData,
  });
  const create = useMutation(trpc.giro.autogiro.shipments.create.mutationOptions());
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const sorted = [...(shipments.data ?? [])].sort((a, b) => b.ID - a.ID);
  const page = sorted.slice(
    pagination.pageIndex * pagination.pageSize,
    (pagination.pageIndex + 1) * pagination.pageSize,
  );
  const created = create.data;

  return (
    <SettingsSection
      title="AutoGiro shipments"
      description={
        <>
          <p>
            A shipment is the claims file for Bankgirot: this month's charges, mandates to confirm
            and changed charges. One is normally created on schedule each banking day.
          </p>
          <p className="mt-2">Download a shipment's file to see or resend exactly what was claimed.</p>
        </>
      }
      actions={
        <ConfirmDialog
          trigger={
            <Button>
              <PlusIcon />
              Create shipment
            </Button>
          }
          title="Create an AutoGiro shipment now?"
          description="This does what the scheduled run does, right away."
          consequences={[
            "Adds a charge for every active agreement that hasn't been charged this month",
            "Confirms new mandates waiting for approval and amends changed charges",
            "Saves the claims file under a new shipment number, ready to download here",
            "If nothing is due, no shipment is created",
          ]}
          confirmLabel="Create shipment"
          onConfirm={async () => {
            const result = await create.mutateAsync();
            await queryClient.invalidateQueries({
              queryKey: trpc.giro.autogiro.shipments.list.queryKey(),
            });
            await queryClient.invalidateQueries({ queryKey: trpc.reports.logs.list.queryKey() });
            notify.success(
              result.shipmentID === null
                ? "Nothing to ship"
                : `Shipment ${result.shipmentID} created`,
            );
          }}
        />
      }
    >
      <div className="grid gap-4">
        {created &&
          (created.shipmentID === null ? (
            <Callout tone="neutral" title="No shipment created">
              No agreements were due and no mandates were waiting.
            </Callout>
          ) : (
            <Callout
              tone="success"
              title={`Shipment ${created.shipmentID} created`}
              action={
                created.file !== null && (
                  <Button
                    size="sm"
                    onClick={() =>
                      downloadFile({
                        filename: created.filename,
                        contentType: "text/plain",
                        content: created.file,
                      })
                    }
                  >
                    <DownloadIcon />
                    Download file
                  </Button>
                )
              }
            >
              <Num value={created.numCharges} /> charges,{" "}
              <Num value={created.numMandatesToBeConfirmed} /> mandates to confirm.
            </Callout>
          ))}
        {shipments.error ? (
          <ErrorState error={shipments.error} onRetry={() => void shipments.refetch()} />
        ) : (
          <div className="relative flex h-[32rem] flex-col overflow-hidden rounded-md border border-border">
            <DataTable
              label="AutoGiro shipments"
              columns={shipmentColumns}
              data={shipments.data ? page : undefined}
              rowCount={sorted.length}
              isLoading={shipments.isPending}
              isFetching={shipments.isFetching}
              getRowId={(row) => String(row.ID)}
              pagination={pagination}
              onPaginationChange={setPagination}
              pageSizeOptions={[25, 50, 100]}
              empty={
                <EmptyState
                  icon={TruckIcon}
                  title="No shipments yet"
                  description="Shipments appear here once one has been created."
                />
              }
            />
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

//endregion
