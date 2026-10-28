import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DownloadIcon, Undo2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { Callout } from "@/components/domain/callout";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { CopyValue } from "@/components/domain/copy-value";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Status } from "@/components/domain/status";
import {
  DateRangeFilter,
  FilterBar,
  OptionsFilter,
  RangeFilter,
  SavedViews,
  TextFilter,
  useListState,
  ListEmpty,
} from "@/components/filters";
import { ListPage, RowDialog } from "@/components/templates";
import { Button } from "@/components/ui/button";
import {
  canRefund,
  chargeHistogramBins,
  chargesList,
  chargeStatuses,
  toChargeFilter,
  type ChargeRow,
} from "@/features/agreements/charges";
import { downloadCsv } from "@/features/donations/api";
import { formatDate, formatMoney } from "@/lib/format";
import { notify } from "@/lib/notify";
import { chargeStatus } from "@/lib/status";
import { strings } from "@/lib/strings";
import { unbatched, useTRPC } from "@/lib/trpc";
import { nextPage, usePageQuery } from "@/lib/query";

export const Route = createFileRoute("/_app/charges")({
  validateSearch: chargesList.validateSearch,
  component: ChargesPage,
});

const col = createColumns<ChargeRow>();
const columns = col.columns([
  col.accessor("dueDate", {
    header: "Due",
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("full_name", {
    header: "Donor",
    meta: { cellClassName: "font-semibold max-w-56 truncate" },
  }),
  col.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => (
      <Status catalog={chargeStatus} value={getValue() as keyof typeof chargeStatus} />
    ),
  }),
  col.accessor("amountNOK", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("KID", {
    id: "kid",
    header: "KID",
    meta: { label: "KID" },
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  col.accessor("agreementID", {
    header: "Agreement",
    enableSorting: false,
    meta: { cellClassName: "text-muted-foreground" },
  }),
  col.accessor("chargeID", {
    header: "Charge ID",
    enableSorting: false,
    meta: { cellClassName: "text-muted-foreground" },
  }),
  col.accessor("timestamp_created", {
    id: "created",
    header: "Created",
    meta: { label: "Created" },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

const donorOf = (row: ChargeRow) => row.full_name ?? "an unnamed donor";
const keyOf = (row: ChargeRow) => `${row.agreementID}:${row.chargeID}`;

function ChargesPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const list = useListState(chargesList);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const filter = toChargeFilter(list.filters);
  const sort = { id: list.sort.id, desc: list.sort.desc };
  const listOptions = (page: number) =>
    trpc.vipps.charges.list.queryOptions({
      page: page - 1,
      limit: list.pageSize,
      sort,
      filter,
    });
  const query = usePageQuery(listOptions(list.page), {
    // The next page is fetched as soon as this one is in, so paging forward is instant.
    prefetch: (data) => nextPage(list.page, data.pages, listOptions),
  });
  const histogram = useQuery({
    ...trpc.vipps.charges.histogram.queryOptions(),
    staleTime: 300_000,
  });
  const bins = useMemo(() => chargeHistogramBins(histogram.data ?? []), [histogram.data]);

  const rows = query.data?.rows;
  const opened = openKey ? rows?.find((row) => keyOf(row) === openKey) : undefined;
  const stats = query.data?.statistics;

  async function exportCsv() {
    setExporting(true);
    try {
      const file = await queryClient.fetchQuery(
        trpc.vipps.charges.export.queryOptions({ sort, filter }, { staleTime: 0 }),
      );
      downloadCsv(file);
      notify.success("Export downloaded", file.filename);
    } catch (error) {
      notify.error(error, "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <ListPage
      title="Vipps charges"
      actions={
        <Button onClick={() => void exportCsv()} pending={exporting}>
          <DownloadIcon />
          {strings.actions.export}
        </Button>
      }
      filters={
        <FilterBar
          list={list}
          searchPlaceholder="Donor name, KID or agreement ID"
          end={<SavedViews list={list} />}
        >
          <OptionsFilter
            field="status"
            label="Status"
            options={chargeStatuses.map((status) => ({
              value: status,
              label: chargeStatus[status].label,
            }))}
          />
          <DateRangeFilter field="due" label="Due date" />
          <RangeFilter
            field="amount"
            label="Amount"
            format="money"
            unit="kr"
            histogram={bins.length > 1 ? bins : undefined}
          />
          <TextFilter field="kid" label="KID" numeric />
          <TextFilter field="agreement" label="Agreement ID" />
          <TextFilter field="charge" label="Charge ID" />
        </FilterBar>
      }
    >
      {opened && (
        <RowDialog
          title={`${formatMoney(opened.amountNOK)} from ${donorOf(opened)}`}
          subtitle={`Charge ${opened.chargeID} · due ${formatDate(opened.dueDate)}`}
          onClose={() => setOpenKey(null)}
          actions={canRefund(opened) && <RefundChargeDialog charge={opened} />}
        >
          <ChargeDetails charge={opened} />
        </RowDialog>
      )}
      {query.isError ? (
        <div className="px-4 sm:px-6">
          <ErrorState
            error={query.error}
            title="Couldn't load charges"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <DataTable
          label="Vipps charges"
          columns={columns}
          data={rows}
          rowCount={stats?.numCharges}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={keyOf}
          {...list.tableState}
          // A charge has no page of its own: its details and Refund open in a dialog.
          onRowOpen={(row) => setOpenKey(keyOf(row))}
          pageHotkeys
          empty={
            <ListEmpty
              list={list}
              noun="charges"
              hint="Charges appear here when Vipps charges a monthly agreement."
            />
          }
          summary={
            stats && (
              <TableSummary
                items={[
                  { value: <Num value={stats.numCharges} />, suffix: "charges" },
                  { label: "Total", value: <Money value={stats.sumCharges} /> },
                  { label: "Average", value: <Money value={stats.avgCharge} /> },
                ]}
              />
            )
          }
        />
      )}
    </ListPage>
  );
}

function ChargeDetails({ charge }: { charge: ChargeRow }) {
  return (
    <>
      <PropertyList labelWidth="7rem">
        <Property label="Status">
          <Status catalog={chargeStatus} value={charge.status as keyof typeof chargeStatus} />
        </Property>
        <Property label="Amount">
          <Money value={charge.amountNOK} className="font-semibold" />
        </Property>
        <Property label="Due">
          <DateTime value={charge.dueDate} />
        </Property>
        <Property label="Donor">{charge.full_name}</Property>
        <Property label="Agreement">
          <Link
            to="/agreements/$provider/$id"
            params={{ provider: "vipps", id: charge.agreementID }}
            className="text-accent hover:underline focus-ring rounded-xs"
          >
            {charge.agreementID}
          </Link>
        </Property>
        <Property label="KID">
          <CopyValue value={charge.KID} label="KID" />
        </Property>
        <Property label="Charge ID">
          <CopyValue value={charge.chargeID} label="charge ID" />
        </Property>
        <Property label="Type">{charge.type ?? "–"}</Property>
        <Property label="Created">
          <DateTime value={charge.timestamp_created} format="datetime" />
        </Property>
      </PropertyList>
      {!canRefund(charge) && (
        <Callout>
          Only charged money can be refunded. This charge is{" "}
          {chargeStatus[charge.status as keyof typeof chargeStatus]?.label.toLowerCase() ??
            charge.status}
          .
        </Callout>
      )}
    </>
  );
}

/** Refunds a charge in full through Vipps. Typed confirmation with the amount. */
function RefundChargeDialog({ charge }: { charge: ChargeRow }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refund = useMutation(trpc.vipps.charges.refund.mutationOptions(unbatched));
  const amount = formatMoney(charge.amountNOK);
  return (
    <ConfirmDialog
      tone="danger"
      trigger={
        <Button size="sm">
          <Undo2Icon />
          Refund…
        </Button>
      }
      title={`Refund ${amount} to ${donorOf(charge)}?`}
      description={`Charge ${charge.chargeID} on agreement ${charge.agreementID}, due ${formatDate(
        charge.dueDate,
      )}.`}
      consequences={[
        `Vipps pays ${amount} back to the donor. This can't be undone.`,
        "The charge is marked refunded.",
        "The donation registered for this charge is not changed; correct or delete it separately.",
      ]}
      confirmText={String(charge.amountNOK)}
      confirmLabel={`Refund ${amount}`}
      onConfirm={async () => {
        await refund.mutateAsync({ agreementId: charge.agreementID, chargeId: charge.chargeID });
        await queryClient.invalidateQueries({ queryKey: trpc.vipps.pathKey() });
        notify.success(`Refunded ${amount}`, donorOf(charge));
      }}
    />
  );
}
