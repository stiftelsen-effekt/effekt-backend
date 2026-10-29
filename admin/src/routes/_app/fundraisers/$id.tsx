import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRecordParams } from "@/components/panels";
import { ArrowUpRightIcon, FlagIcon, HandHeartIcon } from "lucide-react";
import { createColumns, DataTable } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Stat, StatGroup } from "@/components/domain/stat";
import { DetailPage, DetailPanel, PageSection } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { SkeletonText } from "@/components/ui/skeleton";
import { dashboardUrl } from "@/features/fundraisers/model";
import { averageMoney } from "@/lib/money";
import { loadPage } from "@/lib/route-data";
import { errorCode, useTRPC, type RouterOutputs } from "@/lib/trpc";

export const Route = createFileRoute("/_app/fundraisers/$id")({
  loader: async ({ context: { queryClient, trpc }, params, cause }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return;
    const fundraiser = trpc.reports.fundraisers.get.queryOptions({ id });
    await loadPage(queryClient, cause, fundraiser);
    // The owner's name is in the header; fetch it as soon as we know who it is.
    const donorId = queryClient.getQueryData(fundraiser.queryKey)?.donorId;
    if (donorId !== undefined && cause !== "preload") {
      void queryClient.prefetchQuery(trpc.donors.get.queryOptions({ donorId }));
    }
  },
  component: FundraiserPage,
});

const breadcrumbs = [{ label: "Fundraisers", to: "/fundraisers" }];

type Transaction = RouterOutputs["reports"]["fundraisers"]["get"]["transactions"][number];

const col = createColumns<Transaction>();
const columns = col.columns([
  col.accessor("date", {
    header: "Date",
    cell: ({ getValue }) => <DateTime value={getValue()} format="datetime" />,
  }),
  col.accessor("name", {
    header: "From",
    meta: { cellClassName: "max-w-56 truncate" },
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">Anonymous</span>,
  }),
  col.accessor("message", {
    header: "Message",
    enableSorting: false,
    meta: { cellClassName: "max-w-md truncate" },
    cell: ({ getValue }) => getValue() || <span className="text-faint-foreground">–</span>,
  }),
  col.accessor("amount", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
]);

function FundraiserPage() {
  const { id } = useRecordParams(Route);
  const fundraiserId = Number(id);
  if (!Number.isInteger(fundraiserId) || fundraiserId <= 0) {
    return (
      <EmptyState
        icon={FlagIcon}
        title="No such fundraiser"
        description={`“${id}” isn't a fundraiser ID.`}
        className="flex-1"
      />
    );
  }
  return <Fundraiser fundraiserId={fundraiserId} />;
}

function Fundraiser({ fundraiserId }: { fundraiserId: number }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.reports.fundraisers.get.queryOptions({ id: fundraiserId }));
  const owner = useQuery({
    ...trpc.donors.get.queryOptions({ donorId: query.data?.donorId ?? 0 }),
    enabled: query.data !== undefined,
  });

  if (query.isPending) {
    // First load only (navigations wait for the fundraiser): the page's layout with
    // placeholders for its values.
    return (
      <DetailPage
        breadcrumbs={breadcrumbs}
        title={`Fundraiser #${fundraiserId}`}
        meta={[
          <SkeletonText key="owner">Run by Firstname Lastname</SkeletonText>,
          <SkeletonText key="created">Created 00.00.0000</SkeletonText>,
        ]}
        stats={
          <StatGroup>
            <Stat label="Raised" pending />
            <Stat label="Donations" pending placeholder="00" />
            <Stat label="Average donation" pending placeholder="000 kr" />
            <Stat label="Last donation" pending placeholder="00.00.0000" />
          </StatGroup>
        }
        aside={
          <DetailPanel title="Fundraiser">
            <PropertyList labelWidth="7rem">
              {["Owner", "Owner email", "Created", "Last updated", "Fundraiser ID"].map((label) => (
                <Property key={label} label={label} pending />
              ))}
            </PropertyList>
          </DetailPanel>
        }
      >
        <PageSection
          fill
          title="Donations"
          description="Names are shown only where the giver chose to show them on the fundraiser."
        >
          <div className="flex min-h-0 flex-col">
            <DataTable
              label="Donations to this fundraiser"
              columns={columns}
              data={undefined}
              isLoading
              getRowId={(row) => String(row.id)}
            />
          </div>
        </PageSection>
      </DetailPage>
    );
  }
  if (query.isError) {
    return (
      <div className="p-6">
        <ErrorState
          back={{ to: "/fundraisers", label: "All fundraisers" }}
          error={query.error}
          title={
            errorCode(query.error) === "NOT_FOUND"
              ? `No fundraiser #${fundraiserId}`
              : "Couldn't load the fundraiser"
          }
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const fundraiser = query.data;
  const ownerName = owner.data ? (
    owner.data.name || owner.data.email
  ) : owner.isPending ? (
    <SkeletonText>Firstname Lastname</SkeletonText>
  ) : (
    `Donor #${fundraiser.donorId}`
  );
  const ownerLink = (
    <Link
      to="/donors/$id"
      params={{ id: String(fundraiser.donorId) }}
      className="rounded-xs font-semibold text-accent hover:underline focus-ring"
    >
      {ownerName}
    </Link>
  );
  const transactions = [...fundraiser.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const lastDonation = transactions[0]?.date;

  return (
    <DetailPage
      breadcrumbs={breadcrumbs}
      title={`Fundraiser #${fundraiser.id}`}
      meta={[
        <span key="owner">Run by {ownerLink}</span>,
        <span key="created">
          Created <DateTime value={fundraiser.registered} />
        </span>,
      ]}
      actions={
        fundraiser.secret && (
          <Button asChild>
            <a href={dashboardUrl(fundraiser.secret)} target="_blank" rel="noopener noreferrer">
              Open dashboard
              <ArrowUpRightIcon />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        )
      }
      stats={
        <StatGroup>
          <Stat label="Raised" value={<Money value={fundraiser.totalSum} />} />
          <Stat label="Donations" value={<Num value={fundraiser.donationCount} />} />
          <Stat
            label="Average donation"
            value={<Money value={averageMoney(transactions.map((t) => t.amount))} />}
          />
          <Stat
            label="Last donation"
            value={lastDonation ? <DateTime value={lastDonation} /> : "–"}
            hint={lastDonation && <DateTime value={lastDonation} format="relative" />}
          />
        </StatGroup>
      }
      aside={
        <DetailPanel title="Fundraiser">
          <PropertyList labelWidth="7rem">
            <Property label="Owner">{ownerLink}</Property>
            <Property label="Owner email" pending={owner.isPending}>
              {owner.data?.email}
            </Property>
            <Property label="Created">
              <DateTime value={fundraiser.registered} format="datetime" />
            </Property>
            <Property label="Last updated">
              <DateTime value={fundraiser.lastUpdated} format="datetime" />
            </Property>
            <Property label="Fundraiser ID">
              <CopyValue value={fundraiser.id} prefix="#" label="fundraiser ID" />
            </Property>
          </PropertyList>
        </DetailPanel>
      }
    >
      <PageSection
        fill
        title="Donations"
        description="Names are shown only where the giver chose to show them on the fundraiser."
      >
        <div className="flex min-h-0 flex-col">
          <DataTable
            label="Donations to this fundraiser"
            columns={columns}
            data={transactions}
            getRowId={(row) => String(row.id)}
            empty={
              <EmptyState
                size="sm"
                icon={HandHeartIcon}
                title="No donations yet"
                description="Donations made through the fundraiser page show up here."
              />
            }
          />
        </div>
      </PageSection>
    </DetailPage>
  );
}
