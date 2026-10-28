import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { cellPlaceholder, createColumns, DataTable, TableSummary } from "@/components/data-table";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { FilterBar, ListEmpty, OptionsFilter, useListState } from "@/components/filters";
import { defineList, param } from "@/components/filters/list-state";
import { ListPage } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { CreateRoundDialog } from "@/features/regranting/create-round-dialog";
import { roundKindLabels, roundKinds, type RoundSummary } from "@/features/regranting/model";
import { compareMoney, sumMoney } from "@/lib/money";
import { usePageQuery } from "@/lib/query";
import { roundStatus } from "@/lib/status";
import { useTRPC } from "@/lib/trpc";

const statuses = ["draft", "approved", "paid"] as const;

const roundsList = defineList({
  id: "regranting-rounds",
  filters: { q: param.text, status: param.list(statuses), kind: param.list(roundKinds) },
  sortable: ["cutoff", "name", "total", "createdAt"],
  defaultSort: { id: "cutoff", desc: true },
});

export const Route = createFileRoute("/_app/regranting/rounds/")({
  validateSearch: roundsList.validateSearch,
  component: RoundsPage,
});

const col = createColumns<RoundSummary>();
const columns = col.columns([
  col.accessor("cutoff", {
    header: "Cutoff",
    meta: { placeholder: cellPlaceholder.date },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("name", {
    header: "Round",
    meta: { cellClassName: "font-semibold max-w-72 truncate" },
  }),
  col.accessor("kind", {
    header: "Kind",
    enableSorting: false,
    cell: ({ getValue }) => roundKindLabels[getValue()],
  }),
  col.accessor("status", {
    header: "Status",
    enableSorting: false,
    cell: ({ getValue }) => <Status catalog={roundStatus} value={getValue()} />,
  }),
  col.accessor("totalNok", {
    id: "total",
    header: "To pay",
    meta: { numeric: true, placeholder: cellPlaceholder.money, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("transferCount", {
    header: "Transfers",
    enableSorting: false,
    meta: { numeric: true },
    cell: ({ getValue }) => <Num value={getValue()} />,
  }),
  col.accessor("fundGrantTotal", {
    header: "Fund grants",
    enableSorting: false,
    meta: { numeric: true, placeholder: cellPlaceholder.money },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("createdBy", {
    id: "createdAt",
    header: "Created by",
    meta: { cellClassName: "max-w-48 truncate" },
  }),
  col.accessor("approvedBy", {
    header: "Approved by",
    enableSorting: false,
    meta: { cellClassName: "max-w-48 truncate" },
    cell: ({ getValue }) => getValue() ?? <span className="text-faint-foreground">–</span>,
  }),
  col.accessor("paidAt", {
    header: "Paid",
    enableSorting: false,
    meta: { placeholder: cellPlaceholder.date },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

function RoundsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const list = useListState(roundsList);
  const query = usePageQuery(
    trpc.regranting.rounds.list.queryOptions({
      statuses: list.filters.status,
      kinds: list.filters.kind,
    }),
  );

  const rows = useMemo(() => {
    const q = list.filters.q?.trim().toLowerCase();
    const filtered = (query.data ?? []).filter(
      (r) => !q || r.name.toLowerCase().includes(q) || String(r.id) === q,
    );
    const dir = list.sort.desc ? -1 : 1;
    return filtered.sort((a, b) => {
      switch (list.sort.id) {
        case "name":
          return dir * a.name.localeCompare(b.name, "nb");
        case "total":
          return dir * compareMoney(a.totalNok, b.totalNok);
        case "createdAt":
          return dir * String(a.createdAt).localeCompare(String(b.createdAt));
        default:
          return dir * a.cutoff.localeCompare(b.cutoff) || dir * (a.id - b.id);
      }
    });
  }, [query.data, list.filters.q, list.sort.id, list.sort.desc]);

  return (
    <ListPage
      title="Rounds"
      description="Each round decides what is paid to whom. Drafts need a second person's approval."
      actions={
        <CreateRoundDialog
          trigger={
            <Button variant="primary">
              <PlusIcon />
              New round
            </Button>
          }
        />
      }
      filters={
        <FilterBar list={list} searchPlaceholder="Round name or ID">
          <OptionsFilter
            field="status"
            label="Status"
            options={statuses.map((s) => ({ value: s, label: roundStatus[s].label }))}
          />
          <OptionsFilter
            field="kind"
            label="Kind"
            options={roundKinds.map((k) => ({ value: k, label: roundKindLabels[k] }))}
          />
        </FilterBar>
      }
    >
      {query.isError ? (
        <div className="px-4 sm:px-6">
          <ErrorState
            error={query.error}
            title="Couldn't load rounds"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <DataTable
          label="Rounds"
          columns={columns}
          data={query.data ? rows : undefined}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => String(row.id)}
          sorting={list.tableState.sorting}
          onSortingChange={list.tableState.onSortingChange}
          onRowOpen={(row) =>
            void navigate({ to: "/regranting/rounds/$id", params: { id: String(row.id) } })
          }
          getRowHref={(row) => `/regranting/rounds/${row.id}`}
          pageHotkeys
          empty={
            <ListEmpty
              list={list}
              noun="rounds"
              hint="Start a round to pay out what recipients are owed."
            />
          }
          summary={
            query.data && (
              <TableSummary
                items={[
                  { value: <Num value={rows.length} />, suffix: "rounds" },
                  {
                    label: "Paid out",
                    value: (
                      <Money
                        value={sumMoney(
                          rows.filter((r) => r.status === "paid").map((r) => r.totalNok),
                        )}
                      />
                    ),
                  },
                ]}
              />
            )
          }
        />
      )}
    </ListPage>
  );
}
