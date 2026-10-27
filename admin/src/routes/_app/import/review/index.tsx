import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon, InboxIcon, UploadIcon } from "lucide-react";
import { useState } from "react";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { Callout } from "@/components/domain/callout";
import { CopyValue } from "@/components/domain/copy-value";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Status } from "@/components/domain/status";
import { defineList, FilterBar, OptionsFilter, param, useListState } from "@/components/filters";
import { ListPage, PeekPanel } from "@/components/templates";
import { Button } from "@/components/ui/button";
import {
  queueSources,
  reviewStatuses,
  reasonText,
  sourceLabel,
  type ReviewItem,
} from "@/features/review-queue/model";
import { reviewStatus } from "@/lib/status";
import { moneyDecimals } from "@/features/donations/form";
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
    cell: ({ getValue }) => <Money value={getValue()} decimals={moneyDecimals(getValue())} />,
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
  const [peekId, setPeekId] = useState<number | null>(null);
  const sources = list.filters.source;

  const query = useQuery({
    ...trpc.reports.reviewQueue.list.queryOptions({
      page: list.page - 1,
      limit: list.pageSize,
      sort: { id: list.sort.id, desc: list.sort.desc },
      filter: { statuses: list.filters.status, sources },
    }),
    placeholderData: keepPreviousData,
  });
  // Where "Start reviewing" begins: the oldest open item in the source filter.
  const firstOpen = useQuery({
    ...trpc.reports.reviewQueue.list.queryOptions({
      page: 0,
      limit: 1,
      sort: { id: "id", desc: false },
      filter: { statuses: ["open"], sources },
    }),
    placeholderData: keepPreviousData,
  });
  const counts = query.data?.counts;
  const firstOpenId = firstOpen.data?.rows[0]?.id;
  const sourceSearch = sources?.join(",");
  const workbenchSearch = { source: sourceSearch };
  const peeked = query.data?.rows.find((row) => row.id === peekId);

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
      peek={
        peeked && (
          <ReviewPeek
            row={peeked}
            href={`/import/review/${peeked.id}${sourceSearch ? `?source=${sourceSearch}` : ""}`}
            onClose={() => setPeekId(null)}
          />
        )
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
          onRowPeek={(row) => setPeekId(row.id)}
          onRowOpen={openItem}
          peekedRowId={peekId != null ? String(peekId) : null}
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

function ReviewPeek({
  row,
  href,
  onClose,
}: {
  row: ReviewItem;
  href: string;
  onClose: () => void;
}) {
  return (
    <PeekPanel
      title={<Money value={row.amount} decimals={moneyDecimals(row.amount)} />}
      subtitle={`${sourceLabel(row.source)} · item #${row.id}`}
      href={href}
      onClose={onClose}
    >
      <div className="grid gap-4">
        <Callout tone="warning" title={reasonText(row.reason)} />
        <PropertyList labelWidth="6rem">
          <Property label="Status">
            <Status catalog={reviewStatus} value={row.status} />
          </Property>
          <Property label="Paid">
            <DateTime value={row.date} format="datetime" />
          </Property>
          <Property label="Payer">{row.name}</Property>
          <Property label="Message">{row.message && <q>{row.message}</q>}</Property>
          <Property label="Location">{row.location}</Property>
          <Property label="KID">{row.KID && <CopyValue value={row.KID} label="KID" />}</Property>
          <Property label="Reference">
            {row.externalId && <CopyValue value={row.externalId} label="transaction reference" />}
          </Property>
          <Property label="Queued">
            <DateTime value={row.created} format="datetime" />
          </Property>
          {row.status !== "open" && (
            <Property label="Resolved">
              {row.resolvedBy ?? "Unknown"}
              {row.resolvedAt && (
                <>
                  {" · "}
                  <DateTime value={row.resolvedAt} format="relative" />
                </>
              )}
            </Property>
          )}
          {row.note && <Property label="Note">{row.note}</Property>}
          {row.donationId != null && (
            <Property label="Donation">
              <Link
                to="/donations/$id"
                params={{ id: String(row.donationId) }}
                className="num text-accent hover:underline"
              >
                #{row.donationId}
              </Link>
            </Property>
          )}
        </PropertyList>
      </div>
    </PeekPanel>
  );
}
