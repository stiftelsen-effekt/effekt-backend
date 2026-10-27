import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, type LinkProps } from "@tanstack/react-router";
import {
  ArchiveRestoreIcon,
  FlagIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  UserXIcon,
} from "lucide-react";
import { BarChart } from "@/components/charts";
import { createColumns, DataTable } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { InlineEdit } from "@/components/domain/inline-edit";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Stat, StatGroup } from "@/components/domain/stat";
import { Status } from "@/components/domain/status";
import { DetailPage, DetailPanel, PageSection } from "@/components/templates";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { agreementTypes, describeChargeDay, type AgreementRow } from "@/features/agreements/model";
import { MergeDonor } from "@/features/donors/merge-donor";
import { donorAgreements, donorTotals, yearlyChart } from "@/features/donors/model";
import { TaxUnitsSection } from "@/features/donors/tax-units";
import { CreateFundraiserDialog } from "@/features/fundraisers/create-fundraiser-dialog";
import { formatMoney } from "@/lib/format";
import { moneySign, moneyToNumber, sumMoney } from "@/lib/money";
import { notify } from "@/lib/notify";
import { agreementStatus, donorStatus } from "@/lib/status";
import { errorCode, useTRPC, type RouterOutputs } from "@/lib/trpc";

const tabs = ["donations", "kids", "agreements", "tax", "referrals"] as const;
type Tab = (typeof tabs)[number];

export const Route = createFileRoute("/_app/donors/$id")({
  validateSearch: (raw: Record<string, unknown>): { tab?: Tab } =>
    tabs.includes(raw.tab as Tab) && raw.tab !== "donations" ? { tab: raw.tab as Tab } : {},
  component: DonorPage,
});

type Donation = RouterOutputs["donors"]["donations"][number];
type Distribution = RouterOutputs["donors"]["distributionsAggregated"][number];
type Referral = RouterOutputs["donors"]["referrals"][number];

const href = (path: string) => path as LinkProps["to"];

const donationCol = createColumns<Donation>();
const donationColumns = donationCol.columns([
  donationCol.accessor("id", {
    header: "ID",
    meta: { numeric: true, cellClassName: "text-muted-foreground w-20" },
  }),
  donationCol.accessor("timestamp", {
    header: "Date",
    cell: ({ getValue }) => <DateTime value={getValue()} format="datetime" />,
  }),
  donationCol.accessor("paymentMethod", { header: "Method" }),
  donationCol.accessor("sum", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} signed={moneySign(getValue()) < 0} />,
  }),
  donationCol.accessor("transactionCost", {
    header: "Fee",
    meta: { numeric: true, cellClassName: "text-muted-foreground" },
    cell: ({ getValue }) => <Money value={getValue()} decimals={2} />,
  }),
  donationCol.accessor("KID", {
    header: "KID",
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
]);

const distributionCol = createColumns<Distribution>();
const distributionColumns = distributionCol.columns([
  distributionCol.accessor("KID", {
    header: "KID",
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  distributionCol.accessor("count", {
    header: "Donations",
    meta: { numeric: true },
    cell: ({ getValue }) => <Num value={getValue()} />,
  }),
  distributionCol.accessor("sum", {
    header: "Total",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue() ?? 0} />,
  }),
]);

const agreementCol = createColumns<AgreementRow>();
const agreementColumns = agreementCol.columns([
  agreementCol.accessor("type", {
    header: "Type",
    cell: ({ getValue }) => agreementTypes[getValue()].label,
  }),
  agreementCol.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => <Status catalog={agreementStatus} value={getValue()} />,
  }),
  agreementCol.accessor("amount", {
    header: "Monthly",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  agreementCol.accessor("chargeDay", {
    header: "Charge day",
    cell: ({ getValue }) => describeChargeDay(getValue()),
  }),
  agreementCol.accessor("KID", {
    header: "KID",
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  agreementCol.accessor("created", {
    header: "Created",
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

function DonorPage() {
  const { id } = Route.useParams();
  const donorId = Number(id);
  if (!Number.isInteger(donorId) || donorId <= 0) {
    return (
      <EmptyState
        icon={UserXIcon}
        title="No such donor"
        description={`“${id}” isn't a donor ID.`}
        className="flex-1"
      />
    );
  }
  return <Donor donorId={donorId} />;
}

function Donor({ donorId }: { donorId: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { tab = "donations" } = Route.useSearch();
  const input = { donorId };

  const donorQuery = useQuery(trpc.donors.get.queryOptions(input));
  const aggregated = useQuery(trpc.donors.donationsAggregated.queryOptions(input));
  const donations = useQuery(trpc.donors.donations.queryOptions(input));
  const distributions = useQuery(trpc.donors.distributionsAggregated.queryOptions(input));
  const vipps = useQuery(trpc.donors.recurring.vipps.queryOptions(input));
  const avtalegiro = useQuery(trpc.donors.recurring.avtalegiro.queryOptions(input));
  const taxUnits = useQuery(trpc.donors.taxUnits.list.queryOptions({ donorId }));
  const referrals = useQuery(trpc.donors.referrals.queryOptions(input));
  const referralTypes = useQuery(trpc.config.referralTypes.listAll.queryOptions());

  const getKey = trpc.donors.get.queryKey(input);
  const update = useMutation(
    trpc.donors.update.mutationOptions({
      onSuccess: (donor) => {
        queryClient.setQueryData(getKey, donor);
        void queryClient.invalidateQueries({ queryKey: trpc.donors.list.pathKey() });
        void queryClient.invalidateQueries({ queryKey: trpc.donors.search.pathKey() });
      },
    }),
  );

  if (donorQuery.isPending) return <DonorSkeleton />;
  if (donorQuery.isError) {
    return (
      <div className="p-6">
        <ErrorState
          error={donorQuery.error}
          title={
            errorCode(donorQuery.error) === "NOT_FOUND"
              ? `No donor #${donorId}`
              : "Couldn't load the donor"
          }
          onRetry={() => void donorQuery.refetch()}
        />
      </div>
    );
  }
  const donor = donorQuery.data;
  const displayName = donor.name || donor.email;

  /** Flag changes are optimistic with undo (DESIGN.md › Optimism, undo and feedback). */
  function setFlag(
    patch: { newsletter?: boolean; trash?: boolean },
    message: string,
    undo: typeof patch,
  ) {
    const previous = queryClient.getQueryData(getKey);
    queryClient.setQueryData(getKey, { ...donor, ...patch });
    update.mutate(
      { donorId, name: donor.name, ...patch },
      {
        onSuccess: () => notify.undo(message, () => setFlag(undo, "Change undone", patch)),
        onError: (error) => {
          queryClient.setQueryData(getKey, previous);
          notify.error(error, "Couldn't update the donor");
        },
      },
    );
  }

  const totals = aggregated.data ? donorTotals(aggregated.data) : null;
  const chart = aggregated.data ? yearlyChart(aggregated.data) : null;
  const thisYear = new Date().getFullYear();
  const thisYearTotal = totals?.byYear.get(thisYear) ?? "0";
  const lastYearTotal = totals?.byYear.get(thisYear - 1);
  const lastYearNumber = moneyToNumber(lastYearTotal);

  const agreements = donorAgreements(displayName, {
    vipps: vipps.data,
    avtalegiro: avtalegiro.data,
  });
  const activeAgreements = agreements.filter((agreement) => agreement.status === "active");
  const agreementsLoading = vipps.isPending || avtalegiro.isPending;
  const agreementsError = vipps.error ?? avtalegiro.error ?? null;

  const typeNames = new Map((referralTypes.data ?? []).map((type) => [type.id, type.name]));
  const heardVia = (referrals.data ?? [])
    .map((answer) => {
      const type = typeNames.get(answer.typeId);
      const words = answer.answer?.trim();
      return words && words !== type ? `${type ?? "Other"}: ${words}` : type;
    })
    .filter(Boolean)
    .join(", ");

  const setTab = (next: string) =>
    void navigate({
      to: ".",
      replace: true,
      search: next === "donations" ? {} : { tab: next as Tab },
    });

  const sortedDonations = [...(donations.data ?? [])].sort((a, b) =>
    (b.timestamp ?? "").localeCompare(a.timestamp ?? ""),
  );

  return (
    <DetailPage
      breadcrumbs={[{ label: "Donors", to: "/donors" }]}
      title={displayName}
      adornment={donor.trash && <Status catalog={donorStatus} value="trash" />}
      meta={[
        <CopyValue key="id" value={donor.id} prefix="#" label="donor ID" />,
        donor.email,
        donor.registered && (
          <span key="since">
            Donor since <DateTime value={donor.registered} format="month" />
          </span>
        ),
      ].filter(Boolean)}
      actions={
        <>
          <CreateFundraiserDialog
            donor={{ id: donor.id, name: donor.name, email: donor.email }}
            trigger={
              <Button>
                <FlagIcon />
                Create fundraiser
              </Button>
            }
          />
          <MergeDonor
            donor={donor}
            counts={
              donations.data && distributions.data && taxUnits.data
                ? {
                    donations: donations.data.length,
                    agreements: agreements.length,
                    taxUnits: taxUnits.data.length,
                    kids: distributions.data.length,
                  }
                : undefined
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" aria-label="More actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {donor.trash ? (
                <DropdownMenuItem
                  onSelect={() => setFlag({ trash: false }, "Restored from trash", { trash: true })}
                >
                  <ArchiveRestoreIcon />
                  Restore from trash
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="danger"
                  onSelect={() => setFlag({ trash: true }, "Moved to trash", { trash: false })}
                >
                  <Trash2Icon />
                  Move to trash
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      stats={
        aggregated.isError ? (
          <ErrorState
            error={aggregated.error}
            title="Couldn't load the totals"
            onRetry={() => void aggregated.refetch()}
          />
        ) : (
          <StatGroup>
            <Stat
              label="Given in total"
              value={totals ? <Money value={totals.total} /> : <Skeleton className="h-7 w-28" />}
              hint={
                donations.data && (
                  <>
                    <Num value={donations.data.length} /> donations
                  </>
                )
              }
            />
            <Stat
              label="Excluding operations"
              value={
                totals ? (
                  <Money value={totals.excludingOperations} />
                ) : (
                  <Skeleton className="h-7 w-28" />
                )
              }
              hint={totals && `${formatMoney(totals.operations)} to operations`}
            />
            <Stat
              label={`In ${thisYear}`}
              value={totals ? <Money value={thisYearTotal} /> : <Skeleton className="h-7 w-28" />}
              delta={
                totals && lastYearNumber > 0
                  ? moneyToNumber(thisYearTotal) / lastYearNumber - 1
                  : undefined
              }
              deltaLabel={lastYearNumber > 0 ? `vs. ${thisYear - 1}` : undefined}
            />
            <Stat
              label="Active agreements"
              value={
                agreementsLoading ? <Skeleton className="h-7 w-10" /> : activeAgreements.length
              }
              hint={
                activeAgreements.length > 0 &&
                `${formatMoney(sumMoney(activeAgreements.map((a) => a.amount)))} / month`
              }
            />
          </StatGroup>
        )
      }
      aside={
        <DetailPanel title="Contact">
          <PropertyList labelWidth="6.5rem">
            <Property label="Name">
              <InlineEdit
                label="Name"
                value={donor.name}
                validate={(value) => (value.trim() ? null : "Enter a name")}
                onSave={async (name) => {
                  await update.mutateAsync({ donorId, name: name.trim() });
                  notify.success("Name updated");
                }}
              />
            </Property>
            <Property label="Email">
              <InlineEdit
                label="Email"
                type="email"
                value={donor.email}
                validate={(value) =>
                  /^\S+@\S+\.\S+$/.test(value.trim()) ? null : "Enter a valid email address"
                }
                onSave={async (email) => {
                  await update.mutateAsync({ donorId, name: donor.name, email: email.trim() });
                  notify.success("Email updated");
                }}
              />
            </Property>
            <Property label="Newsletter">
              <label className="inline-flex items-center gap-2">
                <Switch
                  checked={Boolean(donor.newsletter)}
                  onCheckedChange={(newsletter) =>
                    setFlag(
                      { newsletter },
                      newsletter ? "Subscribed to newsletter" : "Unsubscribed from newsletter",
                      { newsletter: !newsletter },
                    )
                  }
                />
                {donor.newsletter ? "Subscribed" : "Not subscribed"}
              </label>
            </Property>
            <Property label="Registered">
              <DateTime value={donor.registered} format="datetime" />
            </Property>
            <Property label="Heard via">{heardVia}</Property>
          </PropertyList>
        </DetailPanel>
      }
    >
      <PageSection title="Given per year" description="By organization">
        {aggregated.isPending ? (
          <Skeleton className="h-56" />
        ) : chart && chart.data.length > 0 ? (
          <BarChart
            data={chart.data}
            xKey="year"
            stacked
            format="money"
            series={chart.series}
            className="h-56"
          />
        ) : (
          !aggregated.isError && <p className="text-sm text-muted-foreground">No donations yet.</p>
        )}
      </PageSection>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="donations" count={donations.data?.length}>
            Donations
          </TabsTrigger>
          <TabsTrigger value="kids" count={distributions.data?.length}>
            KIDs
          </TabsTrigger>
          <TabsTrigger value="agreements" count={agreementsLoading ? undefined : agreements.length}>
            Agreements
          </TabsTrigger>
          <TabsTrigger value="tax" count={taxUnits.data?.length}>
            Tax units
          </TabsTrigger>
          <TabsTrigger value="referrals" count={referrals.data?.length}>
            Referrals
          </TabsTrigger>
        </TabsList>
        <TabsContent value="donations" className="flex max-h-[36rem] flex-col">
          {donations.isError ? (
            <ErrorState error={donations.error} onRetry={() => void donations.refetch()} />
          ) : (
            <DataTable
              label="Donations by this donor"
              columns={donationColumns}
              data={sortedDonations}
              isLoading={donations.isPending}
              getRowId={(row) => String(row.id)}
              onRowOpen={(row) => void navigate({ to: href(`/donations/${row.id}`) })}
              getRowHref={(row) => `/donations/${row.id}`}
              empty={
                <EmptyState
                  size="sm"
                  title="No donations yet"
                  description="Donations show up here once they're registered."
                />
              }
            />
          )}
        </TabsContent>
        <TabsContent value="kids" className="flex max-h-[36rem] flex-col">
          {distributions.isError ? (
            <ErrorState error={distributions.error} onRetry={() => void distributions.refetch()} />
          ) : (
            <DataTable
              label="KIDs"
              columns={distributionColumns}
              data={distributions.data}
              isLoading={distributions.isPending}
              getRowId={(row) => row.KID}
              onRowOpen={(row) => void navigate({ to: href(`/distributions/${row.KID}`) })}
              getRowHref={(row) => `/distributions/${row.KID}`}
              empty={
                <EmptyState
                  size="sm"
                  title="No KIDs"
                  description="The donor has no distributions."
                />
              }
            />
          )}
        </TabsContent>
        <TabsContent value="agreements" className="flex flex-col">
          {agreementsError ? (
            <ErrorState error={agreementsError} title="Couldn't load agreements" />
          ) : (
            <DataTable
              label="Agreements"
              columns={agreementColumns}
              data={agreementsLoading ? undefined : agreements}
              isLoading={agreementsLoading}
              getRowId={(row) => row.key}
              onRowOpen={(row) => void navigate({ to: href(row.href) })}
              getRowHref={(row) => row.href}
              empty={
                <EmptyState
                  size="sm"
                  title="No agreements"
                  description="The donor has no recurring donations."
                />
              }
            />
          )}
        </TabsContent>
        <TabsContent value="tax">
          <TaxUnitsSection donorId={donorId} donorName={donor.name} />
        </TabsContent>
        <TabsContent value="referrals" className="flex flex-col">
          <ReferralsTable
            referrals={referrals.data}
            isLoading={referrals.isPending}
            typeNames={typeNames}
          />
        </TabsContent>
      </Tabs>
    </DetailPage>
  );
}

function ReferralsTable({
  referrals,
  isLoading,
  typeNames,
}: {
  referrals: Referral[] | undefined;
  isLoading: boolean;
  typeNames: Map<number, string>;
}) {
  const col = createColumns<Referral>();
  const columns = col.columns([
    col.accessor("typeId", {
      header: "Heard about us via",
      cell: ({ getValue }) => typeNames.get(getValue()) ?? `Type ${getValue()}`,
    }),
    col.accessor("answer", {
      header: "Their words",
      cell: ({ getValue }) => getValue() || <span className="text-faint-foreground">–</span>,
    }),
    col.accessor("timestamp", {
      header: "Answered",
      cell: ({ getValue }) => <DateTime value={getValue()} />,
    }),
  ]);
  return (
    <DataTable
      label="Referral answers"
      columns={columns}
      data={referrals}
      isLoading={isLoading}
      getRowId={(row) => String(row.id)}
      empty={
        <EmptyState
          size="sm"
          title="No referral answers"
          description="The donor didn't say how they heard about us."
        />
      }
    />
  );
}

function DonorSkeleton() {
  return (
    <div className="grid gap-6 p-6" aria-busy>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-20" />
      <Skeleton className="h-56" />
    </div>
  );
}
