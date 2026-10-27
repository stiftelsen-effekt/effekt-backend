import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Callout } from "@/components/domain/callout";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { DistributionEditor } from "@/components/domain/distribution-editor";
import { ErrorState } from "@/components/domain/error-state";
import { UnsavedChangesBar } from "@/components/domain/unsaved-changes";
import { DetailPage, PageSection } from "@/components/templates";
import { Skeleton } from "@/components/ui/skeleton";
import { useCauseAreaConfig } from "@/features/distribution/queries";
import type { CauseAreaConfig } from "@/features/distribution/model";
import { paymentMethodsFor, type DataOwner, type PaymentMethod } from "@/features/donations/api";
import {
  editChanges,
  editDraftFromDonation,
  formatAmount,
  validateEdit,
  type Donation,
  type EditDraft,
  type EditField,
} from "@/features/donations/edit-model";
import { DonationFields } from "@/features/donations/donation-fields";
import { parseMoneyInput, serverErrors } from "@/features/donations/form";
import { notify } from "@/lib/notify";
import { strings } from "@/lib/strings";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/donations/$id/edit")({
  component: EditDonationPage,
});

function EditDonationPage() {
  const { id: rawId } = Route.useParams();
  const id = Number(rawId);
  const trpc = useTRPC();
  const donation = useQuery({
    ...trpc.donations.get.queryOptions({ id }),
    enabled: id > 0,
    // The form starts from this snapshot; don't swap it underneath someone typing.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const causeAreas = useCauseAreaConfig({ includeInactive: true });
  const methods = useQuery({
    ...trpc.config.paymentMethods.list.queryOptions(),
    staleTime: 300_000,
  });
  const owners = useQuery({ ...trpc.meta.owners.queryOptions(), staleTime: 300_000 });

  const breadcrumbs = [
    { label: "Donations", to: "/donations" },
    { label: `#${rawId}`, to: `/donations/${rawId}` },
  ];
  const error = donation.error ?? causeAreas.error ?? methods.error ?? owners.error;
  if (error || !(id > 0)) {
    return (
      <DetailPage breadcrumbs={breadcrumbs} title="Edit donation">
        <ErrorState
          error={error ?? new Error("Not a donation ID")}
          onRetry={() => {
            void donation.refetch();
            void causeAreas.refetch();
            void methods.refetch();
            void owners.refetch();
          }}
        />
      </DetailPage>
    );
  }
  if (!donation.data || !causeAreas.data || !methods.data || !owners.data) {
    return (
      <DetailPage breadcrumbs={breadcrumbs} title="Edit donation">
        <div className="grid max-w-3xl gap-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </DetailPage>
    );
  }
  return (
    <EditDonationForm
      key={donation.data.id}
      donation={donation.data}
      config={causeAreas.data}
      paymentMethods={paymentMethodsFor(methods.data)}
      owners={owners.data}
      breadcrumbs={breadcrumbs}
    />
  );
}

function EditDonationForm({
  donation,
  config,
  paymentMethods,
  owners,
  breadcrumbs,
}: {
  donation: Donation;
  config: CauseAreaConfig[];
  paymentMethods: PaymentMethod[];
  owners: DataOwner[];
  breadcrumbs: { label: string; to: string }[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const update = useMutation(trpc.donations.update.mutationOptions());
  const [initial] = useState(() => editDraftFromDonation(donation, config));
  const [draft, setDraft] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [server, setServer] = useState<ReturnType<typeof serverErrors<EditField>>>({ fields: {} });
  const [saved, setSaved] = useState(false);

  const dirty = !saved && JSON.stringify(draft) !== JSON.stringify(initial);
  const errors = validateEdit(draft, donation);
  const valid = Object.keys(errors).length === 0;
  const { input, changes } = valid
    ? editChanges(donation, draft, {
        config,
        paymentMethodName: (methodId) => paymentMethods.find((m) => m.id === methodId)?.name,
        ownerName: (ownerId) => owners.find((o) => o.id === ownerId)?.name,
      })
    : { input: { id: donation.id }, changes: [] };

  // Leave once the saved state has rendered, so the unsaved-changes guard has let go.
  useEffect(() => {
    if (saved) void navigate({ to: "/donations/$id", params: { id: String(donation.id) } });
  }, [saved, navigate, donation.id]);

  const set = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    const field: EditField = key === "date" || key === "time" ? "timestamp" : (key as EditField);
    setServer((current) => ({ ...current, fields: { ...current.fields, [field]: undefined } }));
  };

  async function save() {
    try {
      await update.mutateAsync(input);
    } catch (err) {
      const mapped = serverErrors<EditField>(err, {
        sum: "sum",
        transactionCost: "transactionCost",
        timestamp: "timestamp",
        paymentId: "paymentId",
        paymentExternalRef: "externalRef",
        metaOwnerId: "ownerId",
        distribution: "distribution",
        donorId: "distribution",
        taxUnitId: "distribution",
      });
      // Field problems are shown next to the field; anything else stays in the dialog.
      if (Object.keys(mapped.fields).length > 0 && !mapped.general) {
        setServer(mapped);
        return;
      }
      throw err;
    }
    await queryClient.invalidateQueries({ queryKey: trpc.donations.pathKey() });
    notify.success("Donation updated", `#${donation.id}`);
    setSaved(true);
  }

  const shown = (field: EditField) => server.fields[field] ?? (touched ? errors[field] : undefined);
  const newSum = parseMoneyInput(draft.sum);
  const sumChanged = changes.some((change) => change.label === "Amount");

  return (
    <DetailPage
      breadcrumbs={breadcrumbs}
      title="Edit donation"
      meta={[`#${donation.id}`, donation.donor, `KID ${donation.KID}`]}
    >
      <div className="grid max-w-3xl gap-8">
        <PageSection title="Payment">
          <DonationFields
            values={draft}
            onChange={set}
            errors={{
              sum: shown("sum"),
              transactionCost: shown("transactionCost"),
              timestamp: shown("timestamp"),
              paymentId: shown("paymentId"),
              externalRef: shown("externalRef"),
              ownerId: shown("ownerId"),
            }}
            paymentMethods={paymentMethods}
            owners={owners}
            showTransactionCost
            externalRefHint="Can be changed but not removed."
          />
        </PageSection>
        <PageSection
          title="Distribution"
          description="If the new split differs, the donation moves to a KID with that split (an existing one or a new one). Other donations on its current KID are not changed."
        >
          <DistributionEditor
            config={config}
            value={draft.distribution}
            onChange={(distribution) => set("distribution", distribution)}
          />
          {shown("distribution") && (
            <p className="text-xs text-danger" role="alert">
              {shown("distribution")}
            </p>
          )}
        </PageSection>
        {server.general && (
          <Callout tone="danger" title={server.general.title}>
            {server.general.hint}
          </Callout>
        )}
        <UnsavedChangesBar
          dirty={dirty}
          saving={update.isPending}
          onDiscard={() => {
            setDraft(initial);
            setTouched(false);
            setServer({ fields: {} });
          }}
          onSave={() => {
            setTouched(true);
            if (!valid) return;
            if (changes.length === 0) {
              setDraft(initial);
              return;
            }
            setConfirming(true);
          }}
          invalid={touched && !valid ? "Fix the marked fields" : undefined}
        />
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Save changes to donation #${donation.id}?`}
        description={`${donation.donor} · KID ${donation.KID}`}
        consequences={changes.map((change) => (
          <span key={change.label}>
            <span className="text-muted-foreground">{change.label}:</span>{" "}
            <span className="num">{change.before}</span> →{" "}
            <strong className="num font-semibold">{change.after}</strong>
          </span>
        ))}
        confirmLabel={
          sumChanged && newSum
            ? `Save donation of ${formatAmount(newSum)}`
            : strings.actions.saveChanges
        }
        onConfirm={save}
      />
    </DetailPage>
  );
}
