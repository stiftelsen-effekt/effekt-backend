import { format as formatDateFns } from "date-fns";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CornerDownLeftIcon,
  SkipForwardIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Callout } from "@/components/domain/callout";
import { CopyValue } from "@/components/domain/copy-value";
import { DistributionEditor } from "@/components/domain/distribution-editor";
import { describeError } from "@/components/domain/error-state";
import { DateTime, Money } from "@/components/domain/format";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Status } from "@/components/domain/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  draftToApi,
  emptyDraft,
  validateDraft,
  type ApiCauseAreaShare,
  type CauseAreaConfig,
  type DistributionDraft,
} from "@/features/distribution/model";
import { useHotkey } from "@/hooks/use-hotkey";
import { formatMoney } from "@/lib/format";
import { notify } from "@/lib/notify";
import { importStatus } from "@/lib/status";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { reopenReviewEntry, resolveReviewEntry, reviewQueue, type ReviewEntry } from "./store";

export type RegisterInput = RouterInputs["donations"]["register"];
type PaymentMethod = RouterOutputs["config"]["paymentMethods"]["list"][number];

type Draft = {
  mode: "kid" | "distribution";
  KID: string;
  donorId: string;
  distribution: DistributionDraft;
  sum: string;
  date: string;
  paymentId: string;
  externalRef: string;
  sendReceipt: boolean;
};

function draftFor(entry: ReviewEntry, config: CauseAreaConfig[]): Draft {
  const t = entry.transaction;
  return {
    mode: t.KID ? "kid" : "distribution",
    KID: t.KID ?? "",
    donorId: "",
    distribution: emptyDraft(config),
    sum: String(t.amount),
    date: t.date ? formatDateFns(new Date(t.date), "yyyy-MM-dd") : "",
    paymentId: String(t.paymentID),
    externalRef: t.transactionID,
    sendReceipt: true,
  };
}

/**
 * Work through unmatched transactions one at a time: the raw transaction on the left, a
 * registration form prefilled from it on the right. Register (⌘Enter) or Skip moves to the
 * next open item; Skip can be undone from the toast. State lives in the review queue store,
 * so a reload resumes at the same item.
 *
 * `register` should call trpc.donations.register and return the new donation id.
 */
export function ReviewWorkbench({
  causeAreas,
  paymentMethods,
  register,
  metaOwnerId,
}: {
  causeAreas: CauseAreaConfig[];
  paymentMethods: PaymentMethod[];
  register: (input: RegisterInput) => Promise<{ donationId: number }>;
  metaOwnerId: number;
}) {
  const entries = reviewQueue.use();
  const open = entries.filter((entry) => entry.state === "open");
  const [currentKey, setCurrentKey] = useState<string | null>(open[0]?.key ?? null);
  const current = entries.find((entry) => entry.key === currentKey) ?? open[0];
  const index = current ? entries.indexOf(current) : -1;
  const resolvedCount = entries.length - open.length;

  useEffect(() => {
    if (!current && open[0]) setCurrentKey(open[0].key);
  }, [current, open]);

  function goNextOpen(afterKey: string) {
    const position = entries.findIndex((entry) => entry.key === afterKey);
    const next =
      entries
        .slice(position + 1)
        .find((entry) => entry.state === "open" && entry.key !== afterKey) ??
      entries.find((entry) => entry.state === "open" && entry.key !== afterKey);
    setCurrentKey(next?.key ?? null);
  }

  if (entries.length === 0) {
    return (
      <Callout tone="neutral" title="The review queue is empty">
        Upload a payment report to fill it.
      </Callout>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-1.5 min-w-40 flex-1 overflow-hidden rounded-full bg-border" aria-hidden>
          <div
            className="h-full rounded-full bg-success transition-[width] duration-(--duration-slow)"
            style={{ width: `${(resolvedCount / entries.length) * 100}%` }}
          />
        </div>
        <p className="num text-sm text-muted-foreground" aria-live="polite">
          {resolvedCount} of {entries.length} done · {open.length} open
        </p>
        <div className="flex gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Previous item"
            disabled={index <= 0}
            onClick={() => setCurrentKey(entries[index - 1]!.key)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Next item"
            disabled={index >= entries.length - 1}
            onClick={() => setCurrentKey(entries[index + 1]!.key)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      {current ? (
        <ReviewItem
          key={current.key}
          entry={current}
          position={index + 1}
          total={entries.length}
          causeAreas={causeAreas}
          paymentMethods={paymentMethods}
          metaOwnerId={metaOwnerId}
          onRegister={async (input) => {
            const { donationId } = await register(input);
            resolveReviewEntry(current.key, { state: "registered", donationId });
            notify.success(`Registered ${formatMoney(input.sum)}`, `Donation #${donationId}`);
            goNextOpen(current.key);
          }}
          onSkip={() => {
            resolveReviewEntry(current.key, { state: "skipped" });
            notify.undo("Skipped transaction", () => {
              reopenReviewEntry(current.key);
              setCurrentKey(current.key);
            });
            goNextOpen(current.key);
          }}
          onReopen={() => reopenReviewEntry(current.key)}
        />
      ) : (
        <Callout tone="success" title="All transactions reviewed">
          {resolvedCount} handled. Skipped items stay listed in case you need them.
        </Callout>
      )}
    </div>
  );
}

function ReviewItem({
  entry,
  position,
  total,
  causeAreas,
  paymentMethods,
  metaOwnerId,
  onRegister,
  onSkip,
  onReopen,
}: {
  entry: ReviewEntry;
  position: number;
  total: number;
  causeAreas: CauseAreaConfig[];
  paymentMethods: PaymentMethod[];
  metaOwnerId: number;
  onRegister: (input: RegisterInput) => Promise<void>;
  onSkip: () => void;
  onReopen: () => void;
}) {
  const [draft, setDraft] = useState(() => draftFor(entry, causeAreas));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [touched, setTouched] = useState(false);
  const t = entry.transaction;
  const resolved = entry.state !== "open";

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const sum = Number(draft.sum.replace(",", "."));
  const errors = {
    KID:
      draft.mode === "kid" && !/^\d{5,15}$/.test(draft.KID)
        ? "Enter a KID of 5–15 digits"
        : undefined,
    donorId:
      draft.mode === "distribution" && !/^\d+$/.test(draft.donorId)
        ? "Pick the donor this belongs to"
        : undefined,
    distribution:
      draft.mode === "distribution" && !validateDraft(draft.distribution).valid
        ? "Fix the distribution"
        : undefined,
    sum: !(sum > 0) ? "Enter an amount above 0" : undefined,
    date: !draft.date ? "Enter the payment date" : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);

  async function submit() {
    setTouched(true);
    if (!valid || resolved) return;
    setPending(true);
    setError(null);
    try {
      const distribution: ApiCauseAreaShare[] = draftToApi(draft.distribution);
      await onRegister({
        ...(draft.mode === "kid"
          ? { KID: draft.KID }
          : {
              distribution: {
                donorId: Number(draft.donorId),
                taxUnitId: null,
                causeAreas: distribution,
              },
            }),
        sum,
        timestamp: draft.date,
        paymentId: Number(draft.paymentId),
        paymentExternalRef: draft.externalRef || null,
        metaOwnerId,
        sendReceipt: draft.sendReceipt,
      });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  useHotkey("mod+enter", () => void submit(), { enabled: !resolved });
  const show = (key: keyof typeof errors) => (touched ? errors[key] : undefined);
  const errorInfo = error ? describeError(error) : null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section
        aria-label="Transaction"
        className="grid gap-4 rounded-md border border-border bg-surface p-4 lg:sticky lg:top-0"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="num text-sm text-muted-foreground">
            Item {position} of {total}
          </span>
          <Status catalog={importStatus} value={entry.state === "open" ? "review" : entry.state} />
        </div>
        <div className="grid gap-1">
          <Money value={t.amount} className="text-3xl font-semibold tracking-tight" />
          <span className="text-sm text-muted-foreground">
            <DateTime value={t.date} /> ·{" "}
            {paymentMethods.find((m) => m.id === t.paymentID)?.name ?? "Unknown method"}
          </span>
        </div>
        <Callout tone="warning" title={entry.reason} />
        <PropertyList labelWidth="5.5rem">
          <Property label="Payer">{t.name}</Property>
          <Property label="Message">{t.message && <q>{t.message}</q>}</Property>
          <Property label="Location">{t.location}</Property>
          <Property label="KID">{t.KID && <CopyValue value={t.KID} label="KID" />}</Property>
          <Property label="Reference">
            <CopyValue value={t.transactionID} label="transaction reference" />
          </Property>
          <Property label="File">{entry.fileName}</Property>
        </PropertyList>
      </section>

      <form
        aria-label="Register donation"
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {resolved && (
          <Callout
            tone={entry.state === "registered" ? "success" : "neutral"}
            title={
              entry.state === "registered"
                ? `Registered as donation #${entry.donationId}`
                : "Skipped"
            }
            action={
              entry.state === "skipped" && (
                <Button size="sm" onClick={onReopen}>
                  Reopen
                </Button>
              )
            }
          />
        )}
        <fieldset disabled={resolved || pending} className="grid gap-5">
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
            <Field
              label="KID"
              error={show("KID")}
              hint="The donor's KID; check the message and payer name."
            >
              <Input
                value={draft.KID}
                inputMode="numeric"
                autoComplete="off"
                className="num max-w-56"
                onChange={(event) => set("KID", event.target.value.trim())}
              />
            </Field>
          ) : (
            <>
              <Field
                label="Donor ID"
                error={show("donorId")}
                hint="Search with ⌘K and copy the id."
              >
                <Input
                  value={draft.donorId}
                  inputMode="numeric"
                  className="num max-w-40"
                  onChange={(event) => set("donorId", event.target.value.trim())}
                />
              </Field>
              <div className="grid gap-1.5">
                <span className="text-sm font-semibold">Distribution</span>
                <DistributionEditor
                  config={causeAreas}
                  value={draft.distribution}
                  onChange={(distribution) => set("distribution", distribution)}
                />
              </div>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Amount" error={show("sum")}>
              <div className="relative">
                <Input
                  value={draft.sum}
                  inputMode="decimal"
                  className="num pr-8 text-right"
                  onChange={(event) => set("sum", event.target.value)}
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                  kr
                </span>
              </div>
            </Field>
            <Field label="Payment date" error={show("date")}>
              <Input
                type="date"
                value={draft.date}
                className="num"
                onChange={(event) => set("date", event.target.value)}
              />
            </Field>
            <Field label="Payment method">
              <Select value={draft.paymentId} onValueChange={(value) => set("paymentId", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.id} value={String(method.id)}>
                      {method.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field
            label="External reference"
            hint="Kept so the same transaction is never registered twice."
          >
            <Input
              value={draft.externalRef}
              className="num"
              onChange={(event) => set("externalRef", event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={draft.sendReceipt}
              onCheckedChange={(checked) => set("sendReceipt", checked === true)}
            />
            Email the donor a receipt
          </label>
        </fieldset>

        {errorInfo && (
          <Callout tone="danger" title={errorInfo.title}>
            {errorInfo.hint}
          </Callout>
        )}

        {!resolved && (
          <div className={cn("flex flex-wrap items-center gap-2 border-t border-border pt-4")}>
            <Button type="submit" variant="primary" pending={pending}>
              <CheckIcon />
              Register {sum > 0 ? formatMoney(sum) : ""}
              <Kbd className="border-primary-foreground/30 bg-transparent text-primary-foreground/80">
                ⌘<CornerDownLeftIcon className="size-3" />
              </Kbd>
            </Button>
            <Button type="button" onClick={onSkip} disabled={pending}>
              <SkipForwardIcon />
              Skip
            </Button>
            <span className="text-sm text-muted-foreground">
              Skipped items are not registered and can be reopened.
            </span>
          </div>
        )}
      </form>
    </div>
  );
}
