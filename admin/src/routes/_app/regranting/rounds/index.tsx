import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Status } from "@/components/domain/status";
import {
  defineList,
  FilterBar,
  ListEmpty,
  OptionsFilter,
  param,
  useListState,
} from "@/components/filters";
import { ListPage, PeekPanel } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { CreateRoundDialog } from "@/features/regranting/create-round-dialog";
import { roundKindLabels, roundKinds, type RoundSummary } from "@/features/regranting/model";
import { compareMoney, sumMoney } from "@/lib/money";
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
    meta: { numeric: true, cellClassName: "font-semibold" },
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
    meta: { numeric: true },
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
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

function RoundsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const list = useListState(roundsList);
  const query = useQuery({
    ...trpc.regranting.rounds.list.queryOptions({
      statuses: list.filters.status,
      kinds: list.filters.kind,
    }),
    placeholderData: keepPreviousData,
  });
  const [peekId, setPeekId] = useState<number | null>(null);

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
  const peeked = rows.find((r) => r.id === peekId);

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
      peek={
        peeked && (
          <PeekPanel
            title={peeked.name}
            subtitle={`${roundKindLabels[peeked.kind]} · round #${peeked.id}`}
            href={`/regranting/rounds/${peeked.id}`}
            onClose={() => setPeekId(null)}
          >
            <PropertyList>
              <Property label="Status">
                <Status catalog={roundStatus} value={peeked.status} />
              </Property>
              <Property label="Cutoff">
                <DateTime value={peeked.cutoff} />
              </Property>
              <Property label="To pay">
                <Money value={peeked.totalNok} className="font-semibold" />
              </Property>
              <Property label="Transfers">
                <Num value={peeked.transferCount} />
              </Property>
              <Property label="Fund grants">
                {peeked.fundGrantCount > 0 && (
                  <>
                    <Money value={peeked.fundGrantTotal} /> in {peeked.fundGrantCount}
                  </>
                )}
              </Property>
              <Property label="Minimum transfer">
                <Money value={peeked.minTransfer} />
              </Property>
              <Property label="Created">
                {peeked.createdBy} · <DateTime value={peeked.createdAt} format="datetime" />
              </Property>
              <Property label="Approved">
                {peeked.approvedBy && (
                  <>
                    {peeked.approvedBy} · <DateTime value={peeked.approvedAt} format="datetime" />
                  </>
                )}
              </Property>
              <Property label="Paid">
                {peeked.paidAt && <DateTime value={peeked.paidAt} />}
              </Property>
            </PropertyList>
          </PeekPanel>
        )
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
          onRowPeek={(row) => setPeekId(row.id)}
          onRowOpen={(row) =>
            void navigate({ to: "/regranting/rounds/$id", params: { id: String(row.id) } })
          }
          peekedRowId={peekId != null ? String(peekId) : null}
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
