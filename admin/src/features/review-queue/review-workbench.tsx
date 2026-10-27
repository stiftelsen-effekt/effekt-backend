import {
  BanIcon,
  CheckIcon,
  CornerDownLeftIcon,
  RotateCcwIcon,
  SkipForwardIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Callout } from "@/components/domain/callout";
import { CopyValue } from "@/components/domain/copy-value";
import { DateTime, Money } from "@/components/domain/format";
import { JsonViewer } from "@/components/domain/json-viewer";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Status } from "@/components/domain/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { withCurrentStandardSplits, type CauseAreaConfig } from "@/features/distribution/model";
import type { DataOwner, PaymentMethod } from "@/features/donations/api";
import { KidPreview, NewDistributionFields } from "@/features/donations/distribution-fields";
import { DonationFields } from "@/features/donations/donation-fields";
import { formatAmount } from "@/features/donations/edit-model";
import { parseMoneyInput, serverErrors, type ServerErrors } from "@/features/donations/form";
import {
  registerFieldNames,
  validateRegister,
  type RegisterDraft,
  type RegisterField,
} from "@/features/donations/register-model";
import type { DonorSearch } from "@/features/donors/donor-picker";
import { useHotkey } from "@/hooks/use-hotkey";
import { reviewStatus } from "@/lib/status";
import { errorCode } from "@/lib/trpc";
import {
  draftForItem,
  isResolvedElsewhere,
  reviewRegisterInput,
  reasonText,
  sourceLabel,
  type ReviewItem,
  type ReviewRegisterInput,
} from "./model";

export type ReviewWorkbenchProps = {
  item: ReviewItem;
  /** The transaction as the parser produced it (reports.reviewQueue.get), when loaded. */
  raw?: unknown;
  config: CauseAreaConfig[];
  paymentMethods: PaymentMethod[];
  owners: DataOwner[];
  /** Data owner the form starts with. */
  defaultOwnerId: string;
  register: (input: ReviewRegisterInput) => Promise<void>;
  ignore: (note: string | undefined) => Promise<void>;
  reopen: () => Promise<void>;
  /** Go to the next item without deciding. */
  onSkip?: () => void;
  /** The item was resolved by someone else while it was open here. */
  onResolvedElsewhere: (message: string) => void;
  /** Where the transaction came from (file / import log entry). */
  importInfo?: ReactNode;
  /** A link to the donation an item was registered as. */
  donationLink: (donationId: number) => ReactNode;
  /** Replacements for the API lookups (the /design demo). */
  donorSearch?: DonorSearch;
  kidPreview?: (kid: string) => ReactNode;
};

/**
 * One review-queue item: the raw transaction on the left, a registration form prefilled from
 * it on the right. Register (⌘Enter), Ignore (with an optional note) or Skip. Resolved items
 * show who resolved them; ignored ones can be reopened. Key it by item id so the form resets
 * between items.
 */
export function ReviewWorkbench(props: ReviewWorkbenchProps) {
  const { item, raw, paymentMethods, importInfo } = props;
  const method = paymentMethods.find((m) => m.id === item.paymentId)?.name;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section
        aria-label="Transaction"
        className="grid gap-4 rounded-md border border-border bg-surface p-4 lg:sticky lg:top-0"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="num text-sm text-muted-foreground">Item #{item.id}</span>
          <Status catalog={reviewStatus} value={item.status} />
        </div>
        <div className="grid gap-1">
          <Money value={item.amount} className="text-3xl font-semibold tracking-tight" />
          <span className="text-sm text-muted-foreground">
            <DateTime value={item.date} /> · {method ?? `Payment method ${item.paymentId}`}
          </span>
        </div>
        <Callout tone="warning" title={reasonText(item.reason)} />
        <PropertyList labelWidth="5.5rem">
          <Property label="Payer">{item.name}</Property>
          <Property label="Message">{item.message && <q>{item.message}</q>}</Property>
          <Property label="Location">{item.location}</Property>
          <Property label="KID">{item.KID && <CopyValue value={item.KID} label="KID" />}</Property>
          <Property label="Reference">
            {item.externalId && <CopyValue value={item.externalId} label="transaction reference" />}
          </Property>
          <Property label="Source">{sourceLabel(item.source)}</Property>
          <Property label="Import">{importInfo}</Property>
          <Property label="Queued">
            <DateTime value={item.created} format="datetime" />
          </Property>
        </PropertyList>
        {raw !== undefined && raw !== null && (
          <details className="text-sm">
            <summary className="cursor-pointer rounded-sm text-muted-foreground focus-ring">
              Raw transaction
            </summary>
            <JsonViewer data={raw} defaultExpandDepth={1} className="mt-2" />
          </details>
        )}
      </section>

      {item.status === "open" ? <RegisterForm {...props} /> : <Resolution {...props} />}
    </div>
  );
}

function Resolution({ item, reopen, donationLink }: ReviewWorkbenchProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const by = (
    <>
      by {item.resolvedBy ?? "someone"}
      {item.resolvedAt && (
        <>
          {" "}
          <DateTime value={item.resolvedAt} format="relative" />
        </>
      )}
    </>
  );

  async function onReopen() {
    setPending(true);
    setError(null);
    try {
      await reopen();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  const reopenButton = (
    <Button size="sm" onClick={() => void onReopen()} pending={pending}>
      <RotateCcwIcon />
      Reopen
    </Button>
  );

  return (
    <div className="grid content-start gap-4">
      {item.status === "registered" ? (
        <Callout
          tone="success"
          title={
            item.donationId != null ? `Registered as donation #${item.donationId}` : "Registered"
          }
          action={item.donationId != null && donationLink(item.donationId)}
        >
          Registered {by}. To reopen it, delete the donation first.
        </Callout>
      ) : (
        <Callout tone="neutral" title="Ignored" action={reopenButton}>
          <p>Ignored {by}.</p>
          {item.note && (
            <p className="mt-1">
              Note: <q>{item.note}</q>
            </p>
          )}
        </Callout>
      )}
      {item.status === "registered" && item.donationId == null && reopenButton}
      {error && <Callout tone="danger" title="Couldn't reopen the item" children={error} />}
    </div>
  );
}

function RegisterForm({
  item,
  config,
  paymentMethods,
  owners,
  defaultOwnerId,
  register,
  ignore,
  onSkip,
  onResolvedElsewhere,
  donorSearch,
  kidPreview,
}: ReviewWorkbenchProps) {
  const [stored, setDraft] = useState<RegisterDraft>(() =>
    draftForItem(item, config, defaultOwnerId),
  );
  const draft = stored.distribution
    ? { ...stored, distribution: withCurrentStandardSplits(stored.distribution, config) }
    : stored;
  const [pending, setPending] = useState<"register" | "ignore" | null>(null);
  const [touched, setTouched] = useState(false);
  const [server, setServer] = useState<ServerErrors<RegisterField>>({ fields: {} });
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [note, setNote] = useState("");

  const errors = validateRegister(draft);
  const valid = Object.keys(errors).length === 0;
  const shown = (field: RegisterField) =>
    server.fields[field] ?? (touched ? errors[field] : undefined);
  const sum = parseMoneyInput(draft.sum);

  const set = <K extends keyof RegisterDraft>(key: K, value: RegisterDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    const field = key === "date" || key === "time" ? "timestamp" : key;
    setServer((current) => ({ ...current, fields: { ...current.fields, [field]: undefined } }));
  };

  /** True when the failure was handled as "someone else got there first". */
  function resolvedElsewhere(err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (errorCode(err) === "CONFLICT" && isResolvedElsewhere(message)) {
      onResolvedElsewhere(message);
      return true;
    }
    return false;
  }

  async function submit() {
    setTouched(true);
    if (!valid || pending) return;
    setPending("register");
    setServer({ fields: {} });
    try {
      await register(reviewRegisterInput(item.id, draft));
    } catch (err) {
      if (!resolvedElsewhere(err)) setServer(serverErrors(err, registerFieldNames));
    } finally {
      setPending(null);
    }
  }

  async function submitIgnore() {
    if (pending) return;
    setPending("ignore");
    setServer({ fields: {} });
    try {
      await ignore(note.trim() || undefined);
      setIgnoreOpen(false);
    } catch (err) {
      setIgnoreOpen(false);
      if (!resolvedElsewhere(err)) setServer(serverErrors(err, {}));
    } finally {
      setPending(null);
    }
  }

  useHotkey("mod+enter", () => void submit(), { enabled: !ignoreOpen });

  return (
    <form
      aria-label="Register donation"
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={pending !== null} className="grid gap-5">
        <legend className="sr-only">Registration</legend>
        <div className="grid gap-2">
          <span className="text-sm font-semibold">Register on</span>
          <SegmentedControl
            label="Register on"
            value={draft.mode}
            onValueChange={(mode) => set("mode", mode)}
            options={[
              { value: "kid", label: "Existing KID" },
              { value: "distribution", label: "New distribution" },
            ]}
          />
        </div>
        {draft.mode === "kid" ? (
          <div className="grid gap-3">
            <Field
              label="KID"
              error={shown("KID")}
              hint="The donor's KID; check the message and payer name."
              required
              className="max-w-64"
            >
              <Input
                value={draft.KID}
                inputMode="numeric"
                autoComplete="off"
                className="num"
                onChange={(event) => set("KID", event.target.value.trim())}
              />
            </Field>
            {kidPreview ? kidPreview(draft.KID) : <KidPreview kid={draft.KID} />}
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
              donorSearch={donorSearch}
              errors={{
                donorId: shown("donorId"),
                taxUnitId: shown("taxUnitId"),
                distribution: shown("distribution"),
              }}
            />
          )
        )}
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
          externalRefHint="Prefilled from the transaction, so it can never be registered twice."
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={draft.sendReceipt}
            onCheckedChange={(checked) => set("sendReceipt", checked === true)}
          />
          Email the donor a receipt
        </label>
      </fieldset>

      {server.general && (
        <Callout tone="danger" title={server.general.title}>
          {server.general.hint}
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="submit" variant="primary" pending={pending === "register"}>
          <CheckIcon />
          Register {sum ? formatAmount(sum) : ""}
          <Kbd className="border-primary-foreground/30 bg-transparent text-primary-foreground/80">
            ⌘<CornerDownLeftIcon className="size-3" />
          </Kbd>
        </Button>
        {onSkip && (
          <Button type="button" onClick={onSkip} disabled={pending !== null}>
            <SkipForwardIcon />
            Skip
          </Button>
        )}
        <Popover open={ignoreOpen} onOpenChange={setIgnoreOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" disabled={pending !== null}>
              <BanIcon />
              Ignore…
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="grid w-80 gap-3">
            <Field label="Note" hint="Optional. Why no donation is registered for this.">
              <Textarea
                value={note}
                rows={3}
                maxLength={2000}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" onClick={() => setIgnoreOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                pending={pending === "ignore"}
                onClick={() => void submitIgnore()}
              >
                Ignore item
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <span className="text-sm text-muted-foreground">
          Skip leaves it open; ignored items can be reopened.
        </span>
      </div>
    </form>
  );
}
