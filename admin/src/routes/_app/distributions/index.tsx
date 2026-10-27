import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DownloadIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { DistributionSummary } from "@/components/domain/distribution-editor";
import { ErrorState } from "@/components/domain/error-state";
import { Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { FilterBar, SavedViews, TextFilter, useListState } from "@/components/filters";
import { ListPage, PeekPanel } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { draftFromApi } from "@/features/distribution/model";
import { useCauseAreaConfig } from "@/features/distribution/queries";
import { downloadCsv } from "@/features/donations/api";
import { moneyDecimals } from "@/features/donations/form";
import { distributionsList, toDistributionFilter } from "@/features/donations/list";
import { notify } from "@/lib/notify";
import { strings } from "@/lib/strings";
import { useTRPC, type RouterOutputs } from "@/lib/trpc";

export const Route = createFileRoute("/_app/distributions/")({
  validateSearch: distributionsList.validateSearch,
  component: DistributionsPage,
});

type DistributionRow = RouterOutputs["donations"]["distributions"]["list"]["rows"][number];

const col = createColumns<DistributionRow>();
const columns = col.columns([
  col.accessor("KID", {
    header: "KID",
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  col.accessor("full_name", {
    id: "full_name",
    header: "Donor",
    meta: { cellClassName: "font-semibold max-w-56 truncate" },
  }),
  col.accessor("email", {
    header: "Email",
    meta: { cellClassName: "text-muted-foreground max-w-64 truncate" },
  }),
  col.accessor("donation_count", {
    id: "count",
    header: "Donations",
    meta: { numeric: true },
    cell: ({ getValue }) => <Num value={getValue()} />,
  }),
  col.accessor("donation_sum", {
    id: "sum",
    header: "Total",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} decimals={moneyDecimals(getValue())} />,
  }),
]);

function DistributionsPage() {
  const list = useListState(distributionsList);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [peekKid, setPeekKid] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const filter = toDistributionFilter(list.filters);
  const sort = { id: list.sort.id, desc: list.sort.desc };
  const query = useQuery({
    ...trpc.donations.distributions.list.queryOptions({
      page: list.page - 1,
      limit: list.pageSize,
      sort,
      filter,
    }),
    placeholderData: keepPreviousData,
  });

  async function exportCsv() {
    setExporting(true);
    try {
      downloadCsv(
        await queryClient.fetchQuery(
          trpc.donations.distributions.export.queryOptions({ sort, filter }),
        ),
      );
    } catch (error) {
      notify.error(error, "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const total = query.data?.statistics.numDistributions;

  return (
    <ListPage
      title="Distributions"
      description="Every KID and how it splits donations between cause areas and organizations."
      actions={
        <>
          <Button onClick={() => void exportCsv()} pending={exporting} disabled={!total}>
            <DownloadIcon />
            {strings.actions.export}
          </Button>
          <Button variant="primary" asChild>
            <Link to="/distributions/new">
              <PlusIcon />
              Create distribution
            </Link>
          </Button>
        </>
      }
      filters={
        <FilterBar list={list} searchPlaceholder="Donor name or email" end={<SavedViews list={list} />}>
          <TextFilter field="kid" label="KID" numeric />
        </FilterBar>
      }
      peek={peekKid != null && <DistributionPeek kid={peekKid} onClose={() => setPeekKid(null)} />}
    >
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} className="mx-4 sm:mx-6" />
      ) : (
        <DataTable
          label="Distributions"
          columns={columns}
          data={query.data?.rows}
          rowCount={total}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => row.KID}
          {...list.tableState}
          onRowPeek={(row) => setPeekKid(row.KID)}
          onRowOpen={(row) => void navigate({ to: "/distributions/$kid", params: { kid: row.KID } })}
          peekedRowId={peekKid}
          getRowHref={(row) => `/distributions/${row.KID}`}
          pageHotkeys
          summary={
            total !== undefined && (
              <TableSummary items={[{ value: <Num value={total} />, suffix: "distributions" }]} />
            )
          }
        />
      )}
    </ListPage>
  );
}

function DistributionPeek({ kid, onClose }: { kid: string; onClose: () => void }) {
  const trpc = useTRPC();
  const distribution = useQuery(trpc.donations.distributions.get.queryOptions({ kid }));
  const causeAreas = useCauseAreaConfig({ includeInactive: true });
  const d = distribution.data;

  return (
    <PeekPanel
      title={`KID ${kid}`}
      subtitle={d?.donor?.name ?? undefined}
      href={`/distributions/${kid}`}
      onClose={onClose}
    >
      {distribution.isError ? (
        <ErrorState error={distribution.error} onRetry={() => void distribution.refetch()} />
      ) : !d || !causeAreas.data ? (
        <div className="grid gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : (
        <>
          <PropertyList labelWidth="7rem">
            <Property label="Donor">
              <Link
                to="/$"
                params={{ _splat: `donors/${d.donorId}` }}
                className="font-semibold text-accent hover:underline"
              >
                {d.donor?.name ?? `#${d.donorId}`}
              </Link>
            </Property>
            <Property label="Email">{d.donor?.email}</Property>
            <Property label="Tax unit">{d.taxUnit?.name}</Property>
            <Property label="KID">
              <CopyValue value={kid} label="KID" />
            </Property>
          </PropertyList>
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Split</h3>
            <DistributionSummary draft={draftFromApi(causeAreas.data, d)} config={causeAreas.data} />
          </section>
        </>
      )}
    </PeekPanel>
  );
}
