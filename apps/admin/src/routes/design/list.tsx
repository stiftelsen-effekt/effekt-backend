import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DownloadIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import {
  createColumns,
  DataTable,
  TableSummary,
  type RowSelectionState,
} from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { DateTime, Money, Num } from "@/components/domain/format";
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
import { ListPage } from "@/components/templates";
import { Button } from "@/components/ui/button";
import {
  donationAmountEdges,
  donations,
  paymentMethods,
  type DonationStats,
  type FakeDonation,
} from "@/design-system/fake-data";
import { averageMoney, compareMoney, medianMoney, moneyToNumber, sumMoney } from "@/lib/money";
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
      (filters.amount?.min === undefined || compareMoney(row.sum, filters.amount.min) >= 0) &&
      (filters.amount?.max === undefined || compareMoney(row.sum, filters.amount.max) <= 0) &&
      (!filters.date?.from || row.timestamp.slice(0, 10) >= filters.date.from) &&
      (!filters.date?.to || row.timestamp.slice(0, 10) <= filters.date.to) &&
      (!filters.method?.length || filters.method.includes(row.methodId)),
  );
  const dir = sort.desc ? -1 : 1;
  const ascending = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);
  // Amounts are decimal strings: compare them as money, not as text.
  const compare: (a: FakeDonation, b: FakeDonation) => number =
    sort.id === "sum"
      ? (a, b) => compareMoney(a.sum, b.sum)
      : sort.id === "donor"
        ? (a, b) => ascending(a.donor, b.donor)
        : sort.id === "id"
          ? (a, b) => a.id - b.id
          : (a, b) => ascending(a.timestamp, b.timestamp);
  const sorted = [...rows].sort((a, b) => dir * compare(a, b));
  const sums = rows.map((row) => row.sum);
  const statistics: DonationStats & { median: string } = {
    numDonations: rows.length,
    sumDonations: sumMoney(sums),
    avgDonation: averageMoney(sums),
    median: medianMoney(sums),
  };
  return {
    rows: sorted.slice((page - 1) * size, page * size),
    total: rows.length,
    statistics,
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
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("kid", {
    header: "KID",
    enableSorting: false,
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
]);

const amountBins = binValues(
  donations.map((row) => moneyToNumber(row.sum)),
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

  const query = useQuery({
    queryKey: ["design-donations", list.filters, list.sort, list.page, list.pageSize],
    queryFn: () => fetchDonations(list.filters, list.sort, list.page, list.pageSize),
    placeholderData: keepPreviousData,
  });
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
        onRowOpen={(row) =>
          void navigate({ to: "/design/donations/$id", params: { id: String(row.id) } })
        }
        getRowHref={(row) => `/design/donations/${row.id}`}
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
