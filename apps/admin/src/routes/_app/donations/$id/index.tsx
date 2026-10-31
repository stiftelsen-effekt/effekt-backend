import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRecordParams } from "@/components/panels";
import { MailIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { CopyValue } from "@/components/domain/copy-value";
import { DistributionSummary } from "@/components/domain/distribution-editor";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { DetailPage, DetailPanel, PageSection } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { draftFromApi } from "@/features/distribution/model";
import { useCauseAreaConfig } from "@/features/distribution/queries";
import { ResendReceiptDialog } from "@/features/donations/resend-receipt";
import { formatAmount } from "@/features/donations/edit-model";
import { notify } from "@/lib/notify";
import { loadPage } from "@/lib/route-data";
import { invalidateDonationQueries } from "@/features/donations/invalidate";
import { useTRPC } from "@/lib/trpc";
import { PaymentMethodName } from "@/features/donations/payment-method-name";

export const Route = createFileRoute("/_app/donations/$id/")({
  loader: ({ context: { queryClient, trpc }, params, cause }) => {
    const id = Number(params.id);
    if (!(Number.isInteger(id) && id > 0)) return;
    return loadPage(queryClient, cause, trpc.donations.get.queryOptions({ id }), [
      { ...trpc.config.causeAreas.listAll.queryOptions(), staleTime: 5 * 60_000 },
      { ...trpc.meta.owners.queryOptions(), staleTime: 300_000 },
    ]);
  },
  component: DonationPage,
});

const breadcrumbs = [{ label: "Donations", to: "/donations" }];

function DonationPage() {
  const { id: rawId } = useRecordParams(Route);
  const id = Number(rawId);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const donation = useQuery({
    ...trpc.donations.get.queryOptions({ id }),
    enabled: Number.isInteger(id) && id > 0,
  });
  const owners = useQuery({ ...trpc.meta.owners.queryOptions(), staleTime: 300_000 });
  const causeAreas = useCauseAreaConfig({ includeInactive: true });
  const remove = useMutation(trpc.donations.delete.mutationOptions());

  if (donation.isError || !(id > 0)) {
    return (
      <DetailPage breadcrumbs={breadcrumbs} title={`Donation #${rawId}`}>
        <ErrorState
          back={{ to: "/donations", label: "All donations" }}
          error={donation.error ?? new Error("Not a donation ID")}
          onRetry={() => void donation.refetch()}
        />
      </DetailPage>
    );
  }

  const d = donation.data;
  if (!d) {
    // First load only (navigations wait for the donation): the page's own layout, with
    // placeholders for the values.
    return (
      <DetailPage
        breadcrumbs={breadcrumbs}
        title={<SkeletonText>0 000 kr</SkeletonText>}
        meta={[
          <span key="id">#{id}</span>,
          <SkeletonText key="date">00.00.0000 00:00</SkeletonText>,
          <SkeletonText key="method">Bank transfer</SkeletonText>,
          <SkeletonText key="donor">Firstname Lastname</SkeletonText>,
        ]}
        actions={
          <>
            <Button disabled>
              <PencilIcon />
              Edit
            </Button>
            <Button disabled>
              <MailIcon />
              Resend receipt
            </Button>
            <Button disabled>
              <Trash2Icon />
              Delete…
            </Button>
          </>
        }
        aside={
          <>
            <DetailPanel title="Payment">
              <PropertyList labelWidth="7rem">
                {["Amount", "Fee", "Date", "Method", "External ref", "Data owner"].map((label) => (
                  <Property key={label} label={label} pending placeholder="Placeholder" />
                ))}
              </PropertyList>
            </DetailPanel>
            <DetailPanel title="Donor">
              <PropertyList labelWidth="7rem">
                {["Name", "Email", "Donor ID"].map((label) => (
                  <Property key={label} label={label} pending />
                ))}
              </PropertyList>
            </DetailPanel>
          </>
        }
      >
        <PageSection
          title="Distribution"
          description={
            <>
              KID <SkeletonText>000000000000000</SkeletonText>
            </>
          }
        >
          <div className="rounded-md border border-border bg-surface p-4">
            <Skeleton className="h-16 w-full" />
          </div>
        </PageSection>
      </DetailPage>
    );
  }

  const owner = owners.data?.find((o) => o.id === d.metaOwnerId);

  return (
    <DetailPage
      breadcrumbs={breadcrumbs}
      title={<Money value={d.sum} />}
      meta={[
        <CopyValue key="id" value={d.id} prefix="#" label="donation ID" />,
        <DateTime key="date" value={d.timestamp} format="datetime" />,
        <PaymentMethodName key="method" value={d.paymentMethod} />,
        <Link
          key="donor"
          to="/donors/$id"
          params={{ id: String(d.donorId) }}
          className="text-accent hover:underline"
        >
          {d.donor}
        </Link>,
      ]}
      actions={
        <>
          <Button asChild>
            <Link to="/donations/$id/edit" params={{ id: String(d.id) }}>
              <PencilIcon />
              Edit
            </Link>
          </Button>
          <ResendReceiptDialog donationId={d.id} email={d.email} />
          <ConfirmDialog
            title={`Delete the donation of ${formatAmount(d.sum)} from ${d.donor}?`}
            consequences={[
              <>
                Donation <strong>#{d.id}</strong> is removed from the donor's history, totals and
                tax reports.
              </>,
              "Receipts already sent are not withdrawn.",
              "This can't be undone. To change the amount or split, edit the donation instead.",
            ]}
            confirmLabel="Delete donation"
            tone="danger"
            confirmText={String(d.id)}
            onConfirm={async () => {
              await remove.mutateAsync({ id: d.id });
              await invalidateDonationQueries(queryClient, trpc, [d.donorId]);
              notify.success("Donation deleted", `#${d.id} · ${formatAmount(d.sum)}`);
              void navigate({ to: "/donations" });
            }}
            trigger={
              <Button>
                <Trash2Icon />
                Delete…
              </Button>
            }
          />
        </>
      }
      aside={
        <>
          <DetailPanel title="Payment">
            <PropertyList labelWidth="7rem">
              <Property label="Amount">
                <Money value={d.sum} className="font-semibold" />
              </Property>
              <Property label="Fee">
                <Money value={d.transactionCost} />
              </Property>
              <Property label="Date">
                <DateTime value={d.timestamp} format="datetime" />
              </Property>
              <Property label="Method">
                <PaymentMethodName value={d.paymentMethod} />
              </Property>
              <Property label="External ref">
                {d.paymentExternalRef && (
                  <CopyValue value={d.paymentExternalRef} label="external reference" />
                )}
              </Property>
              <Property label="Data owner">{owner?.name}</Property>
              {d.fundraiserId != null && (
                <Property label="Fundraiser">
                  <CopyValue value={d.fundraiserId} prefix="#" label="fundraiser ID" />
                </Property>
              )}
            </PropertyList>
          </DetailPanel>
          <DetailPanel title="Donor">
            <PropertyList labelWidth="7rem">
              <Property label="Name">
                <Link
                  to="/donors/$id"
                  params={{ id: String(d.donorId) }}
                  className="font-semibold text-accent hover:underline"
                >
                  {d.donor}
                </Link>
              </Property>
              <Property label="Email">{d.email}</Property>
              <Property label="Donor ID">
                <CopyValue value={d.donorId} prefix="#" label="donor ID" />
              </Property>
            </PropertyList>
          </DetailPanel>
        </>
      }
    >
      <PageSection
        title="Distribution"
        description={
          <>
            KID{" "}
            <Link
              to="/distributions/$kid"
              params={{ kid: d.KID }}
              className="num text-accent hover:underline"
            >
              {d.KID}
            </Link>
          </>
        }
      >
        <div className="rounded-md border border-border bg-surface p-4">
          {causeAreas.data ? (
            <DistributionSummary
              draft={draftFromApi(causeAreas.data, d.distribution)}
              config={causeAreas.data}
              amount={d.sum}
            />
          ) : causeAreas.isError ? (
            <ErrorState error={causeAreas.error} onRetry={() => void causeAreas.refetch()} />
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </div>
      </PageSection>
    </DetailPage>
  );
}
