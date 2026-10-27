import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { DistributionSummary } from "@/components/domain/distribution-editor";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Status } from "@/components/domain/status";
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
import { ListPage, PageSection, PeekPanel } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  agreementsList,
  fromListRow,
  listProviders,
  listStatuses,
  toAgreementFilter,
} from "@/features/agreements/list";
import {
  agreementTypes,
  describeChargeDay,
  shortChargeDay,
  type AgreementRow,
} from "@/features/agreements/model";
import { draftFromApi } from "@/features/distribution/model";
import { useCauseAreaConfig } from "@/features/distribution/queries";
import { downloadCsv } from "@/features/donations/api";
import { notify } from "@/lib/notify";
import { agreementStatus } from "@/lib/status";
import { strings } from "@/lib/strings";
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
  const [peekKey, setPeekKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const filter = toAgreementFilter(list.filters);
  const sort = { id: list.sort.id, desc: list.sort.desc };
  const query = useQuery({
    ...trpc.agreements.list.queryOptions({
      page: list.page - 1,
      limit: list.pageSize,
      sort,
      filter,
    }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.rows.map(fromListRow);
  const peeked = peekKey ? rows?.find((row) => row.key === peekKey) : undefined;
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
      peek={
        peeked && (
          <PeekPanel
            title={peeked.donorName || "Unnamed donor"}
            subtitle={`${agreementTypes[peeked.type].label} agreement · ${peeked.id}`}
            href={peeked.href}
            onClose={() => setPeekKey(null)}
          >
            <AgreementPeek agreement={peeked} />
          </PeekPanel>
        )
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
          onRowPeek={(row) => setPeekKey(row.key)}
          onRowOpen={(row) =>
            void navigate({
              to: "/agreements/$provider/$id",
              params: { provider: row.type, id: row.id },
            })
          }
          peekedRowId={peekKey}
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

function AgreementPeek({ agreement }: { agreement: AgreementRow }) {
  const trpc = useTRPC();
  const distribution = useQuery(
    trpc.donations.distributions.get.queryOptions({ kid: agreement.KID }),
  );
  const config = useCauseAreaConfig({ includeInactive: true });
  const provider = agreementTypes[agreement.type].label;
  return (
    <>
      <PropertyList labelWidth="7rem">
        <Property label="Status" hint={`${provider}: ${agreement.providerStatus || "–"}`}>
          <Status catalog={agreementStatus} value={agreement.status} />
        </Property>
        <Property label="Monthly">
          <Money value={agreement.amount} className="font-semibold" />
        </Property>
        <Property label="Charged">{describeChargeDay(agreement.chargeDay)}</Property>
        {agreement.pausedUntil && (
          <Property label="Paused until">
            <DateTime value={agreement.pausedUntil} />
          </Property>
        )}
        <Property label="Donor">
          {agreement.donorId != null ? (
            <Link
              to="/donors/$id"
              params={{ id: String(agreement.donorId) }}
              className="text-accent hover:underline focus-ring rounded-xs"
            >
              {agreement.donorName || `#${agreement.donorId}`}
            </Link>
          ) : (
            agreement.donorName
          )}
        </Property>
        <Property label="KID">
          <CopyValue value={agreement.KID} label="KID" />
        </Property>
        <Property label="Agreement ID">
          <CopyValue value={agreement.id} label="agreement ID" />
        </Property>
        <Property label="Created">
          <DateTime value={agreement.created} />
        </Property>
        {agreement.cancelled && (
          <Property label="Cancelled">
            <DateTime value={agreement.cancelled} />
          </Property>
        )}
      </PropertyList>
      <PageSection title="Distribution">
        {distribution.isError || config.isError ? (
          <ErrorState
            error={distribution.error ?? config.error}
            onRetry={() => {
              void distribution.refetch();
              void config.refetch();
            }}
          />
        ) : distribution.data && config.data ? (
          <DistributionSummary
            draft={draftFromApi(config.data, distribution.data)}
            config={config.data}
          />
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </PageSection>
    </>
  );
}
