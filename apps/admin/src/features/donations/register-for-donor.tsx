import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, PlusIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Callout } from "@/components/domain/callout";
import { DateTime, Money } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { useDiscardGuard } from "@/components/domain/unsaved-changes";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Pending } from "@/components/ui/pending";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CauseAreaConfig } from "@/features/distribution/model";
import { useCauseAreaConfig } from "@/features/distribution/queries";
import { useHotkey } from "@/hooks/use-hotkey";
import { formatNumber } from "@/lib/format";
import { notify } from "@/lib/notify";
import { strings } from "@/lib/strings";
import { useTRPC } from "@/lib/trpc";
import {
  preferredOwner,
  rememberOwner,
  visiblePaymentMethods,
  type DataOwner,
  type PaymentMethod,
} from "./api";
import { DonationFields } from "./donation-fields";
import {
  briefSplit,
  kidOptions,
  mostUsedKid,
  type DonorDistribution,
} from "./donor-register-model";
import { formatAmount } from "./edit-model";
import { fromDateTimeInputs, parseMoneyInput, serverErrors } from "./form";
import {
  emptyRegisterDraft,
  registerFieldNames,
  registerInput,
  validateRegister,
  type RegisterDraft,
  type RegisterField,
} from "./register-model";

/**
 * "Add donation" on the donor page: the registration form of the Register donation page (date
 * and time, amount, external reference, method, data owner, receipt), but the KID is picked from
 * this donor's own distributions, the most used first. A check step shows what will be
 * registered, with the amount in the button. New distributions are made on the Register page.
 */
export function RegisterForDonorDialog({
  donor,
  distributions,
  trigger,
}: {
  donor: { id: number; name: string };
  /** The donor's KIDs (donors.distributionsAggregated); undefined while loading. */
  distributions: DonorDistribution[] | undefined;
  trigger: ReactNode;
}) {
  const trpc = useTRPC();
  const methods = useQuery({
    ...trpc.config.paymentMethods.list.queryOptions(),
    staleTime: 300_000,
  });
  const owners = useQuery({ ...trpc.meta.owners.queryOptions(), staleTime: 300_000 });
  const config = useCauseAreaConfig({ includeInactive: true });
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const guard = useDiscardGuard(dirty, () => setOpen(false));
  const ready =
    distributions && methods.data && owners.data && config.data ? (
      <RegisterForm
        donor={donor}
        distributions={distributions}
        paymentMethods={visiblePaymentMethods(methods.data)}
        owners={owners.data}
        config={config.data}
        onDirtyChange={setDirty}
        onBusyChange={setBusy}
        onDone={() => {
          setDirty(false);
          setOpen(false);
        }}
        onCancel={() => guard.requestClose()}
      />
    ) : null;
  const error = methods.error ?? owners.error ?? config.error;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) {
          setDirty(false);
          setOpen(true);
        } else guard.requestClose();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add donation for {donor.name}</DialogTitle>
          <DialogDescription>
            Registers a payment on one of this donor's KIDs. To use a new split, register it on the{" "}
            <Link to="/donations/register" className="text-accent hover:underline">
              Register donation
            </Link>{" "}
            page.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Callout tone="danger" title="Couldn't load the form">
            Close the dialog and try again.
          </Callout>
        ) : (
          (ready ?? <Pending className="min-h-80" />)
        )}
      </DialogContent>
      {guard.dialog}
    </Dialog>
  );
}

function RegisterForm({
  donor,
  distributions,
  paymentMethods,
  owners,
  config,
  onDirtyChange,
  onBusyChange,
  onDone,
  onCancel,
}: {
  donor: { id: number; name: string };
  distributions: DonorDistribution[];
  paymentMethods: PaymentMethod[];
  owners: DataOwner[];
  config: CauseAreaConfig[];
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const register = useMutation(trpc.donations.register.mutationOptions());
  const options = kidOptions(distributions);
  const [start] = useState(() =>
    emptyRegisterDraft({
      KID: mostUsedKid(distributions),
      ownerId: String(preferredOwner(owners)?.id ?? ""),
    }),
  );
  const [draft, setDraft] = useState<RegisterDraft>(start);
  const [step, setStep] = useState<"details" | "check">("details");
  const [touched, setTouched] = useState(false);
  const [server, setServer] = useState<ReturnType<typeof serverErrors<RegisterField>>>({
    fields: {},
  });

  // The split of each KID, for the picker. Donors have a handful of KIDs; tRPC batches these.
  const splits = useQueries({
    queries: options.map((option) => ({
      ...trpc.donations.distributions.get.queryOptions({ kid: option.KID }),
      staleTime: 60_000,
    })),
  });
  const splitOf = (KID: string) => {
    const data = splits[options.findIndex((o) => o.KID === KID)]?.data;
    return data ? briefSplit(data, config) : null;
  };

  const errors = validateRegister(draft);
  const valid = Object.keys(errors).length === 0;
  const shown = (field: RegisterField) =>
    server.fields[field] ?? (touched ? errors[field] : undefined);
  const sum = parseMoneyInput(draft.sum);
  const timestamp = fromDateTimeInputs(draft.date, draft.time);
  const methodName = paymentMethods.find((m) => String(m.id) === draft.paymentId)?.name;
  const ownerName = owners.find((o) => String(o.id) === draft.ownerId)?.name;

  useEffect(
    () => onDirtyChange(JSON.stringify(draft) !== JSON.stringify(start)),
    [draft, start, onDirtyChange],
  );

  const set = <K extends keyof RegisterDraft>(key: K, value: RegisterDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    const field = key === "date" || key === "time" ? "timestamp" : key;
    setServer((current) => ({ ...current, fields: { ...current.fields, [field]: undefined } }));
  };

  function toCheck() {
    setTouched(true);
    if (!valid) return;
    setServer({ fields: {} });
    setStep("check");
  }

  async function submit() {
    if (!valid || register.isPending) return;
    setServer({ fields: {} });
    onBusyChange(true);
    try {
      const result = await register.mutateAsync(registerInput(draft));
      rememberOwner(Number(draft.ownerId));
      const input = { donorId: donor.id };
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.donors.donations.queryKey(input) }),
        queryClient.invalidateQueries({
          queryKey: trpc.donors.distributionsAggregated.queryKey(input),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.donors.donationsAggregated.queryKey(input),
        }),
        queryClient.invalidateQueries({ queryKey: trpc.donations.pathKey() }),
      ]);
      notify.success(`Registered ${formatAmount(sum!)}`, `Donation #${result.donationId}`, {
        label: "Open donation",
        onClick: () =>
          void navigate({ to: "/donations/$id", params: { id: String(result.donationId) } }),
      });
      onDone();
    } catch (err) {
      const mapped = serverErrors(err, registerFieldNames);
      setServer(mapped);
      // Problems with a field are fixed on the form, next to the field.
      if (Object.keys(mapped.fields).length > 0) setStep("details");
    } finally {
      onBusyChange(false);
    }
  }

  useHotkey("mod+enter", () => (step === "details" ? toCheck() : void submit()), {
    enabled: options.length > 0,
  });

  if (options.length === 0) {
    return (
      <>
        <Callout tone="warning" title={`${donor.name} has no KIDs yet`}>
          Register the donation on a new distribution instead.
        </Callout>
        <DialogFooter>
          <Button onClick={onCancel}>{strings.actions.cancel}</Button>
          <Button variant="primary" asChild>
            <Link to="/donations/register">
              <PlusIcon />
              Register donation
            </Link>
          </Button>
        </DialogFooter>
      </>
    );
  }

  const general = server.general && (
    <Callout tone="danger" title={server.general.title}>
      {server.general.hint}
    </Callout>
  );

  if (step === "check") {
    const selected = options.find((o) => o.KID === draft.KID);
    return (
      <>
        <div className="grid gap-1">
          <Money value={sum} className="text-3xl font-semibold tracking-tight" />
          <span className="text-sm text-muted-foreground">
            {timestamp && <DateTime value={timestamp} format="datetime" />} · {methodName}
          </span>
        </div>
        <PropertyList labelWidth="9rem">
          <Property label="Donor">
            {donor.name} · #{donor.id}
          </Property>
          <Property label="KID">
            <span className="num">{draft.KID}</span>
            {selected && splitOf(selected.KID) && (
              <span className="text-muted-foreground"> · {splitOf(selected.KID)}</span>
            )}
          </Property>
          <Property label="External reference">{draft.externalRef.trim()}</Property>
          <Property label="Data owner">{ownerName}</Property>
          <Property label="Receipt">
            {draft.sendReceipt ? "Emailed to the donor" : "Not sent"}
          </Property>
        </PropertyList>
        {general}
        <DialogFooter>
          <Button onClick={() => setStep("details")} disabled={register.isPending}>
            <ArrowLeftIcon />
            {strings.actions.back}
          </Button>
          <Button variant="primary" pending={register.isPending} onClick={() => void submit()}>
            <CheckIcon />
            Register {sum ? formatAmount(sum) : ""}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        toCheck();
      }}
    >
      <Field
        label="KID"
        hint="This donor's distributions, the most used first."
        error={shown("KID")}
        required
      >
        <Select value={draft.KID} onValueChange={(KID) => set("KID", KID)}>
          <SelectTrigger className="min-w-0 [&>span]:truncate">
            <SelectValue placeholder="Choose a KID" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => {
              const split = splitOf(option.KID);
              return (
                <SelectItem key={option.KID} value={option.KID}>
                  <span className="num">{option.KID}</span>
                  <span className="text-muted-foreground">
                    {split ? ` · ${split}` : ""} · {formatNumber(option.count)}{" "}
                    {option.count === 1 ? "donation" : "donations"}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </Field>
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
      {general}
      <DialogFooter>
        <Button type="button" onClick={onCancel}>
          {strings.actions.cancel}
        </Button>
        <Button type="submit" variant="primary">
          Check
          <ArrowRightIcon />
        </Button>
      </DialogFooter>
    </form>
  );
}
