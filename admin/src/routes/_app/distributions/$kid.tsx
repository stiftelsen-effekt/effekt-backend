import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createColumns, DataTable } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { DistributionSummary } from "@/components/domain/distribution-editor";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Stat, StatGroup } from "@/components/domain/stat";
import { DetailPage, DetailPanel, PageSection } from "@/components/templates";
import { Skeleton } from "@/components/ui/skeleton";
import { draftFromApi } from "@/features/distribution/model";
import { useCauseAreaConfig } from "@/features/distribution/queries";
import { moneyDecimals } from "@/features/donations/form";
import { sumMoney } from "@/lib/money";
import { useTRPC, type RouterOutputs } from "@/lib/trpc";

export const Route = createFileRoute("/_app/distributions/$kid")({
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
  col.accessor("paymentMethod", { header: "Method" }),
  col.accessor("sum", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} decimals={moneyDecimals(getValue())} />,
  }),
  col.accessor("transactionCost", {
    header: "Fee",
    meta: { numeric: true, cellClassName: "text-muted-foreground" },
    cell: ({ getValue }) => <Money value={getValue()} decimals={2} />,
  }),
]);

const breadcrumbs = [{ label: "Distributions", to: "/distributions" }];

/** Personal numbers show the birth date only; organization numbers in full. */
const maskSsn = (ssn: string) => (ssn.length === 11 ? ssn.replace(/^(\d{6})\d+/, "$1 •••••") : ssn);

function DistributionPage() {
  const { kid } = Route.useParams();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const distribution = useQuery(trpc.donations.distributions.get.queryOptions({ kid }));
  const donations = useQuery(trpc.donations.byKid.queryOptions({ kid }));
  const causeAreas = useCauseAreaConfig({ includeInactive: true });

  const title = `KID ${kid}`;
  if (distribution.isError) {
    return (
      <DetailPage breadcrumbs={breadcrumbs} title={title}>
        <ErrorState error={distribution.error} onRetry={() => void distribution.refetch()} />
      </DetailPage>
    );
  }
  const d = distribution.data;
  if (!d) {
    return (
      <DetailPage breadcrumbs={breadcrumbs} title={title}>
        <div className="grid gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
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
          to="/$"
          params={{ _splat: `donors/${d.donorId}` }}
          className="text-accent hover:underline"
        >
          {donorName}
        </Link>,
        d.taxUnit ? `Tax unit ${d.taxUnit.name}` : "No tax unit",
      ]}
      stats={
        donations.data && (
          <StatGroup>
            <Stat label="Donations" value={<Num value={rows.length} />} />
            <Stat label="Total" value={<Money value={total} decimals={moneyDecimals(total)} />} />
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
                  to="/$"
                  params={{ _splat: `donors/${d.donorId}` }}
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
      <PageSection
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
          <div className="flex max-h-[36rem] flex-col">
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
