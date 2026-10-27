import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ScrollTextIcon } from "lucide-react";
import { useState } from "react";
import { createColumns, DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime } from "@/components/domain/format";
import { JsonViewer } from "@/components/domain/json-viewer";
import { Property, PropertyList } from "@/components/domain/property-list";
import { defineList, FilterBar, param, useListState } from "@/components/filters";
import { ListPage, PeekPanel } from "@/components/templates";
import { Skeleton } from "@/components/ui/skeleton";
import { withoutFile } from "@/features/import-log/model";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";

type LogRow = RouterOutputs["reports"]["logs"]["list"]["rows"][number];

const logsList = defineList({
  id: "import-log",
  filters: { q: param.text },
  sortable: ["timestamp", "label", "id"],
  defaultSort: { id: "timestamp", desc: true },
});

export const Route = createFileRoute("/_app/logs/")({
  validateSearch: logsList.validateSearch,
  component: ImportLogPage,
});

const col = createColumns<LogRow>();
const columns = col.columns([
  col.accessor("ID", {
    id: "id",
    header: "ID",
    meta: { numeric: true, cellClassName: "text-muted-foreground w-20" },
  }),
  col.accessor("timestamp", {
    header: "Time",
    cell: ({ getValue }) => <DateTime value={getValue()} format="datetime" />,
  }),
  col.accessor("displayLabel", {
    id: "label",
    header: "Source",
    meta: { cellClassName: "font-semibold" },
    cell: ({ getValue }) => getValue() ?? "Unknown",
  }),
  col.accessor("filename", {
    header: "File",
    enableSorting: false,
    meta: { cellClassName: "max-w-64 truncate" },
    cell: ({ getValue }) => {
      const name = getValue();
      return name ? (
        <span title={name}>{name}</span>
      ) : (
        <span className="text-faint-foreground">–</span>
      );
    },
  }),
  col.accessor((row) => row.summary ?? row.meta, {
    id: "summary",
    header: "Summary",
    enableSorting: false,
    meta: { cellClassName: "text-muted-foreground max-w-[32rem] truncate" },
    cell: ({ getValue }) => getValue() || "–",
  }),
]);

function ImportLogPage() {
  const list = useListState(logsList);
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [peekId, setPeekId] = useState<number | null>(null);
  const query = useQuery({
    ...trpc.reports.logs.list.queryOptions({
      page: list.page - 1,
      limit: list.pageSize,
      sort: { id: list.sort.id, desc: list.sort.desc },
      filter: list.filters.q ? { fileSearch: list.filters.q } : undefined,
    }),
    placeholderData: keepPreviousData,
  });
  const peeked = query.data?.rows.find((row) => row.ID === peekId);

  return (
    <ListPage
      title="Import log"
      description="Every payment file and scheduled job the system has processed."
      filters={<FilterBar list={list} searchPlaceholder="File name or contents" />}
      peek={peeked && <LogPeek row={peeked} onClose={() => setPeekId(null)} />}
    >
      {query.error ? (
        <div className="px-4 sm:px-6">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : (
        <DataTable
          label="Import log"
          columns={columns}
          data={query.data?.rows}
          rowCount={query.data?.total}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => String(row.ID)}
          {...list.tableState}
          onRowPeek={(row) => setPeekId(row.ID)}
          onRowOpen={(row) => void navigate({ to: "/logs/$id", params: { id: String(row.ID) } })}
          peekedRowId={peekId != null ? String(peekId) : null}
          getRowHref={(row) => `/logs/${row.ID}`}
          pageHotkeys
          empty={
            <EmptyState
              icon={ScrollTextIcon}
              title={list.filters.q ? "No files match" : "Nothing imported yet"}
              description={
                list.filters.q
                  ? "The search matches file names and looks inside the imported files. Try part of a file name, a KID, an amount or a name."
                  : "Imports and scheduled jobs show up here as they run."
              }
            />
          }
        />
      )}
    </ListPage>
  );
}

function LogPeek({ row, onClose }: { row: LogRow; onClose: () => void }) {
  const trpc = useTRPC();
  const entry = useQuery(trpc.reports.logs.get.queryOptions({ id: row.ID }));
  return (
    <PeekPanel
      title={row.displayLabel ?? "Unknown"}
      subtitle={row.filename ? `Log #${row.ID} · ${row.filename}` : `Log #${row.ID}`}
      href={`/logs/${row.ID}`}
      onClose={onClose}
    >
      <div className="grid gap-4">
        <PropertyList>
          <Property label="Time">
            <DateTime value={row.timestamp} format="datetime" />
          </Property>
          {(row.summary ?? row.meta) && (
            <Property label="Summary">{row.summary ?? row.meta}</Property>
          )}
        </PropertyList>
        {entry.error ? (
          <ErrorState error={entry.error} onRetry={() => void entry.refetch()} />
        ) : entry.data ? (
          <JsonViewer data={withoutFile(entry.data.result).result} defaultExpandDepth={1} />
        ) : (
          <Skeleton className="h-32" />
        )}
      </div>
    </PeekPanel>
  );
}
