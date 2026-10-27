import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { Callout } from "@/components/domain/callout";
import { describeError, ErrorState } from "@/components/domain/error-state";
import { Money, Num } from "@/components/domain/format";
import { SettingsPage, SettingsSection } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { Field, useFieldControl } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { visiblePaymentMethods } from "@/features/donations/api";
import { isoDay } from "@/features/home/model";
import {
  transactionCsvRows,
  transactionRangeInput,
  transactionTotals,
} from "@/features/reports/model";
import { downloadFile, toCsv } from "@/lib/download";
import { formatDate } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

const sections = [{ id: "transactions", label: "Transaction report" }];

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <SettingsPage
      title="Reports"
      description="Files for accounting."
      nav={sections}
      value="transactions"
      onValueChange={() => {}}
    >
      <TransactionReport />
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
    // An empty period has nothing to download; the callout below says so.
    if (!result || result.rows.length === 0) return;
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
        <Field
          label="Period"
          error={missingRange && !range?.to ? "Choose a start and end date" : undefined}
        >
          <FieldDateRange
            value={range}
            onValueChange={(next) => {
              setRange(next);
              setMissingRange(false);
              report.reset();
            }}
          />
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-semibold">
            Payment methods{" "}
            <span className="font-normal text-muted-foreground">(all when none are chosen)</span>
          </legend>
          {methods.error ? (
            <ErrorState error={methods.error} onRetry={() => void methods.refetch()} />
          ) : !methods.data ? (
            <Skeleton className="h-24" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {visiblePaymentMethods(methods.data).map((method) => {
                const id = `method-${method.id}`;
                return (
                  <div key={method.id} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={methodIds.includes(method.id)}
                      onCheckedChange={(checked) =>
                        setMethodIds((ids) =>
                          checked
                            ? [...ids, method.id]
                            : ids.filter((other) => other !== method.id),
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
        {totals && !report.isPending && totals.count === 0 && (
          <Callout tone="warning" title="No donations in this period">
            Nothing was downloaded. No donation was confirmed between {formatDate(range?.from)} and{" "}
            {formatDate(range?.to)}
            {methodIds.length ? " with the chosen payment methods" : ""}. Check the dates or choose
            other payment methods.
          </Callout>
        )}
        {totals && !report.isPending && totals.count > 0 && (
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
