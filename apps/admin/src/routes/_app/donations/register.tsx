import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Callout } from "@/components/domain/callout";
import { CopyValue } from "@/components/domain/copy-value";
import { DistributionSummary } from "@/components/domain/distribution-editor";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { FlowFooter, FlowPage, PageSection, type FlowStep } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Pending } from "@/components/ui/pending";
import {
  emptyDraft,
  withCurrentStandardSplits,
  type CauseAreaConfig,
} from "@/features/distribution/model";
import { causeAreaConfigOptions, useCauseAreaConfig } from "@/features/distribution/queries";
import {
  preferredOwner,
  rememberOwner,
  visiblePaymentMethods,
  type DataOwner,
  type PaymentMethod,
} from "@/features/donations/api";
import { KidPreview, NewDistributionFields } from "@/features/donations/distribution-fields";
import { DonationFields } from "@/features/donations/donation-fields";
import { formatAmount } from "@/features/donations/edit-model";
import { fromDateTimeInputs, parseMoneyInput, serverErrors } from "@/features/donations/form";
import {
  emptyRegisterDraft,
  registerFieldNames,
  registerInput,
  validateRegister,
  type RegisterDraft,
  type RegisterField,
  type RegisterResult,
} from "@/features/donations/register-model";
import { useHotkey } from "@/hooks/use-hotkey";
import { usePersistentState } from "@/lib/persistent-store";
import { notify } from "@/lib/notify";
import { loadPage } from "@/lib/route-data";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/donations/register")({
  loader: ({ context: { queryClient, trpc }, cause }) =>
    loadPage(queryClient, cause, [
      causeAreaConfigOptions(trpc),
      { ...trpc.config.paymentMethods.list.queryOptions(), staleTime: 300_000 },
      { ...trpc.meta.owners.queryOptions(), staleTime: 300_000 },
    ]),
  component: RegisterDonationPage,
});

const steps: FlowStep[] = [
  { id: "details", label: "Donation" },
  { id: "check", label: "Check" },
  { id: "done", label: "Registered" },
];

type FlowState = {
  step: "details" | "check" | "done";
  draft: RegisterDraft;
  result?: RegisterResult & { sum: string };
};

const initial: FlowState = { step: "details", draft: emptyRegisterDraft() };
const breadcrumbs = [{ label: "Donations", to: "/donations" }];

function RegisterDonationPage() {
  const trpc = useTRPC();
  const causeAreas = useCauseAreaConfig();
  const methods = useQuery({
    ...trpc.config.paymentMethods.list.queryOptions(),
    staleTime: 300_000,
  });
  const owners = useQuery({ ...trpc.meta.owners.queryOptions(), staleTime: 300_000 });
  const error = causeAreas.error ?? methods.error ?? owners.error;

  if (error || !causeAreas.data || !methods.data || !owners.data) {
    return (
      <FlowPage title="Register donation" breadcrumbs={breadcrumbs} steps={steps} current="details">
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => {
              void causeAreas.refetch();
              void methods.refetch();
              void owners.refetch();
            }}
          />
        ) : (
          <Pending className="min-h-96" />
        )}
      </FlowPage>
    );
  }
  return (
    <RegisterFlow
      config={causeAreas.data}
      paymentMethods={visiblePaymentMethods(methods.data)}
      owners={owners.data}
    />
  );
}

function RegisterFlow({
  config,
  paymentMethods,
  owners,
}: {
  config: CauseAreaConfig[];
  paymentMethods: PaymentMethod[];
  owners: DataOwner[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const register = useMutation(trpc.donations.register.mutationOptions());
  const [state, setState] = usePersistentState<FlowState>("register-donation", initial);
  const [touched, setTouched] = useState(false);
  const [server, setServer] = useState<ReturnType<typeof serverErrors<RegisterField>>>({
    fields: {},
  });
  const { step } = state;
  // The draft survives reloads; standard split shares always come from today's config.
  const draft = useMemo(
    () =>
      state.draft.distribution
        ? {
            ...state.draft,
            distribution: withCurrentStandardSplits(state.draft.distribution, config),
          }
        : state.draft,
    [state.draft, config],
  );

  // Fill in what the form can't start with: the owner (last used, else default) and an empty
  // split.
  useEffect(() => {
    if (!draft.ownerId || !draft.distribution) {
      setState((current) => ({
        ...current,
        draft: {
          ...current.draft,
          ownerId: current.draft.ownerId || String(preferredOwner(owners)?.id ?? ""),
          distribution: current.draft.distribution ?? emptyDraft(config),
        },
      }));
    }
  }, [draft.ownerId, draft.distribution, owners, config, setState]);

  const errors = validateRegister(draft);
  const valid = Object.keys(errors).length === 0;
  const shown = (field: RegisterField) =>
    server.fields[field] ?? (touched ? errors[field] : undefined);
  const sum = parseMoneyInput(draft.sum);

  const set = <K extends keyof RegisterDraft>(key: K, value: RegisterDraft[K]) => {
    setState((current) => ({ ...current, draft: { ...current.draft, [key]: value } }));
    const field = key === "date" || key === "time" ? "timestamp" : key;
    setServer((current) => ({ ...current, fields: { ...current.fields, [field]: undefined } }));
  };
  const goTo = (next: FlowState["step"]) => setState((current) => ({ ...current, step: next }));

  function toCheck() {
    setTouched(true);
    if (valid) {
      setServer({ fields: {} });
      goTo("check");
    }
  }

  async function submit() {
    if (!valid || register.isPending) return;
    setServer({ fields: {} });
    try {
      const result = await register.mutateAsync(registerInput(draft));
      rememberOwner(Number(draft.ownerId));
      await queryClient.invalidateQueries({ queryKey: trpc.donations.pathKey() });
      notify.success(`Registered ${formatAmount(sum!)}`, `Donation #${result.donationId}`);
      setState((current) => ({ ...current, step: "done", result: { ...result, sum: sum! } }));
      setTouched(false);
    } catch (err) {
      const mapped = serverErrors(err, registerFieldNames);
      setServer(mapped);
      // Problems with a field are fixed on the form, next to the field.
      if (Object.keys(mapped.fields).length > 0) goTo("details");
    }
  }

  function registerAnother() {
    // Keep what repeats between registrations: method, owner, date, receipt choice.
    setState({
      step: "details",
      draft: emptyRegisterDraft({
        paymentId: draft.paymentId,
        ownerId: draft.ownerId,
        date: draft.date,
        sendReceipt: draft.sendReceipt,
        distribution: emptyDraft(config),
      }),
    });
    setServer({ fields: {} });
    setTouched(false);
  }

  useHotkey("mod+enter", () => (step === "details" ? toCheck() : void submit()), {
    enabled: step !== "done",
  });

  const donor = useQuery({
    ...trpc.donors.get.queryOptions({ donorId: draft.donorId ?? 0 }),
    enabled: draft.mode === "distribution" && draft.donorId != null,
  });
  const taxUnits = useQuery({
    ...trpc.donors.taxUnits.list.queryOptions({ donorId: draft.donorId ?? 0 }),
    enabled: draft.mode === "distribution" && draft.donorId != null && draft.taxUnitId !== "",
  });
  const methodName = paymentMethods.find((m) => String(m.id) === draft.paymentId)?.name;
  const ownerName = owners.find((o) => String(o.id) === draft.ownerId)?.name;
  const timestamp = fromDateTimeInputs(draft.date, draft.time);

  const footer =
    step === "details" ? (
      <FlowFooter
        info="Nothing is registered until you confirm on the next step."
        next={
          <Button variant="primary" onClick={toCheck}>
            Check
            <ArrowRightIcon />
          </Button>
        }
      />
    ) : step === "check" ? (
      <FlowFooter
        info={draft.sendReceipt ? "The donor gets a receipt by email." : "No receipt is sent."}
        back={
          <Button onClick={() => goTo("details")} disabled={register.isPending}>
            <ArrowLeftIcon />
            Back
          </Button>
        }
        next={
          <Button variant="primary" pending={register.isPending} onClick={() => void submit()}>
            <CheckIcon />
            Register {sum ? formatAmount(sum) : ""}
          </Button>
        }
      />
    ) : (
      <FlowFooter
        next={
          <Button variant="primary" onClick={registerAnother}>
            <PlusIcon />
            Register another
          </Button>
        }
      />
    );

  return (
    <FlowPage
      title="Register donation"
      breadcrumbs={breadcrumbs}
      description="Register a payment that didn't come in through an import."
      steps={steps}
      current={step}
      onStepSelect={step === "check" ? () => goTo("details") : undefined}
      footer={footer}
    >
      {step === "details" && (
        <>
          <PageSection title="Register on">
            <SegmentedControl
              label="Register on"
              value={draft.mode}
              onValueChange={(mode) => set("mode", mode)}
              options={[
                { value: "kid", label: "Existing KID" },
                { value: "distribution", label: "New distribution" },
              ]}
            />
            {draft.mode === "kid" ? (
              <div className="grid gap-3">
                <Field label="KID" error={shown("KID")} required className="max-w-64">
                  <Input
                    value={draft.KID}
                    inputMode="numeric"
                    autoComplete="off"
                    className="num"
                    onChange={(event) => set("KID", event.target.value.trim())}
                  />
                </Field>
                <KidPreview kid={draft.KID} />
              </div>
            ) : (
              draft.distribution && (
                <NewDistributionFields
                  donorId={draft.donorId}
                  onDonorChange={(donorId) => set("donorId", donorId)}
                  taxUnitId={draft.taxUnitId}
                  onTaxUnitChange={(taxUnitId) => set("taxUnitId", taxUnitId)}
                  distribution={draft.distribution}
                  onDistributionChange={(distribution) => set("distribution", distribution)}
                  config={config}
                  errors={{
                    donorId: shown("donorId"),
                    taxUnitId: shown("taxUnitId"),
                    distribution: shown("distribution"),
                  }}
                />
              )
            )}
          </PageSection>
          <PageSection title="Payment">
            <DonationFields
              values={draft}
              onChange={(key, value) => key !== "transactionCost" && set(key, value)}
              errors={{
                sum: shown("sum"),
                timestamp: shown("timestamp"),
                paymentId: shown("paymentId"),
                externalRef: shown("externalRef"),
                ownerId: shown("ownerId"),
              }}
              paymentMethods={paymentMethods}
              owners={owners}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.sendReceipt}
                onCheckedChange={(checked) => set("sendReceipt", checked === true)}
              />
              Email the donor a receipt
            </label>
          </PageSection>
          {server.general && (
            <Callout tone="danger" title={server.general.title}>
              {server.general.hint}
            </Callout>
          )}
        </>
      )}

      {step === "check" && (
        <>
          <div className="grid gap-1">
            <Money value={sum} className="text-3xl font-semibold tracking-tight" />
            <span className="text-sm text-muted-foreground">
              {timestamp && <DateTime value={timestamp} format="datetime" />} · {methodName}
            </span>
          </div>
          <PropertyList labelWidth="9rem">
            {draft.mode === "kid" ? (
              <Property label="KID">
                <span className="num">{draft.KID}</span>
              </Property>
            ) : (
              <>
                <Property label="Donor">
                  {donor.data && `${donor.data.name ?? donor.data.email} · #${donor.data.id}`}
                </Property>
                <Property label="Tax unit">
                  {draft.taxUnitId === ""
                    ? "None"
                    : taxUnits.data?.find((unit) => String(unit.id) === draft.taxUnitId)?.name}
                </Property>
                <Property label="KID" hint="The donor's existing KID with this split is reused.">
                  New, or existing with this split
                </Property>
              </>
            )}
            <Property label="External reference">{draft.externalRef.trim()}</Property>
            <Property label="Data owner">{ownerName}</Property>
            <Property label="Receipt">
              {draft.sendReceipt ? "Emailed to the donor" : "Not sent"}
            </Property>
          </PropertyList>
          {draft.mode === "kid" ? (
            <KidPreview kid={draft.KID} />
          ) : (
            draft.distribution && (
              <div className="rounded-md border border-border bg-surface p-4">
                <DistributionSummary draft={draft.distribution} config={config} />
              </div>
            )
          )}
          {server.general && (
            <Callout tone="danger" title={server.general.title}>
              {server.general.hint}
            </Callout>
          )}
        </>
      )}

      {step === "done" && state.result && (
        <>
          <Callout
            tone="success"
            title={`Registered ${formatAmount(state.result.sum)} as donation #${
              state.result.donationId
            }`}
            action={
              <Button size="sm" asChild>
                <Link to="/donations/$id" params={{ id: String(state.result.donationId) }}>
                  Open donation
                </Link>
              </Button>
            }
          >
            {state.result.newDistribution
              ? "A new distribution was created for it."
              : "It uses an existing distribution."}
          </Callout>
          <PropertyList labelWidth="9rem">
            <Property label="Donation ID">
              <CopyValue value={state.result.donationId} prefix="#" label="donation ID" />
            </Property>
            <Property label="KID">
              <Link
                to="/distributions/$kid"
                params={{ kid: state.result.KID }}
                className="num text-accent hover:underline"
              >
                {state.result.KID}
              </Link>
            </Property>
          </PropertyList>
        </>
      )}
    </FlowPage>
  );
}
