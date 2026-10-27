import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, type LinkProps } from "@tanstack/react-router";
import { DownloadIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { createColumns, DataTable, TableSummary } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import {
  BooleanFilter,
  ChoiceFilter,
  DateRangeFilter,
  FilterBar,
  OptionsFilter,
  RangeFilter,
  SavedViews,
  useListState,
} from "@/components/filters";
import { ListPage, PeekPanel } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { CreateDonorDialog } from "@/features/donors/create-donor-dialog";
import {
  donorsList,
  fundraiserGivingOptions,
  toDonorFilter,
  type DonorListRow,
} from "@/features/donors/model";
import { downloadText } from "@/lib/download";
import { appLocale } from "@/lib/locale";
import { notify } from "@/lib/notify";
import { strings } from "@/lib/strings";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/donors/")({
  validateSearch: donorsList.validateSearch,
  component: DonorsPage,
});

const col = createColumns<DonorListRow>();
const columns = col.columns([
  col.accessor("id", {
    header: "ID",
    meta: { numeric: true, cellClassName: "text-muted-foreground w-20" },
  }),
  col.accessor("name", {
    header: "Name",
    meta: { cellClassName: "font-semibold max-w-56 truncate" },
    cell: ({ getValue }) => getValue() ?? <span className="text-faint-foreground">–</span>,
  }),
  col.accessor("email", {
    header: "Email",
    meta: { cellClassName: "max-w-64 truncate" },
  }),
  col.accessor("registered", {
    header: "Registered",
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("lastDonation", {
    id: "lastDonationDate",
    header: "Last donation",
    meta: { label: "Last donation" },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("donationsCount", {
    header: "Donations",
    meta: { numeric: true },
    cell: ({ getValue }) => <Num value={getValue()} />,
  }),
  col.accessor("donationsSum", {
    header: "Given",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("newsletter", {
    header: "Newsletter",
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
  const [peekId, setPeekId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const filter = toDonorFilter(list.filters);
  const sort = { id: list.sort.id, desc: list.sort.desc };
  const query = useQuery({
    ...trpc.donors.list.queryOptions({
      page: list.page - 1,
      limit: list.pageSize,
      sort,
      filter,
    }),
    placeholderData: keepPreviousData,
  });
  const organizations = useQuery(trpc.config.organizations.listAll.queryOptions());
  const referralTypes = useQuery(trpc.config.referralTypes.listAll.queryOptions());

  const rows = query.data?.rows;
  const peeked = peekId != null ? rows?.find((row) => row.id === peekId) : undefined;
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
              { value: "homebrew", label: appLocale.orgName },
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
      peek={
        peeked && (
          <PeekPanel
            title={peeked.name || peeked.email}
            subtitle={`Donor #${peeked.id} · ${peeked.email}`}
            href={`/donors/${peeked.id}`}
            onClose={() => setPeekId(null)}
          >
            <DonorPeek donor={peeked} inPeriod={Boolean(list.filters.donated)} />
          </PeekPanel>
        )
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
          onRowPeek={(row) => setPeekId(row.id)}
          onRowOpen={(row) => void navigate({ to: "/donors/$id", params: { id: String(row.id) } })}
          peekedRowId={peekId != null ? String(peekId) : null}
          getRowHref={(row) => `/donors/${row.id}`}
          pageHotkeys
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

/** With "Donated between", the row's totals cover only the period. */
function DonorPeek({ donor, inPeriod }: { donor: DonorListRow; inPeriod: boolean }) {
  const trpc = useTRPC();
  const donations = useQuery(trpc.donors.donations.queryOptions({ donorId: donor.id }));
  const recent = [...(donations.data ?? [])]
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
    .slice(0, 5);

  return (
    <>
      <PropertyList>
        <Property label={inPeriod ? "Given in period" : "Given in total"}>
          <Money value={donor.donationsSum} className="font-semibold" />
        </Property>
        <Property label={inPeriod ? "Donations in period" : "Donations"}>
          <Num value={donor.donationsCount} />
        </Property>
        <Property label={inPeriod ? "Last in period" : "Last donation"}>
          <DateTime value={donor.lastDonation} />
        </Property>
        <Property label="Registered">
          <DateTime value={donor.registered} />
        </Property>
        <Property label="Newsletter">{donor.newsletter ? "Subscribed" : "Not subscribed"}</Property>
        <Property label="Donor ID">
          <CopyValue value={donor.id} prefix="#" label="donor ID" />
        </Property>
      </PropertyList>
      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">Recent donations</h3>
        {donations.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No donations yet.</p>
        ) : (
          <ul className="grid text-sm">
            {recent.map((donation) => (
              <li
                key={donation.id}
                className="flex items-center gap-3 border-b border-border py-1.5 last:border-b-0"
              >
                <DateTime value={donation.timestamp} className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{donation.paymentMethod}</span>
                <Link
                  to={`/donations/${donation.id}` as LinkProps["to"]}
                  className="rounded-xs font-semibold text-accent hover:underline focus-ring"
                >
                  <Money value={donation.sum} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
