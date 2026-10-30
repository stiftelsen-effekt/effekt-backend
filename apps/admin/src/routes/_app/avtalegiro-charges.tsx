import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type MouseEvent, type ReactNode } from "react";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { Callout } from "@/components/domain/callout";
import { CopyValue } from "@/components/domain/copy-value";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Status } from "@/components/domain/status";
import {
  BooleanFilter,
  DateRangeFilter,
  FilterBar,
  ListEmpty,
  OptionsFilter,
  RangeFilter,
  SavedViews,
  TextFilter,
  useListState,
} from "@/components/filters";
import { usePanels } from "@/components/panels";
import { ListPage, RowDialog } from "@/components/templates";
import {
  avtaleGiroChargesList,
  describeCharge,
  isOverdue,
  statusCounts,
  toAvtaleGiroChargeFilter,
  type AvtaleGiroChargeRow,
  type AvtaleGiroChargeSummary,
} from "@/features/agreements/avtalegiro-charges";
import { osloDay } from "@/lib/dates";
import { formatDate, formatMoney } from "@/lib/format";
import { nextPage, usePageQuery } from "@/lib/query";
import { avtaleGiroChargeStatus } from "@/lib/status";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/avtalegiro-charges")({
  validateSearch: avtaleGiroChargesList.validateSearch,
  component: AvtaleGiroChargesPage,
});

const col = createColumns<AvtaleGiroChargeRow>();
const columns = col.columns([
  col.accessor("dueDate", {
    header: "Due",
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("donorName", {
    header: "Donor",
    meta: { cellClassName: "font-semibold max-w-56 truncate" },
    cell: ({ getValue }) => getValue() ?? "–",
  }),
  col.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => <Status catalog={avtaleGiroChargeStatus} value={getValue()} />,
  }),
  col.accessor("amount", {
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
  col.accessor("agreementId", {
    header: "Agreement",
    enableSorting: false,
    meta: { cellClassName: "num text-muted-foreground" },
  }),
  col.accessor("donationId", {
    header: "Donation",
    enableSorting: false,
    meta: { cellClassName: "num text-muted-foreground" },
    cell: ({ getValue }) => getValue() ?? "–",
  }),
  col.accessor("shipmentId", {
    header: "Shipment",
    enableSorting: false,
    meta: { cellClassName: "num text-muted-foreground" },
  }),
  col.accessor("created", {
    header: "Sent",
    meta: { label: "Sent" },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

const donorOf = (row: AvtaleGiroChargeRow) => row.donorName ?? "an unnamed donor";

function AvtaleGiroChargesPage() {
  const trpc = useTRPC();
  const list = useListState(avtaleGiroChargesList);
  const [openId, setOpenId] = useState<number | null>(null);

  const filter = toAvtaleGiroChargeFilter(list.filters);
  const sort = { id: list.sort.id, desc: list.sort.desc };
  const listOptions = (page: number) =>
    trpc.giro.avtalegiro.charges.list.queryOptions({
      page: page - 1,
      limit: list.pageSize,
      sort,
      filter,
    });
  const query = usePageQuery(listOptions(list.page), {
    prefetch: (data) => nextPage(list.page, data.pages, listOptions),
  });

  const rows = query.data?.rows;
  const summary = query.data?.summary;
  const opened = openId != null ? rows?.find((row) => row.id === openId) : undefined;

  return (
    <ListPage
      title="AvtaleGiro charges"
      description="Claims sent to the bank, one per agreement and due date, and what became of each."
      filters={
        <FilterBar
          list={list}
          searchPlaceholder="Donor name or KID"
          end={<SavedViews list={list} />}
        >
          <OptionsFilter
            field="status"
            label="Status"
            options={statusCounts(summary).map(({ status, count }) => ({
              value: status,
              label: avtaleGiroChargeStatus[status].label,
              count,
            }))}
          />
          <DateRangeFilter field="due" label="Due date" />
          <RangeFilter field="amount" label="Amount" format="money" unit="kr" />
          <BooleanFilter
            field="matched"
            label="Payment"
            trueLabel="Matched to a donation"
            falseLabel="No donation"
          />
          <TextFilter field="kid" label="KID" numeric />
          <TextFilter field="agreement" label="Agreement ID" numeric />
          <TextFilter field="donor" label="Donor ID" numeric />
          <TextFilter field="shipment" label="Shipment" numeric />
        </FilterBar>
      }
    >
      {opened && (
        <RowDialog
          title={`${formatMoney(opened.amount)} from ${donorOf(opened)}`}
          subtitle={`AvtaleGiro claim ${opened.id} · due ${formatDate(opened.dueDate)}`}
          onClose={() => setOpenId(null)}
        >
          <ChargeDetails charge={opened} onLeave={() => setOpenId(null)} />
        </RowDialog>
      )}
      {query.isError ? (
        <div className="px-4 sm:px-6">
          <ErrorState
            error={query.error}
            title="Couldn't load AvtaleGiro charges"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <DataTable
          label="AvtaleGiro charges"
          columns={columns}
          data={rows}
          rowCount={summary?.count}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => String(row.id)}
          {...list.tableState}
          // A charge has no page of its own: its details open in a dialog.
          onRowOpen={(row) => setOpenId(row.id)}
          pageHotkeys
          empty={
            <ListEmpty
              list={list}
              noun="charges"
              hint="A charge is recorded for each agreement when the daily claims run sends it to the bank."
            />
          }
          summary={summary && <ChargesSummary summary={summary} statuses={filter?.statuses} />}
        />
      )}
    </ListPage>
  );
}

/**
 * Count and total for the filter (whole kroner: a glanceable aggregate), then the count per
 * status among the statuses the filter lets through.
 */
function ChargesSummary({
  summary,
  statuses,
}: {
  summary: AvtaleGiroChargeSummary;
  statuses: readonly string[] | undefined;
}) {
  const perStatus = summary.byStatus.filter(
    (row) => row.count > 0 && (!statuses || statuses.includes(row.status)),
  );
  return (
    <TableSummary
      items={[
        {
          value: <Num value={summary.count} />,
          suffix: summary.count === 1 ? "charge" : "charges",
        },
        { label: "Total", value: <Money value={summary.sum} precision="whole" /> },
        ...perStatus.map((row) => ({
          label: avtaleGiroChargeStatus[row.status].label,
          value: <Num value={row.count} />,
        })),
      ]}
    />
  );
}

const linkClass = "num text-accent hover:underline focus-ring rounded-xs";

/**
 * Record links in the dialog open their record as a panel over the list (closing the dialog),
 * like links inside a panel; modified clicks still open a new tab.
 */
function usePanelClick(onOpened: () => void) {
  const panels = usePanels();
  return (href: string) => (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (panels?.open(href)) {
      event.preventDefault();
      onOpened();
    }
  };
}

function ChargeDetails({
  charge,
  onLeave,
}: {
  charge: AvtaleGiroChargeRow;
  /** A link opened a panel */
  onLeave: () => void;
}) {
  const today = osloDay();
  const asPanel = usePanelClick(onLeave);
  const overdue = isOverdue(charge, today);
  const optional = (value: number | null, render: (value: number) => ReactNode) =>
    value == null ? "–" : render(value);
  return (
    <>
      <PropertyList labelWidth="8rem">
        <Property label="Status">
          <Status catalog={avtaleGiroChargeStatus} value={charge.status} />
        </Property>
        <Property label="Amount">
          <Money value={charge.amount} className="font-semibold" />
        </Property>
        <Property label="Due">
          <DateTime value={charge.dueDate} />
        </Property>
        <Property label="Donor">
          {optional(charge.donorId, (id) => (
            <Link
              to="/donors/$id"
              params={{ id: String(id) }}
              className={linkClass}
              onClick={asPanel(`/donors/${id}`)}
            >
              {charge.donorName ?? `Donor #${id}`}
            </Link>
          ))}
        </Property>
        <Property label="Agreement">
          <Link
            to="/agreements/$provider/$id"
            params={{ provider: "avtalegiro", id: String(charge.agreementId) }}
            className={linkClass}
            onClick={asPanel(`/agreements/avtalegiro/${charge.agreementId}`)}
          >
            {charge.agreementId}
          </Link>
        </Property>
        <Property label="KID">
          <CopyValue value={charge.KID} label="KID" />
        </Property>
        <Property label="Donation">
          {optional(charge.donationId, (id) => (
            <Link
              to="/donations/$id"
              params={{ id: String(id) }}
              className={linkClass}
              onClick={asPanel(`/donations/${id}`)}
            >
              #{id}
            </Link>
          ))}
        </Property>
        <Property label="Shipment">
          <CopyValue value={charge.shipmentId} label="shipment ID" />
        </Property>
        {charge.deletionShipmentId != null && (
          <Property label="Deletion shipment">
            <CopyValue value={charge.deletionShipmentId} label="deletion shipment ID" />
          </Property>
        )}
        <Property label="Sent">
          <DateTime value={charge.created} format="datetime" />
        </Property>
        <Property label="Last updated">
          <DateTime value={charge.lastUpdated} format="datetime" />
        </Property>
      </PropertyList>
      <Callout tone={overdue ? "warning" : undefined}>{describeCharge(charge, today)}</Callout>
      {overdue && (
        <p className="text-sm">
          <Link
            to="/avtalegiro-check"
            search={{ date: charge.dueDate }}
            className="text-accent hover:underline focus-ring rounded-xs"
          >
            Open the AvtaleGiro check for {formatDate(charge.dueDate)}
          </Link>
        </p>
      )}
    </>
  );
}
