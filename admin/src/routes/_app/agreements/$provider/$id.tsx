import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, type LinkProps } from "@tanstack/react-router";
import { useRecordParams } from "@/components/panels";
import { ArrowUpRightIcon, RotateCwIcon } from "lucide-react";
import type { ReactNode } from "react";
import { createColumns, DataTable } from "@/components/data-table";
import { Callout } from "@/components/domain/callout";
import { CopyValue } from "@/components/domain/copy-value";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Stat, StatGroup } from "@/components/domain/stat";
import { Status } from "@/components/domain/status";
import { DetailPage, DetailPanel, PageSection } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import {
  ActivateAgreementDialog,
  ChangeAmountDialog,
  ChangeChargeDayDialog,
  StopAgreementDialog,
} from "@/features/agreements/agreement-actions";
import {
  AgreementDistribution,
  type SplitInput,
} from "@/features/agreements/agreement-distribution";
import { listProviders, toListStatus, type ListProvider } from "@/features/agreements/list";
import { agreementTypes, describeChargeDay } from "@/features/agreements/model";
import { formatMoney } from "@/lib/format";
import { sumMoney } from "@/lib/money";
import { notify } from "@/lib/notify";
import { agreementStatus, chargeStatus, type AgreementStatus } from "@/lib/status";
import { loadPage } from "@/lib/route-data";
import { unbatched, useTRPC, type RouterOutputs } from "@/lib/trpc";

export const Route = createFileRoute("/_app/agreements/$provider/$id")({
  loader: ({ context: { queryClient, trpc }, params: { provider, id }, cause }) => {
    if (provider === "vipps") {
      return loadPage(queryClient, cause, vippsStoredOptions(trpc, id), [
        trpc.vipps.agreements.payments.queryOptions({ id }),
        normalisedVippsOptions(trpc, id),
      ]);
    }
    const numericId = Number(id);
    if (provider !== "avtalegiro" || !(Number.isInteger(numericId) && numericId > 0)) return;
    return loadPage(queryClient, cause, trpc.giro.avtalegiro.get.queryOptions({ id: numericId }), [
      trpc.giro.avtalegiro.payments.queryOptions({ agreementId: numericId }),
      { ...trpc.config.causeAreas.listAll.queryOptions(), staleTime: 5 * 60_000 },
    ]);
  },
  component: AgreementPage,
});

/** Our database's copy of a Vipps agreement (the page is built from it). */
const vippsStoredOptions = (trpc: ReturnType<typeof useTRPC>, id: string) =>
  trpc.vipps.agreements.list.queryOptions({ page: 0, limit: 50, filter: { agreementID: id } });
/** The normalised row (status, pause, donor) for exactly this agreement. */
const normalisedVippsOptions = (trpc: ReturnType<typeof useTRPC>, id: string) =>
  trpc.agreements.list.queryOptions({
    page: 0,
    limit: 1,
    filter: { providers: ["vipps"], ids: [id] },
  });

/** Vipps refuses amounts above this (vipps.agreements.updatePrice). */
const VIPPS_MAX_NOK = 1_000_000;
/** Largest whole NOK the AvtaleGiro amount column holds (giro.avtalegiro.updateAmount). */
const AVTALEGIRO_MAX_NOK = 21_474_836;

const breadcrumbs = [{ label: "Agreements", to: "/agreements" }];

function AgreementPage() {
  const { provider, id } = useRecordParams(Route);
  if (!(listProviders as readonly string[]).includes(provider)) {
    return (
      <DetailPage breadcrumbs={breadcrumbs} title="Agreement">
        <EmptyState
          title="Unknown agreement type"
          description={`"${provider}" agreements aren't handled in this admin. Vipps and AvtaleGiro agreements are.`}
        />
      </DetailPage>
    );
  }
  return (provider as ListProvider) === "vipps" ? (
    <VippsAgreementPage id={id} />
  ) : (
    <AvtaleGiroAgreementPage id={id} />
  );
}

/** What every agreement page shows, whatever the provider. */
type AgreementFacts = {
  provider: ListProvider;
  id: string;
  KID: string;
  donorId: number | null;
  donorName: string;
  amount: number;
  chargeDay: number;
  status: AgreementStatus;
  providerStatus: string;
  created: string | null;
  lastUpdated: string | null;
  cancelled: string | null;
  pausedUntil: string | null;
};

type Payment = {
  key: string;
  date: string | null;
  amount: string | number;
  status?: keyof typeof chargeStatus;
  href?: string;
  reference: string;
};

const paymentCol = createColumns<Payment>();
const paymentColumns = (withStatus: boolean) =>
  paymentCol.columns([
    paymentCol.accessor("date", {
      header: withStatus ? "Due" : "Date",
      cell: ({ getValue }) => <DateTime value={getValue()} />,
    }),
    ...(withStatus
      ? [
          paymentCol.accessor("status", {
            header: "Status",
            cell: ({ getValue }) => {
              const value = getValue();
              return value ? <Status catalog={chargeStatus} value={value} /> : null;
            },
          }),
        ]
      : []),
    paymentCol.accessor("amount", {
      header: "Amount",
      meta: { numeric: true, cellClassName: "font-semibold" },
      cell: ({ getValue }) => <Money value={getValue()} />,
    }),
    paymentCol.accessor("reference", {
      header: withStatus ? "Reference" : "Donation",
      meta: { cellClassName: "text-muted-foreground" },
      cell: ({ getValue }) => (
        <CopyValue value={getValue()} label={withStatus ? "reference" : "donation ID"} />
      ),
    }),
  ]);

const toIso = (value: string | Date | null | undefined) =>
  value == null ? null : typeof value === "string" ? value : value.toISOString();

function useInvalidateAgreements() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.agreements.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.vipps.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.giro.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.donations.distributions.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.donors.pathKey() }),
    ]);
}

function AgreementLayout({
  facts,
  title,
  actions,
  providerPanel,
  callout,
  distribution,
  payments,
  paymentsTitle,
  paymentsDescription,
  paymentsLink,
  paymentsError,
  onRetryPayments,
  withStatus,
}: {
  facts: AgreementFacts;
  title: string;
  actions: ReactNode;
  providerPanel?: ReactNode;
  callout?: ReactNode;
  distribution: ReactNode;
  payments: Payment[] | undefined;
  paymentsTitle: string;
  paymentsDescription: string;
  paymentsLink?: ReactNode;
  paymentsError?: unknown;
  onRetryPayments: () => void;
  withStatus: boolean;
}) {
  const navigate = useNavigate();
  const received = payments?.filter((p) => !p.status || p.status === "CHARGED");
  const total = received && sumMoney(received.map((p) => p.amount));
  const last = received?.reduce<string | null>(
    (max, p) => (p.date && (!max || p.date > max) ? p.date : max),
    null,
  );
  const donorLink = (children: ReactNode) =>
    facts.donorId != null ? (
      <Link
        to="/donors/$id"
        params={{ id: String(facts.donorId) }}
        className="font-semibold text-accent hover:underline focus-ring rounded-xs"
      >
        {children}
      </Link>
    ) : (
      children
    );

  return (
    <DetailPage
      breadcrumbs={breadcrumbs}
      title={title}
      adornment={<Status catalog={agreementStatus} value={facts.status} />}
      meta={[
        <Badge key="type" tone="outline">
          {agreementTypes[facts.provider].label}
        </Badge>,
        <span key="donor">{donorLink(facts.donorName || `Donor #${facts.donorId}`)}</span>,
        <span key="kid">
          KID <CopyValue value={facts.KID} label="KID" />
        </span>,
      ]}
      actions={actions}
      stats={
        <StatGroup>
          <Stat label="Monthly amount" value={<Money value={facts.amount} />} />
          <Stat label="Charge day" value={describeChargeDay(facts.chargeDay)} />
          <Stat
            label={withStatus ? "Charged" : "Received"}
            pending={total === undefined && !paymentsError}
            value={total !== undefined && <Money value={total} />}
            hint={
              received && (
                <>
                  <Num value={received.length} /> {received.length === 1 ? "payment" : "payments"}
                </>
              )
            }
          />
          <Stat
            label="Last payment"
            pending={received === undefined && !paymentsError}
            placeholder="00.00.0000"
            value={last ? <DateTime value={last} /> : "None yet"}
          />
        </StatGroup>
      }
      aside={
        <>
          <DetailPanel title="Agreement">
            <PropertyList labelWidth="7rem">
              <Property
                label="Status"
                hint={`${agreementTypes[facts.provider].label}: ${facts.providerStatus || "–"}`}
              >
                <Status catalog={agreementStatus} value={facts.status} />
              </Property>
              <Property label="Monthly">
                <Money value={facts.amount} className="font-semibold" />
              </Property>
              <Property label="Charged">{describeChargeDay(facts.chargeDay)}</Property>
              {facts.pausedUntil && (
                <Property label="Paused until">
                  <DateTime value={facts.pausedUntil} />
                </Property>
              )}
              <Property label="KID">
                <Link
                  to="/distributions/$kid"
                  params={{ kid: facts.KID }}
                  className="num text-accent hover:underline focus-ring rounded-xs"
                >
                  {facts.KID}
                </Link>
              </Property>
              <Property label="Agreement ID">
                <CopyValue value={facts.id} label="agreement ID" />
              </Property>
              <Property label="Created">
                <DateTime value={facts.created} format="datetime" />
              </Property>
              {facts.lastUpdated && (
                <Property label="Last updated">
                  <DateTime value={facts.lastUpdated} format="datetime" />
                </Property>
              )}
              {facts.cancelled && (
                <Property label="Cancelled">
                  <DateTime value={facts.cancelled} />
                </Property>
              )}
            </PropertyList>
          </DetailPanel>
          <DetailPanel title="Donor">
            <PropertyList labelWidth="7rem">
              <Property label="Name">{donorLink(facts.donorName || "–")}</Property>
              {facts.donorId != null && (
                <Property label="Donor ID">
                  <CopyValue value={facts.donorId} prefix="#" label="donor ID" />
                </Property>
              )}
            </PropertyList>
          </DetailPanel>
          {providerPanel}
        </>
      }
    >
      {callout}
      {distribution}
      <PageSection title={paymentsTitle} description={paymentsDescription} actions={paymentsLink}>
        {paymentsError ? (
          <ErrorState error={paymentsError} onRetry={onRetryPayments} />
        ) : payments && payments.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Payments show up here once the first charge on this agreement is registered."
          />
        ) : (
          <div className="flex max-h-[32rem] flex-col">
            <DataTable
              label={paymentsTitle}
              columns={paymentColumns(withStatus)}
              data={payments}
              isLoading={payments === undefined}
              getRowId={(row) => row.key}
              getRowHref={(row) => row.href ?? ""}
              onRowOpen={(row) => row.href && void navigate({ to: row.href as LinkProps["to"] })}
            />
          </div>
        )}
      </PageSection>
    </DetailPage>
  );
}

function LoadingOrError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <DetailPage breadcrumbs={breadcrumbs} title={title}>
      {error ? (
        <ErrorState
          back={{ to: "/agreements", label: "All agreements" }}
          error={error}
          onRetry={onRetry}
        />
      ) : null}
    </DetailPage>
  );
}

/**
 * First load only (navigations wait for the agreement): the agreement page's layout with
 * placeholders for its values.
 */
function AgreementPending({ title }: { title: string }) {
  return (
    <DetailPage
      breadcrumbs={breadcrumbs}
      title={title}
      adornment={<SkeletonText className="text-sm">Active</SkeletonText>}
      meta={[
        <SkeletonText key="type">AvtaleGiro</SkeletonText>,
        <SkeletonText key="donor">Firstname Lastname</SkeletonText>,
        <SkeletonText key="kid">KID 000000000000000</SkeletonText>,
      ]}
      stats={
        <StatGroup>
          <Stat label="Monthly amount" pending />
          <Stat label="Charge day" pending placeholder="The 00th" />
          <Stat label="Received" pending />
          <Stat label="Last payment" pending placeholder="00.00.0000" />
        </StatGroup>
      }
      aside={
        <>
          <DetailPanel title="Agreement">
            <PropertyList labelWidth="7rem">
              {["Status", "Monthly", "Charged", "KID", "Agreement ID", "Created"].map((label) => (
                <Property key={label} label={label} pending placeholder="Placeholder" />
              ))}
            </PropertyList>
          </DetailPanel>
          <DetailPanel title="Donor">
            <PropertyList labelWidth="7rem">
              <Property label="Name" pending />
              <Property label="Donor ID" pending placeholder="#00000" />
            </PropertyList>
          </DetailPanel>
        </>
      }
    >
      <PageSection
        title="Distribution"
        description="How each payment is split between cause areas."
      >
        <Skeleton className="h-24 w-full" />
      </PageSection>
    </DetailPage>
  );
}

// region Vipps

type VippsLive = RouterOutputs["vipps"]["agreements"]["get"];

function VippsAgreementPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const invalidate = useInvalidateAgreements();
  // Our database's copy. vipps.agreements.get goes to Vipps (and fails when Vipps can't be
  // reached), so the page is built from the database and shows Vipps' view next to it.
  const stored = useQuery(vippsStoredOptions(trpc, id));
  const row = stored.data?.rows.find((r) => r.ID === id);
  // The normalised row (status, pause, donor) for exactly this agreement.
  const normalised = useQuery({ ...normalisedVippsOptions(trpc, id), enabled: Boolean(row) });
  const listRow = normalised.data?.rows.find((r) => r.id === id);
  const live = useQuery({
    ...trpc.vipps.agreements.get.queryOptions({ id }, unbatched),
    enabled: Boolean(row),
    retry: false,
  });
  // Charges and donations under every KID the agreement has had (vipps.agreements.payments).
  const charges = useQuery({
    ...trpc.vipps.agreements.payments.queryOptions({ id }),
    enabled: Boolean(row),
  });
  const distribution = useQuery({
    ...trpc.donations.distributions.get.queryOptions({ kid: row?.KID ?? "" }),
    enabled: Boolean(row?.KID),
  });

  const updatePrice = useMutation(trpc.vipps.agreements.updatePrice.mutationOptions(unbatched));
  const cancel = useMutation(trpc.vipps.agreements.cancel.mutationOptions(unbatched));
  const updateChargeDay = useMutation(trpc.vipps.agreements.updateChargeDay.mutationOptions());
  const updateDistribution = useMutation(
    trpc.vipps.agreements.updateDistribution.mutationOptions(),
  );

  const title = "Vipps agreement";
  if (stored.isPending) return <AgreementPending title={title} />;
  if (stored.isError) {
    return (
      <LoadingOrError title={title} error={stored.error} onRetry={() => void stored.refetch()} />
    );
  }
  if (!row) {
    return (
      <DetailPage breadcrumbs={breadcrumbs} title={title}>
        <EmptyState
          title="No Vipps agreement with this ID"
          description={`We have no agreement ${id}. It may have been deleted, or the ID is mistyped.`}
        />
      </DetailPage>
    );
  }

  const upper = String(row.status ?? "").toUpperCase();
  const facts: AgreementFacts = {
    provider: "vipps",
    id,
    KID: row.KID,
    donorId: listRow?.donorId ?? distribution.data?.donorId ?? null,
    donorName: row.full_name ?? listRow?.donorName ?? "",
    amount: Number(row.amount),
    chargeDay: row.monthly_charge_day,
    status:
      (listRow && toListStatus(listRow.status)) ??
      (upper === "ACTIVE"
        ? "active"
        : upper === "STOPPED" || upper === "EXPIRED"
        ? "stopped"
        : "pending"),
    providerStatus: listRow?.providerStatus ?? upper,
    created: toIso(row.timestamp_created),
    lastUpdated: null,
    cancelled: toIso(listRow?.cancelled),
    pausedUntil: listRow?.pausedUntil ?? null,
  };
  const subject = { type: "vipps" as const, ...facts };
  const stopped = facts.status === "stopped";

  // One row per charge (its donation when registered), plus donations registered without one
  // (e.g. from a settlement report).
  const payments: Payment[] | undefined =
    charges.data &&
    [
      ...charges.data.charges.map((charge) => ({
        key: `charge-${charge.chargeId}`,
        date: charge.dueDate,
        amount: charge.amount,
        status: charge.status as keyof typeof chargeStatus,
        reference: charge.chargeId,
        href:
          charge.donationId != null
            ? `/donations/${charge.donationId}`
            : `/charges?charge=${encodeURIComponent(charge.chargeId)}`,
      })),
      ...charges.data.donations
        .filter((donation) => donation.chargeId == null)
        .map((donation) => ({
          key: `donation-${donation.id}`,
          date: toIso(donation.timestamp),
          amount: donation.sum,
          reference: `Donation ${donation.id}`,
          href: `/donations/${donation.id}`,
        })),
    ].sort((x, y) => String(y.date ?? "").localeCompare(String(x.date ?? "")));

  const run = async (action: Promise<unknown>, message: string) => {
    await action;
    await invalidate();
    notify.success(message, `${facts.donorName} · Vipps`);
  };

  return (
    <AgreementLayout
      facts={facts}
      title={title}
      withStatus
      actions={
        !stopped && (
          <>
            <ChangeAmountDialog
              agreement={subject}
              max={VIPPS_MAX_NOK}
              consequences={["Vipps is updated first. If Vipps refuses, nothing changes here."]}
              onConfirm={(amountNok) =>
                run(
                  updatePrice.mutateAsync({ id, amountNok }),
                  `Amount changed to ${formatMoney(amountNok)}`,
                )
              }
            />
            <ChangeChargeDayDialog
              agreement={subject}
              consequences={["Charges are created on the new day from now on."]}
              onConfirm={(chargeDay) =>
                run(updateChargeDay.mutateAsync({ id, chargeDay }), "Charge day changed")
              }
            />
            <StopAgreementDialog
              agreement={subject}
              consequences={[
                "The agreement is stopped in Vipps. To give again, the donor has to sign up again.",
              ]}
              onConfirm={() => run(cancel.mutateAsync({ id }), "Agreement stopped")}
            />
          </>
        )
      }
      callout={
        stopped ? (
          <Callout title="This agreement is stopped">
            Stopped agreements can't be changed. The donor has to sign up again to restart.
          </Callout>
        ) : undefined
      }
      providerPanel={<VippsPanel live={live} storedAmount={facts.amount} />}
      distribution={
        <AgreementDistribution
          distribution={distribution.data}
          error={distribution.error}
          onRetry={() => void distribution.refetch()}
          title={`${facts.donorName}'s Vipps agreement`}
          consequences={[
            "Future charges use a KID with the new split (an existing one or a new one). Past donations keep theirs.",
          ]}
          onSave={async (split: SplitInput) => {
            const result = await updateDistribution.mutateAsync({ id, distribution: split });
            await invalidate();
            notify.success(
              "Distribution changed",
              result.KID !== facts.KID ? `Now on KID ${result.KID}` : undefined,
            );
          }}
        />
      }
      payments={payments}
      paymentsError={charges.error}
      onRetryPayments={() => void charges.refetch()}
      paymentsTitle="Payments"
      paymentsDescription={
        charges.data && charges.data.KIDs.length > 1
          ? `Charges and donations on this agreement, newest first, including earlier KIDs (${charges.data.KIDs.join(
              ", ",
            )}).`
          : "Charges and donations on this agreement, newest first."
      }
      paymentsLink={
        <Button asChild size="sm" variant="ghost">
          <Link to="/charges" search={{ agreement: id }}>
            All charges
            <ArrowUpRightIcon />
          </Link>
        </Button>
      }
    />
  );
}

/** What Vipps itself says about the agreement; Vipps can be unreachable. */
function VippsPanel({
  live,
  storedAmount,
}: {
  live: {
    data?: VippsLive;
    error: unknown;
    isPending: boolean;
    isFetching: boolean;
    refetch: () => unknown;
  };
  storedAmount: number;
}) {
  const refresh = (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label="Fetch from Vipps again"
      onClick={() => void live.refetch()}
      pending={live.isFetching}
    >
      <RotateCwIcon />
    </Button>
  );
  return (
    <DetailPanel title="In Vipps" actions={refresh}>
      {live.error ? (
        <div className="py-3">
          <Callout tone="warning" title="Couldn't reach Vipps">
            Showing what our database has. Changing the amount or stopping the agreement needs
            Vipps, so those will fail until Vipps answers again.
          </Callout>
        </div>
      ) : live.isPending || !live.data ? (
        <PropertyList labelWidth="7rem">
          <Property label="Status" pending placeholder="ACTIVE" />
          <Property label="Price" pending placeholder="000 kr" />
        </PropertyList>
      ) : (
        <PropertyList labelWidth="7rem">
          <Property label="Status">{String(live.data.status)}</Property>
          <Property
            label="Price"
            hint={
              live.data.pricing.amount / 100 !== storedAmount
                ? `Differs from our ${formatMoney(storedAmount)}; fetching updated our copy.`
                : undefined
            }
          >
            <Money value={live.data.pricing.amount / 100} className="font-semibold" />
          </Property>
        </PropertyList>
      )}
    </DetailPanel>
  );
}

// endregion

// region AvtaleGiro

function AvtaleGiroAgreementPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const invalidate = useInvalidateAgreements();
  const numericId = Number(id);
  const valid = Number.isInteger(numericId) && numericId > 0;
  const agreement = useQuery({
    ...trpc.giro.avtalegiro.get.queryOptions({ id: numericId }),
    enabled: valid,
  });
  const KID = agreement.data?.KID ?? "";
  // Under every KID the agreement has had, so a distribution change doesn't hide earlier ones.
  const donations = useQuery({
    ...trpc.giro.avtalegiro.payments.queryOptions({ agreementId: numericId }),
    enabled: valid,
  });
  const updateAmount = useMutation(trpc.giro.avtalegiro.updateAmount.mutationOptions());
  const updateStatus = useMutation(trpc.giro.avtalegiro.updateStatus.mutationOptions());
  const updatePaymentDate = useMutation(trpc.giro.avtalegiro.updatePaymentDate.mutationOptions());
  const updateDistribution = useMutation(trpc.giro.avtalegiro.updateDistribution.mutationOptions());

  const title = "AvtaleGiro agreement";
  if (!valid) {
    return (
      <DetailPage breadcrumbs={breadcrumbs} title={title}>
        <EmptyState
          title="Not an agreement ID"
          description="AvtaleGiro agreement IDs are numbers."
        />
      </DetailPage>
    );
  }
  if (agreement.isPending) return <AgreementPending title={title} />;
  if (!agreement.data) {
    return (
      <LoadingOrError
        title={title}
        error={agreement.error}
        onRetry={() => void agreement.refetch()}
      />
    );
  }

  const a = agreement.data;
  // The same mapping as agreements.list (DAO_modules/agreements.ts)
  const status: AgreementStatus = a.active ? "active" : a.cancelled ? "stopped" : "pending";
  const facts: AgreementFacts = {
    provider: "avtalegiro",
    id: String(a.ID),
    KID: a.KID,
    donorId: a.donorId ?? null,
    donorName: a.full_name ?? "",
    amount: a.amount,
    chargeDay: a.payment_date,
    status,
    providerStatus: a.active ? "active" : "inactive",
    created: toIso(a.created),
    lastUpdated: toIso(a.last_updated),
    cancelled: toIso(a.cancelled),
    pausedUntil: null,
  };
  const subject = { type: "avtalegiro" as const, ...facts };

  const payments: Payment[] | undefined = donations.data?.donations
    .map((donation) => ({
      key: String(donation.id),
      date: toIso(donation.timestamp),
      amount: donation.sum,
      reference: String(donation.id),
      href: `/donations/${donation.id}`,
    }))
    .sort((x, y) => String(y.date ?? "").localeCompare(String(x.date ?? "")));

  const run = async (action: Promise<unknown>, message: string) => {
    await action;
    await invalidate();
    notify.success(message, `${facts.donorName} · AvtaleGiro`);
  };
  const claimNote =
    "Applies to claims we send to the bank from now on; a claim already sent for this month keeps the old value.";

  return (
    <AgreementLayout
      facts={facts}
      title={title}
      withStatus={false}
      actions={
        <>
          <ChangeAmountDialog
            agreement={subject}
            max={AVTALEGIRO_MAX_NOK}
            consequences={[claimNote]}
            onConfirm={(amount) =>
              run(
                updateAmount.mutateAsync({ KID, amount }),
                `Amount changed to ${formatMoney(amount)}`,
              )
            }
          />
          <ChangeChargeDayDialog
            agreement={subject}
            consequences={[claimNote]}
            onConfirm={(paymentDate) =>
              run(updatePaymentDate.mutateAsync({ KID, paymentDate }), "Charge day changed")
            }
          />
          {a.active ? (
            <StopAgreementDialog
              agreement={subject}
              consequences={[
                "No more claims are sent to the bank. A claim already sent for this month may still be charged.",
              ]}
              onConfirm={() =>
                run(updateStatus.mutateAsync({ KID, active: false }), "Agreement stopped")
              }
            />
          ) : (
            <ActivateAgreementDialog
              agreement={subject}
              consequences={[
                status === "pending"
                  ? "Only do this once the bank has confirmed the agreement; claims for unconfirmed agreements are rejected."
                  : "This restarts a stopped agreement. Make sure the donor asked for it.",
              ]}
              onConfirm={() =>
                run(updateStatus.mutateAsync({ KID, active: true }), "Agreement activated")
              }
            />
          )}
        </>
      }
      distribution={
        <AgreementDistribution
          distribution={a.distribution}
          title={`${facts.donorName}'s AvtaleGiro agreement`}
          consequences={[
            "The agreement keeps its KID. Past donations keep their old split, moved to a new KID.",
          ]}
          onSave={async (split: SplitInput) => {
            await updateDistribution.mutateAsync({ KID, distribution: split });
            await invalidate();
            notify.success("Distribution changed", `${facts.donorName} · AvtaleGiro`);
          }}
        />
      }
      payments={payments}
      paymentsError={donations.error}
      onRetryPayments={() => void donations.refetch()}
      paymentsTitle="Donations"
      paymentsDescription={
        donations.data && donations.data.KIDs.length > 1
          ? `Donations from this agreement, newest first, including those registered before a distribution change (KIDs ${donations.data.KIDs.join(
              ", ",
            )}).`
          : "Donations from this agreement, newest first."
      }
    />
  );
}

// endregion
