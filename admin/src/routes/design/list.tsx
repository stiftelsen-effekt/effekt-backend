import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format as formatDateFns, parseISO } from "date-fns";
import { DownloadIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  createColumns,
  DataTable,
  type RowSelectionState,
  type SortingState,
} from "@/components/data-table";
import { DateTime, Money } from "@/components/domain/format";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  ActiveFilterChips,
  binValues,
  DateRangeFilter,
  ExportButton,
  FilterPanel,
  FilterPanelTrigger,
  FilterStats,
  HistogramRangeFilter,
  MultiSelectFilter,
  TextFilter,
  type ActiveFilter,
} from "@/components/filters";
import { Page, PageHeader } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import { appLocale } from "@/lib/locale";
import {
  amountEdges,
  donationStatuses,
  fakeDonations,
  median,
  paymentMethods,
  type FakeDonation,
} from "@/design-system/fake-data";

const sortableColumns = ["id", "donor", "amount", "timestamp", "method"] as const;

const searchSchema = z.object({
  page: z.number().int().min(1).optional().catch(undefined),
  size: z.number().int().min(10).max(250).optional().catch(undefined),
  sort: z.enum(sortableColumns).optional().catch(undefined),
  desc: z.boolean().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  min: z.number().optional().catch(undefined),
  max: z.number().optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  method: z.array(z.enum(paymentMethods)).optional().catch(undefined),
  status: z.array(z.enum(donationStatuses)).optional().catch(undefined),
});

type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/design/list")({
  validateSearch: searchSchema,
  component: DonationsDemo,
});

const DEFAULT_SORT = { sort: "timestamp" as const, desc: true };
const DEFAULT_SIZE = 50;

function applyFilters(rows: FakeDonation[], search: Search) {
  const q = search.q?.toLowerCase();
  return rows.filter(
    (row) =>
      (!q ||
        row.donor.toLowerCase().includes(q) ||
        row.kid.includes(q) ||
        String(row.id).includes(q)) &&
      (search.min === undefined || row.amount >= search.min) &&
      (search.max === undefined || row.amount <= search.max) &&
      (!search.from || row.timestamp.slice(0, 10) >= search.from) &&
      (!search.to || row.timestamp.slice(0, 10) <= search.to) &&
      (!search.method?.length || search.method.includes(row.method)) &&
      (!search.status?.length || search.status.includes(row.status)),
  );
}

/** Stand-in for a tRPC list procedure: filters, sorts and pages on the "server". */
async function fetchDonations(search: Search) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const filtered = applyFilters(fakeDonations, search);
  const key = search.sort ?? DEFAULT_SORT.sort;
  const dir = search.desc ?? (search.sort ? false : DEFAULT_SORT.desc) ? -1 : 1;
  const sorted = [...filtered].sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0));
  const size = search.size ?? DEFAULT_SIZE;
  const page = (search.page ?? 1) - 1;
  const amounts = filtered.map((row) => row.amount);
  const sum = amounts.reduce((total, value) => total + value, 0);
  return {
    rows: sorted.slice(page * size, page * size + size),
    total: filtered.length,
    stats: { sum, average: amounts.length ? sum / amounts.length : 0, median: median(amounts) },
  };
}

const col = createColumns<FakeDonation>();

const columns = col.columns([
  col.accessor("id", {
    header: "ID",
    meta: { numeric: true, cellClassName: "text-muted-foreground" },
  }),
  col.accessor("donor", {
    header: "Donor",
    cell: ({ row }) => (
      <div className="grid leading-tight">
        <span className="font-semibold">{row.original.donor}</span>
        <span className="text-xs text-muted-foreground">{row.original.email}</span>
      </div>
    ),
  }),
  col.accessor("method", {
    header: "Method",
    cell: ({ getValue }) => <Badge variant="outline">{getValue()}</Badge>,
  }),
  col.accessor("amount", {
    header: "Sum",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("fee", {
    header: "Fee",
    enableSorting: false,
    meta: { numeric: true, cellClassName: "text-muted-foreground" },
    cell: ({ getValue }) => <Money value={getValue()} decimals={2} />,
  }),
  col.accessor("kid", {
    header: "KID",
    enableSorting: false,
    meta: { cellClassName: "num text-muted-foreground" },
  }),
  col.accessor("status", {
    header: "Status",
    enableSorting: false,
    cell: ({ getValue }) => <StatusBadge status={getValue()} />,
  }),
  col.accessor("timestamp", {
    header: "Date",
    meta: { numeric: true },
    cell: ({ getValue }) => <DateTime value={getValue()} format="datetime" />,
  }),
]);

const amountBins = binValues(
  fakeDonations.map((row) => row.amount),
  amountEdges,
);

function DonationsDemo() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selection, setSelection] = useState<RowSelectionState>({});

  const setSearch = (patch: Partial<Search>, resetPage = true) =>
    void navigate({
      search: (prev) => ({ ...prev, ...patch, ...(resetPage ? { page: undefined } : {}) }),
      replace: true,
    });

  const query = useQuery({
    queryKey: ["design-donations", search],
    queryFn: () => fetchDonations(search),
    placeholderData: keepPreviousData,
  });

  const sorting: SortingState = [
    {
      id: search.sort ?? DEFAULT_SORT.sort,
      desc: search.desc ?? (search.sort ? false : DEFAULT_SORT.desc),
    },
  ];
  const pagination = { pageIndex: (search.page ?? 1) - 1, pageSize: search.size ?? DEFAULT_SIZE };

  const methodCounts = useMemo(() => countBy(fakeDonations, "method"), []);
  const statusCounts = useMemo(() => countBy(fakeDonations, "status"), []);

  const dateRange =
    search.from || search.to
      ? {
          from: search.from ? parseISO(search.from) : undefined,
          to: search.to ? parseISO(search.to) : undefined,
        }
      : undefined;

  const candidates: Array<ActiveFilter | false | "" | undefined> = [
    search.q && { id: "q", label: `“${search.q}”`, onRemove: () => setSearch({ q: undefined }) },
    (search.min !== undefined || search.max !== undefined) && {
      id: "amount",
      label: `Sum ${search.min !== undefined ? formatMoney(search.min) : "…"} – ${
        search.max !== undefined ? formatMoney(search.max) : "…"
      }`,
      onRemove: () => setSearch({ min: undefined, max: undefined }),
    },
    dateRange && {
      id: "date",
      label: `${search.from ? formatDate(search.from) : "…"} – ${
        search.to ? formatDate(search.to) : "…"
      }`,
      onRemove: () => setSearch({ from: undefined, to: undefined }),
    },
    ...(search.method ?? []).map((method) => ({
      id: `method-${method}`,
      label: method,
      onRemove: () => setSearch({ method: search.method?.filter((m) => m !== method) }),
    })),
    ...(search.status ?? []).map((status) => ({
      id: `status-${status}`,
      label: status.charAt(0) + status.slice(1).toLowerCase(),
      onRemove: () => setSearch({ status: search.status?.filter((s) => s !== status) }),
    })),
  ];
  const active = candidates.filter((filter): filter is ActiveFilter => Boolean(filter));

  const reset = () =>
    void navigate({
      search: { sort: search.sort, desc: search.desc, size: search.size },
      replace: true,
    });

  const selectedCount = Object.keys(selection).length;
  const stats = query.data?.stats;

  return (
    <Page
      aside={
        <FilterPanel
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          activeFilters={active}
          onReset={reset}
          stats={
            <FilterStats
              items={[
                {
                  label: "Donations",
                  value: query.data ? query.data.total.toLocaleString(appLocale.intl) : "–",
                },
                { label: "Median", value: <Money value={stats?.median} /> },
                { label: "Average", value: <Money value={stats?.average} /> },
                { label: "Sum", value: <Money value={stats?.sum} />, emphasis: true },
              ]}
            />
          }
          actions={
            <ExportButton
              rowCount={query.data?.total}
              disabled={!query.data?.total}
              onExport={() =>
                toast.success("Export started", { description: `${query.data?.total} rows to CSV` })
              }
            />
          }
        >
          <TextFilter
            label="Search"
            placeholder="Donor, KID or ID"
            value={search.q}
            onChange={(q) => setSearch({ q })}
          />
          <HistogramRangeFilter
            label="Sum"
            unit="kr"
            bins={amountBins}
            value={{ min: search.min, max: search.max }}
            onChange={({ min, max }) => setSearch({ min, max })}
          />
          <DateRangeFilter
            label="Date"
            value={dateRange}
            onChange={(range) =>
              setSearch({
                from: range?.from ? formatDateFns(range.from, "yyyy-MM-dd") : undefined,
                to: range?.to ? formatDateFns(range.to, "yyyy-MM-dd") : undefined,
              })
            }
          />
          <MultiSelectFilter
            label="Payment method"
            options={paymentMethods.map((m) => ({ value: m, label: m, count: methodCounts[m] }))}
            value={search.method ?? []}
            onChange={(method) =>
              setSearch({ method: method.length ? (method as Search["method"]) : undefined })
            }
          />
          <MultiSelectFilter
            label="Status"
            options={donationStatuses.map((s) => ({
              value: s,
              label: s.charAt(0) + s.slice(1).toLowerCase(),
              count: statusCounts[s],
            }))}
            value={search.status ?? []}
            onChange={(status) =>
              setSearch({ status: status.length ? (status as Search["status"]) : undefined })
            }
          />
        </FilterPanel>
      }
    >
      <PageHeader
        title="Donations"
        eyebrow="Demo list page"
        subtitle="Fake data behind a simulated server query. Filters, sorting and paging live in the URL."
      />
      <DataTable
        columns={columns}
        data={query.data?.rows}
        rowCount={query.data?.total}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        getRowId={(row) => String(row.id)}
        sorting={sorting}
        onSortingChange={(next) => {
          const first = next[0];
          setSearch({
            sort: first ? (first.id as Search["sort"]) : undefined,
            desc: first ? first.desc : undefined,
          });
        }}
        pagination={pagination}
        onPaginationChange={({ pageIndex, pageSize }) =>
          setSearch(
            {
              page: pageIndex === 0 ? undefined : pageIndex + 1,
              size: pageSize === DEFAULT_SIZE ? undefined : pageSize,
            },
            false,
          )
        }
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        onRowClick={(row) => void navigate({ to: "/design/detail", search: { id: row.donorId } })}
        toolbar={
          selectedCount > 0 ? (
            <div className="flex items-center gap-2 rounded-sm bg-primary py-0.5 pr-0.5 pl-3 text-sm text-primary-foreground">
              <span className="num font-semibold">{selectedCount} selected</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => toast.success(`Exported ${selectedCount} donations`)}
              >
                <DownloadIcon />
                Export
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Clear selection"
                className="text-primary-foreground hover:bg-primary-foreground/15"
                onClick={() => setSelection({})}
              >
                <XIcon />
              </Button>
            </div>
          ) : (
            <>
              <FilterPanelTrigger count={active.length} onClick={() => setFiltersOpen(true)} />
              <ActiveFilterChips filters={active} />
            </>
          )
        }
      />
    </Page>
  );
}

function countBy<T, K extends keyof T>(rows: T[], key: K) {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[String(row[key])] = (counts[String(row[key])] ?? 0) + 1;
  return counts;
}
