import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DownloadIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { cellPlaceholder, createColumns, DataTable, TableSummary } from "@/components/data-table";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import {
  BooleanFilter,
  ChoiceFilter,
  DateRangeFilter,
  FilterBar,
  OptionsFilter,
  RangeFilter,
  SavedViews,
  useListState,
  ListEmpty,
} from "@/components/filters";
import { ListPage } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { CreateDonorDialog } from "@/features/donors/create-donor-dialog";
import {
  donorsList,
  fundraiserGivingOptions,
  toDonorFilter,
  type DonorListRow,
} from "@/features/donors/model";
import { downloadText } from "@/lib/download";
import { org } from "@/lib/org";
import { notify } from "@/lib/notify";
import { strings } from "@/lib/strings";
import { nextPage, usePageQuery } from "@/lib/query";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/donors/")({
  validateSearch: donorsList.validateSearch,
  component: DonorsPage,
});

const col = createColumns<DonorListRow>();
const columns = col.columns([
  col.accessor("id", {
    header: "ID",
    meta: {
      placeholder: cellPlaceholder.id,
      numeric: true,
      cellClassName: "text-muted-foreground w-20",
    },
  }),
  col.accessor("name", {
    header: "Name",
    meta: { placeholder: cellPlaceholder.name, cellClassName: "font-semibold max-w-56 truncate" },
    cell: ({ getValue }) => getValue() ?? <span className="text-faint-foreground">–</span>,
  }),
  col.accessor("email", {
    header: "Email",
    meta: { placeholder: cellPlaceholder.email, cellClassName: "max-w-64 truncate" },
  }),
  col.accessor("registered", {
    header: "Registered",
    meta: { placeholder: cellPlaceholder.date },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("lastDonation", {
    id: "lastDonationDate",
    header: "Last donation",
    meta: { placeholder: cellPlaceholder.date, label: "Last donation" },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("donationsCount", {
    header: "Donations",
    meta: { placeholder: cellPlaceholder.count, numeric: true },
    cell: ({ getValue }) => <Num value={getValue()} />,
  }),
  col.accessor("donationsSum", {
    header: "Given",
    meta: { placeholder: cellPlaceholder.money, numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("newsletter", {
    header: "Newsletter",
    meta: { placeholder: cellPlaceholder.word },
    enableSorting: false,
    cell: ({ getValue }) =>
      getValue() ? "Subscribed" : <span className="text-muted-foreground">No</span>,
  }),
]);

function DonorsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const list = useListState(donorsList);
  const [exporting, setExporting] = useState(false);

  const filter = toDonorFilter(list.filters);
  const sort = { id: list.sort.id, desc: list.sort.desc };
  const listOptions = (page: number) =>
    trpc.donors.list.queryOptions({
      page: page - 1,
      limit: list.pageSize,
      sort,
      filter,
    });
  const query = usePageQuery(listOptions(list.page), {
    // The next page is fetched as soon as this one is in, so paging forward is instant.
    prefetch: (data) => nextPage(list.page, data.pages, listOptions),
  });
  const organizations = useQuery(trpc.config.organizations.listAll.queryOptions());
  const referralTypes = useQuery(trpc.config.referralTypes.listAll.queryOptions());

  const rows = query.data?.rows;
  const stats = query.data?.statistics;

  async function exportCsv() {
    setExporting(true);
    try {
      const file = await queryClient.fetchQuery(
        trpc.donors.export.queryOptions({ sort, filter }, { staleTime: 0 }),
      );
      downloadText(file.filename, file.csv);
      notify.success("Export downloaded", file.filename);
    } catch (error) {
      notify.error(error, "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <ListPage
      title="Donors"
      actions={
        <>
          <Button onClick={() => void exportCsv()} pending={exporting}>
            <DownloadIcon />
            {strings.actions.export}
          </Button>
          <CreateDonorDialog
            trigger={
              <Button variant="primary">
                <PlusIcon />
                Create donor
              </Button>
            }
          />
        </>
      }
      filters={
        <FilterBar
          list={list}
          searchPlaceholder="Name, email or donor ID"
          end={<SavedViews list={list} />}
        >
          <DateRangeFilter field="registered" label="Registered" />
          <DateRangeFilter field="donated" label="Donated between" />
          <DateRangeFilter field="lastDonation" label="Last donation" />
          <RangeFilter field="sum" label="Total given" format="money" unit="kr" />
          <RangeFilter field="count" label="Number of donations" />
          <ChoiceFilter field="fundraiser" label="Fundraisers" options={fundraiserGivingOptions} />
          <OptionsFilter
            field="fundraiserType"
            label="Fundraiser type"
            options={[
              { value: "homebrew", label: org.name },
              { value: "facebook", label: "Facebook" },
            ]}
          />
          <BooleanFilter
            field="newsletter"
            label="Newsletter"
            trueLabel="Subscribed"
            falseLabel="Not subscribed"
          />
          <OptionsFilter
            field="org"
            label="Gave to"
            options={(organizations.data ?? []).map((org) => ({ value: org.id, label: org.name }))}
          />
          <OptionsFilter
            field="referral"
            label="Heard about us via"
            options={(referralTypes.data ?? []).map((type) => ({
              value: type.id,
              label: type.name,
            }))}
          />
        </FilterBar>
      }
    >
      {query.isError ? (
        <div className="px-4 sm:px-6">
          <ErrorState
            error={query.error}
            title="Couldn't load donors"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <DataTable
          label="Donors"
          columns={columns}
          data={rows}
          rowCount={stats?.totalDonors}
          isLoading={query.isPending}
          isFetching={query.isFetching}
          getRowId={(row) => String(row.id)}
          {...list.tableState}
          onRowOpen={(row) => void navigate({ to: "/donors/$id", params: { id: String(row.id) } })}
          getRowHref={(row) => `/donors/${row.id}`}
          pageHotkeys
          empty={
            <ListEmpty
              list={list}
              noun="donors"
              hint="Donors are added when someone gives for the first time."
            />
          }
          summary={
            stats && (
              <TableSummary
                items={[
                  { value: <Num value={stats.totalDonors} />, suffix: "donors" },
                  {
                    // With "Donated between", the API sums only the donations in the period.
                    label: list.filters.donated ? "Given in period" : "Given",
                    value: <Money value={stats.totalDonationSum} />,
                  },
                  {
                    value: <Num value={stats.totalDonationCount} />,
                    suffix: list.filters.donated ? "donations in period" : "donations",
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
