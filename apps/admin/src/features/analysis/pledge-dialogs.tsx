import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Callout } from "@/components/domain/callout";
import { DateTime, Money } from "@/components/domain/format";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Updating } from "@/components/ui/pending";
import { MoneyInput } from "@/features/donations/donation-fields";
import { moneyInputError, parseMoneyInput } from "@/features/donations/form";
import { PaymentMethodName } from "@/features/donations/payment-method-name";
import { RecordDialog } from "@/features/settings/record-dialog";
import { osloDay } from "@/lib/dates";
import { formatMoney, formatMoneyInput } from "@/lib/format";
import { compareMoney } from "@/lib/money";
import { notify } from "@/lib/notify";
import { usePageQuery } from "@/lib/query";
import { errorCode, useTRPC } from "@/lib/trpc";
import {
  pledgeCreateInput,
  receivedInput,
  validatePledge,
  validateReceived,
  type Pledge,
  type PledgeForm,
  type ReceivedForm,
} from "./model";

/** Pledges change the overview's numbers: refetch both after every change. */
export function useInvalidateAnalysis() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.analysis.pathKey() });
}

export function AddPledgeDialog({ trigger }: { trigger: ReactNode }) {
  const trpc = useTRPC();
  const create = useMutation(trpc.analysis.pledges.create.mutationOptions());
  const invalidate = useInvalidateAnalysis();
  return (
    <RecordDialog<PledgeForm>
      trigger={trigger}
      title="Add pledge"
      description="A decided gift that hasn't arrived. Only the amount and the date are stored, never who pledged."
      initial={() => ({ sum: "", decidedDate: osloDay() })}
      validate={validatePledge}
      saveLabel="Add pledge"
      onSave={async (form) => {
        const pledge = await create.mutateAsync(pledgeCreateInput(form));
        await invalidate();
        notify.success("Pledge added", `${formatMoney(pledge.sum)}, open`);
      }}
    >
      {({ values, set, errors }) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" required error={errors.sum}>
            <MoneyInput value={values.sum} onChange={(sum) => set({ sum })} />
          </Field>
          <Field label="Decided" required error={errors.decidedDate}>
            <DateInput
              value={values.decidedDate}
              onValueChange={(decidedDate) => set({ decidedDate })}
            />
          </Field>
        </div>
      )}
    </RecordDialog>
  );
}

/**
 * Lowers (or corrects) the amount: after a partial payment, what remains. The dialog shows
 * before → after so the change is explicit.
 */
export function ChangeAmountDialog({ pledge, trigger }: { pledge: Pledge; trigger: ReactNode }) {
  const trpc = useTRPC();
  const update = useMutation(trpc.analysis.pledges.update.mutationOptions());
  const invalidate = useInvalidateAnalysis();
  return (
    <RecordDialog<{ sum: string }>
      trigger={trigger}
      title={`Change the amount of pledge #${pledge.id}`}
      description="After a partial payment, enter what remains; register the payment as a donation as usual."
      initial={() => ({ sum: formatMoneyInput(pledge.sum) })}
      validate={(form) => ({ sum: moneyInputError(form.sum) })}
      saveLabel="Save amount"
      onSave={async (form) => {
        const after = await update.mutateAsync({
          id: pledge.id,
          sum: Number(parseMoneyInput(form.sum)!),
        });
        await invalidate();
        notify.success(
          "Pledge amount changed",
          `${formatMoney(pledge.sum)} → ${formatMoney(after.sum)}`,
        );
      }}
    >
      {({ values, set, errors }) => {
        const after = parseMoneyInput(values.sum);
        return (
          <>
            <Field label="Amount" required error={errors.sum}>
              <MoneyInput value={values.sum} onChange={(sum) => set({ sum })} />
            </Field>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              <Money value={pledge.sum} /> →{" "}
              {after ? <Money value={after} className="font-semibold text-foreground" /> : "–"}
            </p>
          </>
        );
      }}
    </RecordDialog>
  );
}

/** The money came in: closes the pledge, optionally linked to the donation that fulfilled it. */
export function MarkReceivedDialog({ pledge, trigger }: { pledge: Pledge; trigger: ReactNode }) {
  const trpc = useTRPC();
  const markReceived = useMutation(trpc.analysis.pledges.markReceived.mutationOptions());
  const invalidate = useInvalidateAnalysis();
  return (
    <RecordDialog<ReceivedForm>
      trigger={trigger}
      title={`Mark the pledge of ${formatMoney(pledge.sum)} as received`}
      description="Register the donation first, then link it here: the amount then counts as measured, and no longer as a pledge."
      initial={() => ({ receivedDate: osloDay(), donationId: "" })}
      validate={validateReceived}
      saveLabel="Mark as received"
      onSave={async (form) => {
        await markReceived.mutateAsync(receivedInput(pledge.id, form));
        await invalidate();
        notify.success(
          "Pledge marked as received",
          form.donationId.trim() ? `Linked to donation #${form.donationId.trim()}` : undefined,
        );
      }}
    >
      {({ values, set, errors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Received" required error={errors.receivedDate}>
              <DateInput
                value={values.receivedDate}
                onValueChange={(receivedDate) => set({ receivedDate })}
              />
            </Field>
            <Field
              label="Donation ID"
              hint="Optional: the donation that fulfilled it"
              error={errors.donationId}
            >
              <Input
                inputMode="numeric"
                autoComplete="off"
                className="num"
                value={values.donationId}
                onChange={(event) => set({ donationId: event.target.value.trim() })}
              />
            </Field>
          </div>
          <DonationLookup id={values.donationId} pledgeSum={pledge.sum} />
        </>
      )}
    </RecordDialog>
  );
}

/** What a typed donation ID points at, with a link, or that it doesn't exist. */
function DonationLookup({ id, pledgeSum }: { id: string; pledgeSum: string }) {
  const trpc = useTRPC();
  const valid = /^[1-9]\d{0,9}$/.test(id);
  const donation = usePageQuery({
    ...trpc.donations.get.queryOptions({ id: Number(id) }),
    enabled: valid,
    retry: false,
  });
  if (!valid) return null;
  if (donation.isError) {
    return errorCode(donation.error) === "NOT_FOUND" ? (
      <Callout tone="warning" title={`No donation has ID ${id}`}>
        Check the number, or leave it empty.
      </Callout>
    ) : (
      <Callout tone="danger" title="Couldn't look up the donation" />
    );
  }
  const d = donation.data;
  return (
    <Updating
      active={donation.isPlaceholderData || !d}
      className="min-h-12 rounded-md border border-border bg-surface px-4 py-3 text-sm"
    >
      {d && (
        <>
          <Link
            to="/donations/$id"
            params={{ id: String(d.id) }}
            target="_blank"
            className="font-semibold text-accent hover:underline"
          >
            Donation #{d.id}
          </Link>
          : <Money value={d.sum} className="font-semibold" /> from {d.donor} on{" "}
          <DateTime value={d.timestamp} /> · <PaymentMethodName value={d.paymentMethod} />
          {compareMoney(d.sum, pledgeSum) !== 0 && (
            <p className="mt-1 text-muted-foreground">
              The pledge is {formatMoney(pledgeSum)}. If this was a partial payment, change the
              pledge's amount to what remains instead.
            </p>
          )}
        </>
      )}
    </Updating>
  );
}
