import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DownloadIcon, MailIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import {
  createColumns,
  DataTable,
  TableSummary,
  type RowSelectionState,
} from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import {
  binValues,
  DateRangeFilter,
  defineList,
  FilterBar,
  OptionsFilter,
  param,
  RangeFilter,
  SavedViews,
  useListState,
  type FilterValues,
} from "@/components/filters";
import { ListPage, PeekPanel } from "@/components/templates";
import { Button } from "@/components/ui/button";
import {
  donationAmountEdges,
  donations,
  median,
  paymentMethods,
  type FakeDonation,
} from "@/design-system/fake-data";
import { notify } from "@/lib/notify";
import { strings } from "@/lib/strings";

const donationsList = defineList({
  id: "design-donations",
  filters: {
    q: param.text,
    amount: param.range,
    date: param.dateRange,
    method: param.numberList,
  },
  sortable: ["timestamp", "sum", "donor", "id"],
  defaultSort: { id: "timestamp", desc: true },
});

export const Route = createFileRoute("/design/list")({
  validateSearch: donationsList.validateSearch,
  component: DonationsDemo,
});

type Filters = FilterValues<typeof donationsList.filters>;

/** Stand-in for trpc.donations.list: filters, sorts and pages on the "server". */
async function fetchDonations(
  filters: Filters,
  sort: { id: string; desc: boolean },
  page: number,
  size: number,
) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const q = filters.q?.toLowerCase();
  const rows = donations.filter(
    (row) =>
      (!q || row.donor.toLowerCase().includes(q) || row.kid.includes(q) || String(row.id) === q) &&
      (filters.amount?.min === undefined || row.sum >= filters.amount.min) &&
      (filters.amount?.max === undefined || row.sum <= filters.amount.max) &&
      (!filters.date?.from || row.timestamp.slice(0, 10) >= filters.date.from) &&
      (!filters.date?.to || row.timestamp.slice(0, 10) <= filters.date.to) &&
      (!filters.method?.length || filters.method.includes(row.methodId)),
  );
  const key =
    sort.id === "sum"
      ? "sum"
      : sort.id === "donor"
      ? "donor"
      : sort.id === "id"
      ? "id"
      : "timestamp";
  const dir = sort.desc ? -1 : 1;
  const sorted = [...rows].sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0));
  const sums = rows.map((row) => row.sum);
  const total = sums.reduce((a, b) => a + b, 0);
  return {
    rows: sorted.slice((page - 1) * size, page * size),
    total: rows.length,
    statistics: {
      numDonations: rows.length,
      sumDonations: total,
      avgDonation: rows.length ? total / rows.length : 0,
      median: median(sums),
    },
  };
}

const col = createColumns<FakeDonation>();
const columns = col.columns([
  col.accessor("id", {
    header: "ID",
    meta: { numeric: true, cellClassName: "text-muted-foreground w-20" },
  }),
  col.accessor("timestamp", {
    header: "Date",
    cell: ({ getValue }) => <DateTime value={getValue()} format="datetime" />,
  }),
  col.accessor("donor", {
    header: "Donor",
    meta: { cellClassName: "font-semibold max-w-56 truncate" },
  }),
  col.accessor("paymentMethod", { header: "Method", enableSorting: false }),
  col.accessor("sum", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("transactionCost", {
    header: "Fee",
    enableSorting: false,
    meta: { numeric: true, cellClassName: "text-muted-foreground" },
    cell: ({ getValue }) => <Money value={getValue()} decimals={2} />,
  }),
  col.accessor("kid", {
    header: "KID",
    enableSorting: false,
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
]);

const amountBins = binValues(
  donations.map((row) => row.sum),
  donationAmountEdges,
);
const methodOptions = paymentMethods.map((method) => ({
  value: method.id,
  label: method.name,
  count: donations.filter((d) => d.methodId === method.id).length,
}));

function DonationsDemo() {
  const list = useListState(donationsList);
  const navigate = useNavigate();
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [peekId, setPeekId] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ["design-donations", list.filters, list.sort, list.page, list.pageSize],
    queryFn: () => fetchDonations(list.filters, list.sort, list.page, list.pageSize),
    placeholderData: keepPreviousData,
  });
  const peeked = peekId != null ? donations.find((d) => d.id === peekId) : undefined;
  const stats = query.data?.statistics;

  return (
    <ListPage
      title="Donations"
      actions={
        <>
          <Button
            onClick={() =>
              notify.success("Export started", `${query.data?.total ?? 0} donations to CSV`)
            }
          >
            <DownloadIcon />
            {strings.actions.export}
          </Button>
          <Button variant="primary">
            <PlusIcon />
            Register donation
          </Button>
        </>
      }
      filters={
        <FilterBar
          list={list}
          searchPlaceholder="Donor, KID or donation ID"
          end={<SavedViews list={list} />}
        >
          <DateRangeFilter field="date" label="Date" />
          <RangeFilter
            field="amount"
            label="Amount"
            format="money"
            unit="kr"
            histogram={amountBins}
          />
          <OptionsFilter field="method" label="Payment method" options={methodOptions} />
        </FilterBar>
      }
      peek={
        peeked && (
          <PeekPanel
            title={<Money value={peeked.sum} />}
            subtitle={`Donation #${peeked.id} · ${peeked.donor}`}
            href="/design/detail"
            onClose={() => setPeekId(null)}
            actions={
              <Button size="sm" onClick={() => notify.success("Receipt sent", peeked.email)}>
                <MailIcon />
                Resend receipt
              </Button>
            }
          >
            <PropertyList>
              <Property label="Donor">
                <Link to="/design/detail" className="font-semibold text-accent hover:underline">
                  {peeked.donor}
                </Link>
              </Property>
              <Property label="Email">{peeked.email}</Property>
              <Property label="Date">
                <DateTime value={peeked.timestamp} format="datetime" />
              </Property>
              <Property label="Method">{peeked.paymentMethod}</Property>
              <Property label="Fee">
                <Money value={peeked.transactionCost} decimals={2} />
              </Property>
              <Property label="KID">
                <CopyValue value={peeked.kid} label="KID" />
              </Property>
              <Property label="Donation ID">
                <CopyValue value={peeked.id} label="donation ID" />
              </Property>
            </PropertyList>
          </PeekPanel>
        )
      }
    >
      <DataTable
        label="Donations"
        columns={columns}
        data={query.data?.rows}
        rowCount={query.data?.total}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        getRowId={(row) => String(row.id)}
        {...list.tableState}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        selectionActions={(ids) => (
          <Button size="sm" onClick={() => notify.success(`Exported ${ids.length} donations`)}>
            <DownloadIcon />
            Export selected
          </Button>
        )}
        onRowPeek={(row) => setPeekId(row.id)}
        onRowOpen={() => void navigate({ to: "/design/detail" })}
        peekedRowId={peekId != null ? String(peekId) : null}
        getRowHref={() => "/design/detail"}
        pageHotkeys
        summary={
          stats && (
            <TableSummary
              items={[
                { value: <Num value={stats.numDonations} />, suffix: "donations" },
                { label: "Sum", value: <Money value={stats.sumDonations} /> },
                { label: "Average", value: <Money value={stats.avgDonation} /> },
                { label: "Median", value: <Money value={stats.median} /> },
              ]}
            />
          )
        }
      />
    </ListPage>
  );
}
