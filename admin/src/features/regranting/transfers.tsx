/**
 * Approved and paid rounds: one row per transfer (bank transaction) with its payment. Payments
 * are recorded per transfer while the round is approved; a paid round is read-only and is fixed
 * with correction adjustments in a later round.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { DateTime, Money } from "@/components/domain/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { parseMoneyInput } from "@/features/donations/form";
import { RecordDialog } from "@/features/settings/record-dialog";
import { osloDay } from "@/lib/dates";
import { formatMoney, formatMoneyInput } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useTRPC } from "@/lib/trpc";
import { AdjustmentDialog } from "./adjustment-dialog";
import { lineLabel, type RoundSummary, type Transfer } from "./model";
import { parsePreciseDecimal, validatePayment, type PaymentForm } from "./payment-form";
import { ForeignAmount, RecipientLink } from "./ui";

export function Transfers({ round, transfers }: { round: RoundSummary; transfers: Transfer[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const clear = useMutation(trpc.regranting.transfers.clearPayment.mutationOptions());
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });

  if (transfers.length === 0)
    return (
      <p className="rounded-md border border-border px-4 py-6 text-sm text-muted-foreground">
        No transfers in this round.
      </p>
    );

  return (
    <div className="grid gap-3">
      {transfers.map((t) => (
        <section
          key={t.id}
          aria-label={`Transfer #${t.id} to ${t.payee.name}`}
          className="rounded-md border border-border bg-surface"
        >
          <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-3 py-2.5">
            <h3 className="flex-1 font-semibold">
              Transfer #{t.id} · {t.payee.name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{t.currency}</span>
            </h3>
            <Money value={t.amountNok} className="font-semibold" />
            {t.paidAt ? (
              <Badge tone="success">
                <CheckIcon />
                Paid <DateTime value={t.paidAt} />
              </Badge>
            ) : (
              <Badge tone="warning">Payment not recorded</Badge>
            )}
            {round.status === "approved" && (
              <>
                <RecordPaymentDialog transfer={t} />
                {t.paidAt && (
                  <ConfirmDialog
                    trigger={
                      <Button size="sm" variant="ghost">
                        Clear payment
                      </Button>
                    }
                    title={`Clear the payment of transfer #${t.id}?`}
                    consequences={[
                      "The paid date, amounts, fee and reference are removed",
                      "The round can't be marked paid until it's recorded again",
                    ]}
                    confirmLabel="Clear payment"
                    onConfirm={async () => {
                      await clear.mutateAsync({ id: t.id });
                      await invalidate();
                      notify.success("Payment cleared", `Transfer #${t.id}`);
                    }}
                  />
                )}
              </>
            )}
            {round.status === "paid" && (
              <AdjustmentDialog
                title={`Correct transfer #${t.id}`}
                trigger={<Button size="sm">Add correction…</Button>}
                initial={{
                  type: "correction",
                  linkedTransferId: String(t.id),
                  organizationId: t.lines.length === 1 ? t.lines[0]!.organizationId : null,
                  reason: `Correction of transfer #${t.id} in ${round.name}`,
                }}
              />
            )}
          </header>
          {t.paidAt && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 border-b border-border px-3 py-2 text-sm sm:grid-cols-5">
              <div>
                <dt className="text-xs text-muted-foreground">Paid amount</dt>
                <dd>
                  <ForeignAmount value={t.amountForeign} currency={t.currency} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">FX rate (NOK)</dt>
                <dd className="num">{t.fxRate ?? "–"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Bank fee</dt>
                <dd>
                  <Money value={t.bankFee} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Bank reference</dt>
                <dd className="truncate">{t.bankRef ?? "–"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Paid by</dt>
                <dd>{t.paidBy === "external" ? "External payer" : "Foundation"}</dd>
              </div>
            </dl>
          )}
          <table className="w-full text-sm" aria-label={`Lines of transfer #${t.id}`}>
            <thead>
              <tr className="text-left text-xs text-muted-foreground [&>th]:px-3 [&>th]:py-1.5 [&>th]:font-semibold">
                <th scope="col">Recipient</th>
                <th scope="col">Project</th>
                <th scope="col" className="text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {t.lines.map((l) => (
                <tr
                  key={l.id}
                  className="[&>td]:border-t [&>td]:border-border [&>td]:px-3 [&>td]:py-1"
                >
                  <td>
                    <RecipientLink organizationId={l.organizationId}>
                      {l.organizationName}
                    </RecipientLink>
                  </td>
                  <td className="text-muted-foreground">{lineLabel(l)}</td>
                  <td className="text-right">
                    <Money value={l.amountNok} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function RecordPaymentDialog({ transfer: t }: { transfer: Transfer }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const record = useMutation(trpc.regranting.transfers.recordPayment.mutationOptions());
  return (
    <RecordDialog<PaymentForm>
      trigger={
        <Button size="sm" variant={t.paidAt ? "ghost" : "secondary"}>
          {t.paidAt ? "Edit payment" : "Record payment…"}
        </Button>
      }
      title={`Record the payment of transfer #${t.id}`}
      description={`${formatMoney(t.amountNok)} to ${
        t.payee.name
      }. Enter what the bank statement says. The bank fee is paid by operations and doesn't lower the recipients' balances.`}
      initial={() => ({
        paidAt: t.paidAt ?? osloDay(),
        currency: t.currency,
        amountForeign: t.amountForeign ?? "",
        fxRate: t.fxRate ?? "",
        bankFee: t.bankFee ? formatMoneyInput(t.bankFee) : "",
        bankRef: t.bankRef ?? "",
        paidBy: t.paidBy,
      })}
      validate={(v) => validatePayment(v, t.amountNok)}
      saveLabel={`Record ${formatMoney(t.amountNok)}`}
      onSave={async (v) => {
        await record.mutateAsync({
          id: t.id,
          paidAt: v.paidAt,
          currency: v.currency.trim(),
          amountForeign: v.amountForeign.trim() ? parsePreciseDecimal(v.amountForeign) : null,
          fxRate: v.fxRate.trim() ? parsePreciseDecimal(v.fxRate) : null,
          bankFee: v.bankFee.trim() ? Number(parseMoneyInput(v.bankFee)) : null,
          bankRef: v.bankRef.trim() || null,
          paidBy: v.paidBy,
        });
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        notify.success("Payment recorded", `Transfer #${t.id} to ${t.payee.name}`);
      }}
    >
      {({ values, set, errors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Paid on" required error={errors.paidAt}>
              <DateInput value={values.paidAt} onValueChange={(paidAt) => set({ paidAt })} />
            </Field>
            <Field label="Currency" required error={errors.currency}>
              <Input
                className="num"
                value={values.currency}
                onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field
              label={`Amount in ${values.currency || "currency"}`}
              error={errors.amountForeign}
              hint="Up to 8 decimals (BTC)"
            >
              <Input
                inputMode="decimal"
                className="num"
                value={values.amountForeign}
                onChange={(e) => set({ amountForeign: e.target.value })}
              />
            </Field>
            <Field label="FX rate" error={errors.fxRate} hint="NOK per unit of the currency">
              <Input
                inputMode="decimal"
                className="num"
                value={values.fxRate}
                onChange={(e) => set({ fxRate: e.target.value })}
              />
            </Field>
            <Field label="Bank fee (NOK)" error={errors.bankFee}>
              <Input
                inputMode="decimal"
                className="num"
                value={values.bankFee}
                onChange={(e) => set({ bankFee: e.target.value })}
              />
            </Field>
            <Field label="Bank reference" error={errors.bankRef}>
              <Input value={values.bankRef} onChange={(e) => set({ bankRef: e.target.value })} />
            </Field>
          </div>
          <Field
            label="Paid by"
            hint="External: someone else paid (e.g. EA Norway); it won't be in our bank statement"
          >
            <SegmentedControl
              label="Paid by"
              value={values.paidBy}
              onValueChange={(paidBy) => set({ paidBy })}
              options={[
                { value: "foundation", label: "Foundation" },
                { value: "external", label: "External payer" },
              ]}
            />
          </Field>
        </>
      )}
    </RecordDialog>
  );
}
