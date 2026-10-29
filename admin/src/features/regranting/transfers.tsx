/**
 * Approved and paid rounds: one table of all transfers (bank transactions), a header row each
 * with its payment and its lines beneath, so the columns line up across transfers. Payments
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
import { DocumentLinks } from "./documents";
import { EditNotesDialog, NotesText } from "./notes";
import { TransferOnward, useIntermediaryPayees } from "./onward";
import { lineLabel, type RoundSummary, type Transfer } from "./model";
import { parsePreciseDecimal, validatePayment, type PaymentForm } from "./payment-form";
import { ForeignAmount, RecipientLink } from "./ui";

export function Transfers({ round, transfers }: { round: RoundSummary; transfers: Transfer[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const clear = useMutation(trpc.regranting.transfers.clearPayment.mutationOptions());
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
  const intermediaries = useIntermediaryPayees();

  if (transfers.length === 0)
    return (
      <p className="rounded-md border border-border px-4 py-6 text-sm text-muted-foreground">
        No transfers in this round.
      </p>
    );

  // One table for every transfer, so its columns line up down the page like a spreadsheet:
  // per transfer a header row (total, payment, status), its lines, then documents, notes and
  // the payment actions.
  return (
    <div className="min-w-0 overflow-x-auto rounded-md border border-border bg-surface">
      <table className="w-full border-separate border-spacing-0 text-sm" aria-label="Transfers">
        <thead>
          <tr className="text-left text-xs text-muted-foreground [&>th]:border-b [&>th]:border-border [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
            <th scope="col" className="min-w-48">
              Transfer / recipient
            </th>
            <th scope="col" className="min-w-36">
              Project
            </th>
            <th scope="col" className="text-right">
              Amount
            </th>
            <th scope="col" className="text-right">
              Paid amount
            </th>
            <th scope="col" className="text-right">
              FX rate (NOK)
            </th>
            <th scope="col" className="text-right">
              Bank fee
            </th>
            <th scope="col">Status</th>
            <th scope="col">Bank reference</th>
          </tr>
        </thead>
        {transfers.map((t) => (
          <tbody
            key={t.id}
            aria-label={`Transfer #${t.id} to ${t.payee.name}`}
            data-transfer={t.id}
            className="[&>tr>td]:border-b [&>tr>td]:border-border [&>tr>td]:px-3"
          >
            <tr className="bg-muted [&>td]:py-2">
              <td colSpan={2}>
                <h3 className="font-semibold">
                  Transfer #{t.id} · {t.payee.name}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {t.currency}
                  </span>
                </h3>
              </td>
              <td className="text-right font-semibold">
                <Money value={t.amountNok} />
              </td>
              <td className="text-right">
                {t.paidAt ? <ForeignAmount value={t.amountForeign} currency={t.currency} /> : null}
              </td>
              <td className="num text-right">{t.paidAt ? t.fxRate ?? "–" : null}</td>
              <td className="text-right">{t.paidAt ? <Money value={t.bankFee} /> : null}</td>
              <td className="whitespace-nowrap">
                {t.paidAt ? (
                  <Badge tone="success">
                    <CheckIcon />
                    Paid <DateTime value={t.paidAt} />
                  </Badge>
                ) : (
                  <Badge tone="warning">Payment not recorded</Badge>
                )}
              </td>
              <td className="max-w-48">
                {t.paidAt && (
                  <>
                    <span className="block truncate">{t.bankRef ?? "–"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.paidBy === "external" ? "External payer" : "Foundation"}
                    </span>
                  </>
                )}
              </td>
            </tr>
            {t.lines.map((l) => (
              <tr key={l.id} data-transfer-line={l.id} className="[&>td]:py-1">
                <td className="pl-6">
                  <RecipientLink organizationId={l.organizationId}>
                    {l.organizationName}
                  </RecipientLink>
                </td>
                <td className="text-muted-foreground">{lineLabel(l)}</td>
                <td className="text-right">
                  <Money value={l.amountNok} />
                </td>
                <td colSpan={5} />
              </tr>
            ))}
            {t.paidAt && intermediaries.has(t.payee.id) && (
              <tr className="[&>td]:py-2">
                <td colSpan={8} className="pl-6">
                  <TransferOnward transferId={t.id} payeeId={t.payee.id} />
                </td>
              </tr>
            )}
            <tr className="[&>td]:py-1.5">
              <td colSpan={8} className="pl-6">
                <div className="flex flex-wrap items-start gap-x-6 gap-y-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs text-muted-foreground">Documents</span>
                    <DocumentLinks
                      documents={t.documents}
                      parent={{ transferId: t.id }}
                      what={`transfer #${t.id}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Notes</span>
                      <EditNotesDialog
                        target={{ transferId: t.id }}
                        notes={t.notes}
                        what={`transfer #${t.id}`}
                      />
                    </div>
                    {t.notes && <NotesText notes={t.notes} className="mt-0.5" />}
                  </div>
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
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
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        ))}
      </table>
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
