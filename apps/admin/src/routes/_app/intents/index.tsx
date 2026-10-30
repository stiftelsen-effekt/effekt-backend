import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { OrgSplitCell, orgSplitColumnMeta } from "@/components/domain/org-split";
import { Status } from "@/components/domain/status";
import {
  BooleanFilter,
  DateRangeFilter,
  FilterBar,
  ListEmpty,
  OptionsFilter,
  SavedViews,
  useListState,
} from "@/components/filters";
import { ListPage } from "@/components/templates";
import {
  intentMethodKeys,
  intentMethods,
  intentsList,
  intentStatuses,
  methodLabel,
  toIntentFilter,
  type IntentListRow,
} from "@/features/intents/model";
import { intentStatus } from "@/lib/status";
import { nextPage, usePageQuery } from "@/lib/query";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/intents/")({
  validateSearch: intentsList.validateSearch,
  component: IntentsPage,
});

const col = createColumns<IntentListRow>();
const columns = col.columns([
  col.accessor("donorName", {
    header: "Donor",
    meta: { cellClassName: "font-semibold max-w-56 truncate" },
    cell: ({ getValue }) => getValue() || <span className="text-faint-foreground">–</span>,
  }),
  col.accessor("amount", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("methodId", {
    id: "method",
    header: "Method",
    enableSorting: false,
    cell: ({ row }) => methodLabel(row.original.methodId, row.original.method),
  }),
  col.accessor("status", {
    header: "Status",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        <Status catalog={intentStatus} value={row.original.status} />
        {row.original.newDonor && (
          <span className="text-xs text-muted-foreground" title="No donation before this intent">
            New donor
          </span>
        )}
      </span>
    ),
  }),
  col.accessor("matchedDonation", {
    id: "received",
    header: "Received",
    enableSorting: false,
    meta: { numeric: true },
    cell: ({ getValue }) => {
      const donation = getValue();
      return donation ? (
        <span>
          <Money value={donation.sum} />{" "}
          <span className="text-muted-foreground">
            <DateTime value={donation.date} />
          </span>
        </span>
      ) : (
        <span className="text-faint-foreground">–</span>
      );
    },
  }),
  col.accessor((row) => row.followUps.count, {
    id: "followUps",
    header: "Reminders",
    enableSorting: false,
    meta: { numeric: true },
    cell: ({ row }) =>
      row.original.followUps.count ? (
        <span>
          {row.original.followUps.count}{" "}
          <span className="text-muted-foreground">
            <DateTime value={row.original.followUps.last} />
          </span>
        </span>
      ) : (
        <span className="text-faint-foreground">–</span>
      ),
  }),
  col.accessor("KID", {
    header: "KID",
    enableSorting: false,
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  col.accessor("orgSplit", {
    id: "orgSplit",
    header: "Organisations",
    enableSorting: false,
    meta: orgSplitColumnMeta,
    cell: ({ getValue }) => <OrgSplitCell split={getValue()} />,
  }),
  col.accessor("created", {
    header: "Said on",
    meta: { numeric: true },
    cell: ({ getValue }) => <DateTime value={getValue()} format="datetime" />,
  }),
]);

function IntentsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const list = useListState(intentsList);

  const filter = toIntentFilter(list.filters);
  const sort = { id: list.sort.id, desc: list.sort.desc };
  const listOptions = (page: number) =>
    trpc.intents.list.queryOptions({ page: page - 1, limit: list.pageSize, sort, filter });
  const query = usePageQuery(listOptions(list.page), {
    prefetch: (data) => nextPage(list.page, data.pages, listOptions),
  });

  return (
    <ListPage
      title="Intents"
      filters={
        <FilterBar
          list={list}
          searchPlaceholder="Donor name, email or KID"
          end={<SavedViews list={list} />}
        >
          <OptionsFilter
            field="status"
            label="Status"
            options={intentStatuses.map((status) => ({
              value: status,
              label: intentStatus[status].label,
            }))}
          />
          <OptionsFilter
            field="method"
            label="Method"
            options={intentMethodKeys.map((key) => ({
              value: key,
              label: intentMethods[key].label,
            }))}
          />
          <BooleanFilter
            field="newDonor"
            label="New donors"
            trueLabel="New donors only"
            falseLabel="All donors"
          />
          <DateRangeFilter field="created" label="Said on" />
        </FilterBar>
      }
    >
      {query.isError ? (
        <div className="px-4 sm:px-6">
          <ErrorState
            error={query.error}
            title="Couldn't load intents"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <DataTable
          label="Intents"
          columns={columns}
          data={query.data?.rows}
          rowCount={query.data?.count}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => String(row.id)}
          {...list.tableState}
          onRowOpen={(row) =>
            void navigate({ to: "/donors/$id", params: { id: String(row.donorId) } })
          }
          getRowHref={(row) => `/donors/${row.donorId}`}
          pageHotkeys
          empty={
            <ListEmpty
              list={list}
              noun="intents"
              hint="Intents are saved when a donor submits the donation widget."
            />
          }
          summary={
            query.data && (
              <TableSummary
                items={[{ value: <Num value={query.data.count} />, suffix: "intents" }]}
              />
            )
          }
        />
      )}
    </ListPage>
  );
}
