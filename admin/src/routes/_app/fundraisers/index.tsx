import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRightIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import {
  DateRangeFilter,
  FilterBar,
  OptionsFilter,
  RangeFilter,
  SavedViews,
  useListState,
  ListEmpty,
} from "@/components/filters";
import { ListPage, PeekPanel } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { CreateFundraiserDialog } from "@/features/fundraisers/create-fundraiser-dialog";
import {
  dashboardUrl,
  fundraisersList,
  toFundraiserFilter,
  type FundraiserRow,
} from "@/features/fundraisers/model";
import { nextPage, usePageQuery } from "@/lib/query";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/fundraisers/")({
  validateSearch: fundraisersList.validateSearch,
  component: FundraisersPage,
});

const col = createColumns<FundraiserRow>();
const columns = col.columns([
  col.accessor("id", {
    header: "ID",
    meta: { numeric: true, cellClassName: "text-muted-foreground w-20" },
  }),
  col.accessor("registered", {
    header: "Created",
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor((row) => row.donor.name ?? `Donor #${row.donor.id}`, {
    id: "donor",
    header: "Owner",
    meta: { cellClassName: "font-semibold max-w-64 truncate", label: "Owner" },
  }),
  col.accessor((row) => row.statistics.donationCount, {
    id: "donationCount",
    header: "Donations",
    meta: { numeric: true, label: "Donations" },
    cell: ({ getValue }) => <Num value={getValue()} />,
  }),
  col.accessor((row) => row.statistics.totalSum, {
    id: "totalSum",
    header: "Raised",
    meta: { numeric: true, cellClassName: "font-semibold", label: "Raised" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor((row) => row.statistics.averageDonation, {
    id: "averageDonation",
    header: "Average",
    meta: { numeric: true, label: "Average" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("secret", {
    header: "Dashboard",
    enableSorting: false,
    cell: ({ getValue }) => {
      const secret = getValue();
      return secret ? (
        <a
          href={dashboardUrl(secret)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 rounded-xs text-accent hover:underline focus-ring"
        >
          Open
          <ArrowUpRightIcon className="size-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null;
    },
  }),
]);

function FundraisersPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const list = useListState(fundraisersList);
  const [peekId, setPeekId] = useState<number | null>(null);

  const listOptions = (page: number) =>
    trpc.reports.fundraisers.list.queryOptions({
      page: page - 1,
      limit: list.pageSize,
      sort: { id: list.sort.id, desc: list.sort.desc },
      filter: toFundraiserFilter(list.filters),
    });
  const query = usePageQuery(listOptions(list.page), {
    // The next page is fetched as soon as this one is in, so paging forward is instant.
    prefetch: (data) => nextPage(list.page, data.pages, listOptions),
  });
  const organizations = useQuery(trpc.config.organizations.listAll.queryOptions());
  const rows = query.data?.rows;
  const peeked = peekId != null ? rows?.find((row) => row.id === peekId) : undefined;
  const stats = query.data?.statistics;

  return (
    <ListPage
      title="Fundraisers"
      actions={
        <CreateFundraiserDialog
          trigger={
            <Button variant="primary">
              <PlusIcon />
              Create fundraiser
            </Button>
          }
        />
      }
      filters={
        <FilterBar
          list={list}
          searchPlaceholder="Owner name or fundraiser ID"
          end={<SavedViews list={list} />}
        >
          <DateRangeFilter field="registered" label="Created" />
          <RangeFilter field="sum" label="Raised" format="money" unit="kr" />
          <RangeFilter field="count" label="Number of donations" />
          <OptionsFilter
            field="org"
            label="Donations to"
            options={(organizations.data ?? []).map((org) => ({ value: org.id, label: org.name }))}
          />
        </FilterBar>
      }
      peek={
        peeked && (
          <PeekPanel
            title={`Fundraiser #${peeked.id}`}
            subtitle={peeked.donor.name ?? `Donor #${peeked.donor.id}`}
            href={`/fundraisers/${peeked.id}`}
            onClose={() => setPeekId(null)}
            actions={
              peeked.secret && (
                <Button size="sm" asChild>
                  <a href={dashboardUrl(peeked.secret)} target="_blank" rel="noopener noreferrer">
                    Open dashboard
                    <ArrowUpRightIcon />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </Button>
              )
            }
          >
            <PropertyList>
              <Property label="Raised">
                <Money value={peeked.statistics.totalSum} className="font-semibold" />
              </Property>
              <Property label="Donations">
                <Num value={peeked.statistics.donationCount} />
              </Property>
              <Property label="Average">
                <Money value={peeked.statistics.averageDonation} />
              </Property>
              <Property label="Owner">
                <Link
                  to="/donors/$id"
                  params={{ id: String(peeked.donor.id) }}
                  className="rounded-xs font-semibold text-accent hover:underline focus-ring"
                >
                  {peeked.donor.name ?? `Donor #${peeked.donor.id}`}
                </Link>
              </Property>
              <Property label="Created">
                <DateTime value={peeked.registered} format="datetime" />
              </Property>
              <Property label="Last updated">
                <DateTime value={peeked.lastUpdated} format="datetime" />
              </Property>
              <Property label="Fundraiser ID">
                <CopyValue value={peeked.id} prefix="#" label="fundraiser ID" />
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
            title="Couldn't load fundraisers"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <DataTable
          label="Fundraisers"
          columns={columns}
          data={rows}
          rowCount={stats?.totalCount}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => String(row.id)}
          {...list.tableState}
          onRowPeek={(row) => setPeekId(row.id)}
          onRowOpen={(row) =>
            void navigate({ to: "/fundraisers/$id", params: { id: String(row.id) } })
          }
          peekedRowId={peekId != null ? String(peekId) : null}
          getRowHref={(row) => `/fundraisers/${row.id}`}
          pageHotkeys
          empty={
            <ListEmpty
              list={list}
              noun="fundraisers"
              hint="Donors create fundraisers; you can also create one from a donor page."
            />
          }
          summary={
            stats && (
              <TableSummary
                items={[
                  { value: <Num value={stats.totalCount} />, suffix: "fundraisers" },
                  { label: "Raised", value: <Money value={stats.totalSum} /> },
                  { label: "Average donation", value: <Money value={stats.avgDonation} /> },
                ]}
              />
            )
          }
        />
      )}
    </ListPage>
  );
}
