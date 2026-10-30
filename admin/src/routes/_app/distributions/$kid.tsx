import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRecordParams } from "@/components/panels";
import { createColumns, DataTable } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { DistributionSummary } from "@/components/domain/distribution-editor";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Stat, StatGroup } from "@/components/domain/stat";
import { DetailPage, DetailPanel, PageSection } from "@/components/templates";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { draftFromApi } from "@/features/distribution/model";
import { useCauseAreaConfig } from "@/features/distribution/queries";
import { sumMoney } from "@/lib/money";
import { loadPage } from "@/lib/route-data";
import { useTRPC, type RouterOutputs } from "@/lib/trpc";
import { PaymentMethodName } from "@/features/donations/payment-method-name";
import { IntentsTable } from "@/features/intents/intents-view";

export const Route = createFileRoute("/_app/distributions/$kid")({
  loader: ({ context: { queryClient, trpc }, params: { kid }, cause }) =>
    loadPage(queryClient, cause, trpc.donations.distributions.get.queryOptions({ kid }), [
      trpc.donations.byKid.queryOptions({ kid }),
      { ...trpc.config.causeAreas.listAll.queryOptions(), staleTime: 5 * 60_000 },
    ]),
  component: DistributionPage,
});

type KidDonation = RouterOutputs["donations"]["byKid"][number];

const col = createColumns<KidDonation>();
const columns = col.columns([
  col.accessor("id", {
    header: "ID",
    meta: { numeric: true, cellClassName: "text-muted-foreground w-20" },
  }),
  col.accessor("timestamp", {
    header: "Date",
    cell: ({ getValue }) => <DateTime value={getValue()} format="datetime" />,
  }),
  col.accessor("paymentMethod", {
    header: "Method",
    cell: ({ getValue }) => <PaymentMethodName value={getValue()} />,
  }),
  col.accessor("sum", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("transactionCost", {
    header: "Fee",
    meta: { numeric: true, cellClassName: "text-muted-foreground" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
]);

const breadcrumbs = [{ label: "Distributions", to: "/distributions" }];

/** Personal numbers show the birth date only; organization numbers in full. */
const maskSsn = (ssn: string) => (ssn.length === 11 ? ssn.replace(/^(\d{6})\d+/, "$1 •••••") : ssn);

function DistributionPage() {
  const { kid } = useRecordParams(Route);
  const trpc = useTRPC();
  const navigate = useNavigate();
  const distribution = useQuery(trpc.donations.distributions.get.queryOptions({ kid }));
  const donations = useQuery(trpc.donations.byKid.queryOptions({ kid }));
  const causeAreas = useCauseAreaConfig({ includeInactive: true });

  const title = `KID ${kid}`;
  if (distribution.isError) {
    return (
      <DetailPage breadcrumbs={breadcrumbs} title={title}>
        <ErrorState
          back={{ to: "/distributions", label: "All distributions" }}
          error={distribution.error}
          onRetry={() => void distribution.refetch()}
        />
      </DetailPage>
    );
  }
  const d = distribution.data;
  const stats = (
    <StatGroup>
      <Stat label="Donations" pending placeholder="00" />
      <Stat label="Total" pending />
      <Stat label="Latest donation" pending placeholder="00.00.0000" />
    </StatGroup>
  );
  if (!d) {
    // First load only (navigations wait for the distribution).
    return (
      <DetailPage
        breadcrumbs={breadcrumbs}
        title={title}
        meta={[
          <CopyValue key="kid" value={kid} label="KID" />,
          <SkeletonText key="donor">Firstname Lastname</SkeletonText>,
          <SkeletonText key="tax">Tax unit Firstname Lastname</SkeletonText>,
        ]}
        stats={stats}
        aside={
          <>
            <DetailPanel title="Split">
              <div className="py-3">
                <Skeleton className="h-16 w-full" />
              </div>
            </DetailPanel>
            <DetailPanel title="Donor">
              <PropertyList labelWidth="6.5rem">
                {["Name", "Email", "Donor ID"].map((label) => (
                  <Property key={label} label={label} pending />
                ))}
              </PropertyList>
            </DetailPanel>
          </>
        }
      >
        <PageSection
          fill
          title="Donations"
          description="Every donation registered on this KID, newest first."
        >
          <div className="flex min-h-0 flex-col">
            <DataTable
              label="Donations on this KID"
              columns={columns}
              data={undefined}
              isLoading
              getRowId={(row, index) => String(row.id ?? index)}
            />
          </div>
        </PageSection>
      </DetailPage>
    );
  }

  const rows = donations.data ?? [];
  const latest = rows.reduce<string | undefined>(
    (max, row) => (row.timestamp && (!max || row.timestamp > max) ? row.timestamp : max),
    undefined,
  );
  const total = sumMoney(rows.map((row) => row.sum));
  // donations.byKid has no defined order
  const newestFirst = [...rows].sort(
    (a, b) =>
      String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")) ||
      (b.id ?? 0) - (a.id ?? 0),
  );
  const donorName = d.donor?.name ?? d.donor?.email ?? `Donor #${d.donorId}`;

  return (
    <DetailPage
      breadcrumbs={breadcrumbs}
      title={title}
      meta={[
        <CopyValue key="kid" value={kid} label="KID" />,
        <Link
          key="donor"
          to="/donors/$id"
          params={{ id: String(d.donorId) }}
          className="text-accent hover:underline"
        >
          {donorName}
        </Link>,
        d.taxUnit ? `Tax unit ${d.taxUnit.name}` : "No tax unit",
      ]}
      stats={
        !donations.data ? (
          !donations.isError && stats
        ) : (
          <StatGroup>
            <Stat label="Donations" value={<Num value={rows.length} />} />
            <Stat label="Total" value={<Money value={total} />} />
            <Stat
              label="Latest donation"
              value={latest ? <DateTime value={latest} /> : "None yet"}
            />
          </StatGroup>
        )
      }
      aside={
        <>
          <DetailPanel title="Split">
            <div className="py-3">
              {causeAreas.data ? (
                <DistributionSummary
                  draft={draftFromApi(causeAreas.data, d)}
                  config={causeAreas.data}
                />
              ) : causeAreas.isError ? (
                <ErrorState error={causeAreas.error} onRetry={() => void causeAreas.refetch()} />
              ) : (
                <Skeleton className="h-16 w-full" />
              )}
            </div>
          </DetailPanel>
          <DetailPanel title="Donor">
            <PropertyList labelWidth="6.5rem">
              <Property label="Name">
                <Link
                  to="/donors/$id"
                  params={{ id: String(d.donorId) }}
                  className="font-semibold text-accent hover:underline"
                >
                  {donorName}
                </Link>
              </Property>
              <Property label="Email">{d.donor?.email}</Property>
              <Property label="Donor ID">
                <CopyValue value={d.donorId} prefix="#" label="donor ID" />
              </Property>
            </PropertyList>
          </DetailPanel>
          <DetailPanel title="Tax unit">
            <PropertyList labelWidth="6.5rem">
              {d.taxUnit ? (
                <>
                  <Property label="Name">{d.taxUnit.name}</Property>
                  <Property label="Number">
                    {d.taxUnit.ssn && <span className="num">{maskSsn(d.taxUnit.ssn)}</span>}
                  </Property>
                  {d.taxUnit.archived && (
                    <Property label="Archived">
                      <DateTime value={d.taxUnit.archived} />
                    </Property>
                  )}
                </>
              ) : (
                <Property label="Tax unit">
                  None: donations on this KID aren't tax deductible
                </Property>
              )}
            </PropertyList>
          </DetailPanel>
        </>
      }
    >
      {/* Intents (few rows, when there are any) go first so the donations, last, can fill. */}
      <KidIntents kid={kid} />
      <PageSection
        fill
        title="Donations"
        description="Every donation registered on this KID, newest first."
      >
        {donations.isError ? (
          <ErrorState error={donations.error} onRetry={() => void donations.refetch()} />
        ) : donations.data && rows.length === 0 ? (
          <EmptyState
            title="No donations yet"
            description="Donations show up here once a payment with this KID is registered."
          />
        ) : (
          <div className="flex min-h-0 flex-col">
            <DataTable
              label="Donations on this KID"
              columns={columns}
              data={donations.data && newestFirst}
              isLoading={donations.isPending}
              getRowId={(row, index) => String(row.id ?? index)}
              onRowOpen={(row) =>
                row.id != null &&
                void navigate({ to: "/donations/$id", params: { id: String(row.id) } })
              }
              getRowHref={(row) => `/donations/${row.id}`}
            />
          </div>
        )}
      </PageSection>
    </DetailPage>
  );
}

/** What donors said they'd give on this KID; only shown when there is something */
function KidIntents({ kid }: { kid: string }) {
  const trpc = useTRPC();
  const intents = useQuery(
    trpc.intents.list.queryOptions({ page: 0, limit: 100, filter: { KID: kid } }),
  );
  const rows = intents.data?.rows;
  if (!rows?.length) return null;
  return (
    <PageSection
      title="Intents"
      description="What the donor said they'd give with this KID, and whether it arrived."
    >
      <div className="flex max-h-[24rem] flex-col">
        <IntentsTable label="Intents on this KID" intents={rows} isLoading={false} />
      </div>
    </PageSection>
  );
}
