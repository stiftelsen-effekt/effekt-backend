import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Callout } from "@/components/domain/callout";
import { CopyValue } from "@/components/domain/copy-value";
import { ErrorState } from "@/components/domain/error-state";
import { Property, PropertyList } from "@/components/domain/property-list";
import { FlowFooter, FlowPage, PageSection, type FlowStep } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pending } from "@/components/ui/pending";
import {
  draftToApi,
  emptyDraft,
  validateDraft,
  type CauseAreaConfig,
  type DistributionDraft,
} from "@/features/distribution/model";
import { causeAreaConfigOptions, useCauseAreaConfig } from "@/features/distribution/queries";
import { defaultOwner, type DataOwner } from "@/features/donations/api";
import { NewDistributionFields } from "@/features/donations/distribution-fields";
import { serverErrors } from "@/features/donations/form";
import { notify } from "@/lib/notify";
import { loadPage } from "@/lib/route-data";
import { useTRPC, type RouterOutputs } from "@/lib/trpc";

export const Route = createFileRoute("/_app/distributions/new")({
  loader: ({ context: { queryClient, trpc }, cause }) =>
    loadPage(queryClient, cause, [
      causeAreaConfigOptions(trpc),
      { ...trpc.meta.owners.queryOptions(), staleTime: 300_000 },
    ]),
  component: CreateDistributionPage,
});

const steps: FlowStep[] = [
  { id: "details", label: "Donor and split" },
  { id: "done", label: "KID" },
];
const breadcrumbs = [{ label: "Distributions", to: "/distributions" }];

type CreateField = "donorId" | "taxUnitId" | "ownerId" | "distribution";

function CreateDistributionPage() {
  const trpc = useTRPC();
  const causeAreas = useCauseAreaConfig();
  const owners = useQuery({ ...trpc.meta.owners.queryOptions(), staleTime: 300_000 });
  const error = causeAreas.error ?? owners.error;

  if (error || !causeAreas.data || !owners.data) {
    return (
      <FlowPage
        title="Create distribution"
        breadcrumbs={breadcrumbs}
        steps={steps}
        current="details"
      >
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => {
              void causeAreas.refetch();
              void owners.refetch();
            }}
          />
        ) : (
          <Pending className="min-h-96" />
        )}
      </FlowPage>
    );
  }
  return <CreateDistributionForm config={causeAreas.data} owners={owners.data} />;
}

function CreateDistributionForm({
  config,
  owners,
}: {
  config: CauseAreaConfig[];
  owners: DataOwner[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const create = useMutation(trpc.donations.distributions.create.mutationOptions());
  const [donorId, setDonorId] = useState<number | null>(null);
  const [taxUnitId, setTaxUnitId] = useState("");
  const [ownerId, setOwnerId] = useState(() => String(defaultOwner(owners)?.id ?? ""));
  const [distribution, setDistribution] = useState<DistributionDraft>(() => emptyDraft(config));
  const [touched, setTouched] = useState(false);
  const [server, setServer] = useState<ReturnType<typeof serverErrors<CreateField>>>({
    fields: {},
  });
  const [result, setResult] = useState<RouterOutputs["donations"]["distributions"]["create"]>();

  const errors: Partial<Record<CreateField, string>> = {};
  if (donorId == null) errors.donorId = "Choose the donor";
  if (!ownerId) errors.ownerId = "Choose the data owner";
  if (!validateDraft(distribution).valid)
    errors.distribution = "The distribution must add up to 100 %";
  const valid = Object.keys(errors).length === 0;
  const shown = (field: CreateField) =>
    server.fields[field] ?? (touched ? errors[field] : undefined);
  const clear = (field: CreateField) =>
    setServer((current) => ({ ...current, fields: { ...current.fields, [field]: undefined } }));

  async function submit() {
    setTouched(true);
    if (!valid) return;
    setServer({ fields: {} });
    try {
      const created = await create.mutateAsync({
        donorId: donorId!,
        taxUnitId: taxUnitId ? Number(taxUnitId) : null,
        metaOwnerId: Number(ownerId),
        causeAreas: draftToApi(distribution),
      });
      await queryClient.invalidateQueries({ queryKey: trpc.donations.distributions.pathKey() });
      notify.success(
        created.newDistribution
          ? `Created KID ${created.KID}`
          : `KID ${created.KID} already has this split`,
      );
      setResult(created);
    } catch (err) {
      setServer(
        serverErrors<CreateField>(err, {
          donorId: "donorId",
          taxUnitId: "taxUnitId",
          metaOwnerId: "ownerId",
          causeAreas: "distribution",
          distribution: "distribution",
        }),
      );
    }
  }

  function createAnother() {
    setResult(undefined);
    setDonorId(null);
    setTaxUnitId("");
    setDistribution(emptyDraft(config));
    setTouched(false);
  }

  return (
    <FlowPage
      title="Create distribution"
      breadcrumbs={breadcrumbs}
      description="A new KID for a donor, with its split between cause areas and organizations."
      steps={steps}
      current={result ? "done" : "details"}
      footer={
        result ? (
          <FlowFooter
            next={
              <Button variant="primary" onClick={createAnother}>
                <PlusIcon />
                Create another
              </Button>
            }
          />
        ) : (
          <FlowFooter
            info="If the donor already has a KID with this split, that KID is used."
            next={
              <Button variant="primary" pending={create.isPending} onClick={() => void submit()}>
                <CheckIcon />
                Create distribution
              </Button>
            }
          />
        )
      }
    >
      {result ? (
        <>
          <Callout
            tone={result.newDistribution ? "success" : "accent"}
            title={
              result.newDistribution
                ? `Created KID ${result.KID}`
                : `The donor already has this split as KID ${result.KID}`
            }
            action={
              <Button size="sm" asChild>
                <Link to="/distributions/$kid" params={{ kid: result.KID }}>
                  Open KID
                </Link>
              </Button>
            }
          >
            {result.newDistribution
              ? "Give the donor this KID to use for payments."
              : "No new KID was made; use the existing one."}
          </Callout>
          <PropertyList>
            <Property label="KID">
              <CopyValue value={result.KID} label="KID" />
            </Property>
          </PropertyList>
        </>
      ) : (
        <>
          <PageSection title="Donor and split">
            <NewDistributionFields
              donorId={donorId}
              onDonorChange={(next) => {
                setDonorId(next);
                clear("donorId");
              }}
              taxUnitId={taxUnitId}
              onTaxUnitChange={(next) => {
                setTaxUnitId(next);
                clear("taxUnitId");
              }}
              distribution={distribution}
              onDistributionChange={(next) => {
                setDistribution(next);
                clear("distribution");
              }}
              config={config}
              errors={{
                donorId: shown("donorId"),
                taxUnitId: shown("taxUnitId"),
                distribution: shown("distribution"),
              }}
            />
          </PageSection>
          <Field label="Data owner" error={shown("ownerId")} required className="max-w-xs">
            <Select
              value={ownerId}
              onValueChange={(next) => {
                setOwnerId(next);
                clear("ownerId");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an owner" />
              </SelectTrigger>
              <SelectContent>
                {owners.map((owner) => (
                  <SelectItem key={owner.id} value={String(owner.id)}>
                    {owner.name}
                    {owner.default ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {server.general && (
            <Callout tone="danger" title={server.general.title}>
              {server.general.hint}
            </Callout>
          )}
        </>
      )}
    </FlowPage>
  );
}
