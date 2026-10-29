import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRightIcon, InboxIcon, UploadIcon } from "lucide-react";
import {
  createColumns,
  DataTable,
  TableSummary,
  type RowSelectionState,
} from "@/components/data-table";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { FilterBar, OptionsFilter, useListState } from "@/components/filters";
import { defineList, param } from "@/components/filters/list-state";
import { ListPage } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { BulkIgnoreActions } from "@/features/review-queue/bulk-ignore";
import {
  queueSources,
  reviewStatuses,
  reasonText,
  sourceLabel,
  type ReviewItem,
} from "@/features/review-queue/model";
import { reviewStatus } from "@/lib/status";
import { nextPage, usePageQuery } from "@/lib/query";
import { useTRPC } from "@/lib/trpc";

const reviewList = defineList({
  id: "review-queue",
  filters: { status: param.list(reviewStatuses), source: param.list(queueSources) },
  sortable: ["id", "created", "date", "amount", "source", "status"],
  defaultSort: { id: "id", desc: false },
});

export const Route = createFileRoute("/_app/import/review/")({
  // The queue opens on what still needs a decision; clearing the status filter returns here.
  validateSearch: (raw: Record<string, unknown>) =>
    reviewList.validateSearch({ ...raw, status: raw.status ?? "open" }),
  component: ReviewQueuePage,
});

const col = createColumns<ReviewItem>();
const columns = col.columns([
  col.accessor("id", {
    header: "ID",
    meta: { numeric: true, cellClassName: "text-muted-foreground w-16" },
  }),
  col.accessor("date", {
    header: "Paid",
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("amount", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("source", {
    header: "Source",
    cell: ({ getValue }) => sourceLabel(getValue()),
  }),
  col.accessor("name", {
    header: "Payer",
    enableSorting: false,
    meta: { cellClassName: "max-w-48 truncate" },
    cell: ({ getValue }) => getValue() ?? <span className="text-faint-foreground">–</span>,
  }),
  col.accessor("KID", {
    header: "KID",
    enableSorting: false,
    cell: ({ getValue }) => {
      const kid = getValue();
      return kid ? (
        <span className="num">{kid}</span>
      ) : (
        <span className="text-faint-foreground">–</span>
      );
    },
  }),
  col.accessor("reason", {
    header: "Reason",
    enableSorting: false,
    meta: { cellClassName: "text-muted-foreground max-w-64 truncate" },
    cell: ({ getValue }) => reasonText(getValue()),
  }),
  col.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => <Status catalog={reviewStatus} value={getValue()} />,
  }),
]);

function ReviewQueuePage() {
  const list = useListState(reviewList);
  const trpc = useTRPC();
  const navigate = useNavigate();
  const sources = list.filters.source;
  // Ticked rows, for ignoring several at once (e.g. a report uploaded by mistake)
  const [selection, setSelection] = useState<RowSelectionState>({});

  const listOptions = (page: number) =>
    trpc.reports.reviewQueue.list.queryOptions({
      page: page - 1,
      limit: list.pageSize,
      sort: { id: list.sort.id, desc: list.sort.desc },
      filter: { statuses: list.filters.status, sources },
    });
  const query = usePageQuery(listOptions(list.page), {
    // The next page is fetched as soon as this one is in, so paging forward is instant.
    prefetch: (data) => nextPage(list.page, data.pages, listOptions),
  });
  // Where "Start reviewing" begins: the oldest open item in the source filter.
  const firstOpen = usePageQuery(
    trpc.reports.reviewQueue.list.queryOptions({
      page: 0,
      limit: 1,
      sort: { id: "id", desc: false },
      filter: { statuses: ["open"], sources },
    }),
  );
  const counts = query.data?.counts;
  const firstOpenId = firstOpen.data?.rows[0]?.id;
  const sourceSearch = sources?.join(",");
  const workbenchSearch = { source: sourceSearch };

  const openItem = (row: ReviewItem) =>
    void navigate({
      to: "/import/review/$id",
      params: { id: String(row.id) },
      search: workbenchSearch,
    });

  return (
    <ListPage
      title="Review queue"
      description="Transactions from imported payment reports that could not be registered automatically. Shared by the team."
      actions={
        <>
          <Button asChild>
            <Link to="/import">
              <UploadIcon />
              Import payments
            </Link>
          </Button>
          {firstOpenId != null && (
            <Button variant="primary" asChild>
              <Link
                to="/import/review/$id"
                params={{ id: String(firstOpenId) }}
                search={workbenchSearch}
              >
                Review <Num value={firstOpen.data?.counts.open ?? 0} /> open
                <ArrowRightIcon />
              </Link>
            </Button>
          )}
        </>
      }
      filters={
        <FilterBar list={list} searchField={null}>
          <OptionsFilter
            field="status"
            label="Status"
            options={reviewStatuses.map((status) => ({
              value: status,
              label: reviewStatus[status].label,
              count: counts?.[status],
            }))}
          />
          <OptionsFilter
            field="source"
            label="Source"
            options={queueSources.map((source) => ({ value: source, label: sourceLabel(source) }))}
          />
        </FilterBar>
      }
    >
      {query.error ? (
        <div className="px-4 sm:px-6">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : (
        <DataTable
          label="Review queue"
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
            <BulkIgnoreActions
              selectedIds={ids}
              rows={query.data?.rows}
              onDone={() => setSelection({})}
            />
          )}
          onRowOpen={openItem}
          getRowHref={(row) =>
            `/import/review/${row.id}${sourceSearch ? `?source=${sourceSearch}` : ""}`
          }
          pageHotkeys
          summary={
            counts && (
              <TableSummary
                items={reviewStatuses.map((status) => ({
                  value: <Num value={counts[status]} />,
                  suffix: reviewStatus[status].label.toLowerCase(),
                }))}
              />
            )
          }
          empty={
            <EmptyState
              icon={InboxIcon}
              title={
                list.filters.status?.length === 1 && list.filters.status[0] === "open"
                  ? "Nothing to review"
                  : "No items match"
              }
              description={
                list.filters.status?.length === 1 && list.filters.status[0] === "open"
                  ? "Every imported transaction has been registered or ignored. New ones arrive when a payment report is imported."
                  : "Try another status or source."
              }
              action={
                <Button asChild>
                  <Link to="/import">Import payments</Link>
                </Button>
              }
            />
          }
        />
      )}
    </ListPage>
  );
}
