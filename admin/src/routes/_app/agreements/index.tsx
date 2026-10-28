import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { OrgSplitCell, orgSplitColumnMeta } from "@/components/domain/org-split";
import {
  DateRangeFilter,
  FilterBar,
  OptionsFilter,
  RangeFilter,
  SavedViews,
  TextFilter,
  useListState,
  ListEmpty,
} from "@/components/filters";
import { ListPage } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  agreementsList,
  fromListRow,
  listProviders,
  listStatuses,
  toAgreementFilter,
} from "@/features/agreements/list";
import { agreementTypes, shortChargeDay, type AgreementRow } from "@/features/agreements/model";
import { downloadCsv } from "@/features/donations/api";
import { notify } from "@/lib/notify";
import { agreementStatus } from "@/lib/status";
import { strings } from "@/lib/strings";
import { nextPage, usePageQuery } from "@/lib/query";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/agreements/")({
  validateSearch: agreementsList.validateSearch,
  component: AgreementsPage,
});

const col = createColumns<AgreementRow>();
const columns = col.columns([
  col.accessor("donorName", {
    header: "Donor",
    meta: { cellClassName: "font-semibold max-w-56 truncate" },
    cell: ({ getValue }) => getValue() || <span className="text-faint-foreground">–</span>,
  }),
  col.accessor("type", {
    id: "provider",
    header: "Type",
    meta: { label: "Type" },
    cell: ({ getValue }) => <Badge tone="outline">{agreementTypes[getValue()].label}</Badge>,
  }),
  col.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => <Status catalog={agreementStatus} value={getValue()} />,
  }),
  col.accessor("amount", {
    header: "Monthly",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("chargeDay", {
    header: "Charge day",
    meta: { numeric: true },
    cell: ({ getValue }) => shortChargeDay(getValue()),
  }),
  col.accessor("KID", {
    header: "KID",
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  col.accessor("orgSplit", {
    id: "orgSplit",
    header: "Organisations",
    meta: orgSplitColumnMeta,
    cell: ({ getValue }) => <OrgSplitCell split={getValue() ?? []} />,
  }),
  col.accessor("id", {
    header: "ID",
    meta: { cellClassName: "text-muted-foreground" },
  }),
  col.accessor("created", {
    header: "Created",
    meta: { numeric: true },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

function AgreementsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const list = useListState(agreementsList);
  const [exporting, setExporting] = useState(false);

  const filter = toAgreementFilter(list.filters);
  const sort = { id: list.sort.id, desc: list.sort.desc };
  const listOptions = (page: number) =>
    trpc.agreements.list.queryOptions({
      page: page - 1,
      limit: list.pageSize,
      sort,
      filter,
    });
  const query = usePageQuery(listOptions(list.page), {
    // The next page is fetched as soon as this one is in, so paging forward is instant.
    prefetch: (data) => nextPage(list.page, data.pages, listOptions),
  });
  const rows = query.data?.rows.map(fromListRow);
  const stats = query.data?.statistics;

  async function exportCsv() {
    setExporting(true);
    try {
      const file = await queryClient.fetchQuery(
        trpc.agreements.export.queryOptions({ sort, filter }, { staleTime: 0 }),
      );
      downloadCsv(file);
      notify.success("Export downloaded", file.filename);
    } catch (error) {
      notify.error(error, "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <ListPage
      title="Agreements"
      actions={
        <Button onClick={() => void exportCsv()} pending={exporting}>
          <DownloadIcon />
          {strings.actions.export}
        </Button>
      }
      filters={
        <FilterBar
          list={list}
          searchPlaceholder="Donor name, email or KID"
          end={<SavedViews list={list} />}
        >
          <OptionsFilter
            field="status"
            label="Status"
            options={listStatuses.map((status) => ({
              value: status,
              label: agreementStatus[status].label,
            }))}
          />
          <OptionsFilter
            field="provider"
            label="Type"
            options={listProviders.map((provider) => ({
              value: provider,
              label: agreementTypes[provider].label,
            }))}
          />
          <RangeFilter field="amount" label="Monthly amount" format="money" unit="kr" />
          <RangeFilter field="chargeDay" label="Charge day" />
          <DateRangeFilter field="created" label="Created" />
          <TextFilter field="kid" label="KID" numeric />
        </FilterBar>
      }
    >
      {query.isError ? (
        <div className="px-4 sm:px-6">
          <ErrorState
            error={query.error}
            title="Couldn't load agreements"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <DataTable
          label="Agreements"
          columns={columns}
          data={rows}
          rowCount={stats?.count}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => row.key}
          {...list.tableState}
          onRowOpen={(row) =>
            void navigate({
              to: "/agreements/$provider/$id",
              params: { provider: row.type, id: row.id },
            })
          }
          getRowHref={(row) => row.href}
          pageHotkeys
          empty={
            <ListEmpty
              list={list}
              noun="agreements"
              hint="Agreements appear when donors set up Vipps or AvtaleGiro."
            />
          }
          summary={
            stats && (
              <TableSummary
                items={[
                  { value: <Num value={stats.count} />, suffix: "agreements" },
                  { label: "Active", value: <Num value={stats.activeCount} /> },
                  {
                    label: "Monthly from active",
                    value: <Money value={stats.activeMonthlySum} />,
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
