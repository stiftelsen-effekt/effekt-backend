import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DateInput } from "@/components/ui/date-input";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RecordDialog, textError } from "@/features/settings/record-dialog";
import { osloDay } from "@/lib/dates";
import { formatMoney, formatMoneyInput } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useTRPC } from "@/lib/trpc";
import {
  adjustmentTypeHints,
  adjustmentTypeLabels,
  adjustmentTypes,
  type Adjustment,
  type AdjustmentType,
} from "./model";
import { OrganizationPicker, ProjectPicker } from "./ui";

export type AdjustmentForm = {
  type: AdjustmentType;
  organizationId: number | null;
  projectId: number | null;
  amount: string;
  reason: string;
  effectiveAt: string;
  roundId: string;
  linkedTransferId: string;
  linkedDonationId: string;
  documentRef: string;
};

/** Signed kroner: "-1500", "249,50", "1 000". Null if it isn't an amount. */
export function parseSignedMoney(text: string): string | null {
  const cleaned = text.replace(/[\s  ]|kr$/gi, "").replace(/^−/, "-");
  const match = /^([+-])?(\d+)(?:[.,](\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const value = `${BigInt(match[2]!)}.${(match[3] ?? "").padEnd(2, "0")}`;
  return match[1] === "-" && value !== "0.00" ? `-${value}` : value;
}

const optionalId = (text: string) => (text.trim() === "" ? null : Number(text.trim()));

export function validateAdjustment(v: AdjustmentForm) {
  const amount = parseSignedMoney(v.amount);
  const idError = (text: string) =>
    text.trim() === "" || /^\d+$/.test(text.trim()) ? undefined : "Enter a number";
  return {
    organizationId: v.organizationId === null ? "Choose a recipient" : undefined,
    amount:
      amount === null
        ? "Enter an amount in kroner, like -1500 or 249,50"
        : amount === "0.00"
        ? "An adjustment can't be 0"
        : v.type === "fronted" && amount.startsWith("-")
        ? "A fronted amount is positive"
        : undefined,
    reason: textError(v.reason, { label: "a reason", max: 5000, required: true }),
    effectiveAt: v.effectiveAt ? undefined : "Enter the date it counts from",
    linkedTransferId:
      idError(v.linkedTransferId) ??
      (v.type === "correction" && v.linkedTransferId.trim() === ""
        ? "Link the paid transfer this corrects"
        : undefined),
    linkedDonationId: idError(v.linkedDonationId),
    documentRef: textError(v.documentRef, { label: "the document reference", max: 512 }),
  };
}

export function toAdjustmentInput(v: AdjustmentForm) {
  return {
    type: v.type,
    organizationId: v.organizationId!,
    projectId: v.projectId,
    amount: Number(parseSignedMoney(v.amount)!),
    reason: v.reason.trim(),
    effectiveAt: v.effectiveAt,
    roundId: v.roundId ? Number(v.roundId) : null,
    linkedTransferId: v.type === "correction" ? optionalId(v.linkedTransferId) : null,
    linkedDonationId: v.type === "fronted" ? optionalId(v.linkedDonationId) : null,
    documentRef: v.documentRef.trim() || null,
  };
}

export const emptyAdjustment = (patch: Partial<AdjustmentForm> = {}): AdjustmentForm => ({
  type: "correction",
  organizationId: null,
  projectId: null,
  amount: "",
  reason: "",
  effectiveAt: osloDay(),
  roundId: "",
  linkedTransferId: "",
  linkedDonationId: "",
  documentRef: "",
  ...patch,
});

export const adjustmentForm = (a: Adjustment): AdjustmentForm => ({
  type: a.type,
  organizationId: a.organizationId,
  projectId: a.projectId,
  amount: a.amount.startsWith("-")
    ? `-${formatMoneyInput(a.amount.slice(1))}`
    : formatMoneyInput(a.amount),
  reason: a.reason,
  effectiveAt: a.effectiveAt,
  roundId: a.roundId ? String(a.roundId) : "",
  linkedTransferId: a.linkedTransferId ? String(a.linkedTransferId) : "",
  linkedDonationId: a.linkedDonationId ? String(a.linkedDonationId) : "",
  documentRef: a.documentRef ?? "",
});

/** Create (or, with `adjustment`, edit) an adjustment of any type. */
export function AdjustmentDialog({
  trigger,
  initial,
  adjustment,
  title,
}: {
  trigger: ReactNode;
  initial?: Partial<AdjustmentForm>;
  adjustment?: Adjustment;
  title?: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const create = useMutation(trpc.regranting.adjustments.create.mutationOptions());
  const update = useMutation(trpc.regranting.adjustments.update.mutationOptions());
  const drafts = useQuery(trpc.regranting.rounds.list.queryOptions({ statuses: ["draft"] }));

  return (
    <RecordDialog<AdjustmentForm>
      trigger={trigger}
      title={title ?? (adjustment ? `Edit adjustment #${adjustment.id}` : "New adjustment")}
      description="A signed ledger entry with a reason. It counts in the recipient's balance from its date (fronted entries are records only)."
      contentClassName="sm:max-w-xl"
      initial={() => (adjustment ? adjustmentForm(adjustment) : emptyAdjustment(initial))}
      validate={validateAdjustment}
      saveLabel={adjustment ? "Save adjustment" : "Add adjustment"}
      onSave={async (v) => {
        const input = toAdjustmentInput(v);
        if (adjustment) await update.mutateAsync({ id: adjustment.id, ...input });
        else await create.mutateAsync(input);
        await queryClient.invalidateQueries({ queryKey: trpc.regranting.pathKey() });
        notify.success(
          adjustment ? "Adjustment updated" : "Adjustment added",
          `${adjustmentTypeLabels[v.type]} ${formatMoney(input.amount)}`,
        );
      }}
    >
      {({ values, set, errors }) => (
        <>
          <Field label="Type" required hint={adjustmentTypeHints[values.type]}>
            <Select
              value={values.type}
              onValueChange={(type) => set({ type: type as AdjustmentType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {adjustmentTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {adjustmentTypeLabels[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Recipient" required error={errors.organizationId}>
              <OrganizationPicker
                value={values.organizationId}
                onValueChange={(organizationId) => set({ organizationId, projectId: null })}
              />
            </Field>
            <Field label="Project">
              <ProjectPicker
                organizationId={values.organizationId}
                value={values.projectId}
                onValueChange={(projectId) => set({ projectId })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Amount"
              required
              error={errors.amount}
              hint={
                values.type === "fronted" ? "The amount paid ahead" : "Negative lowers the balance"
              }
            >
              <Input
                inputMode="decimal"
                className="num"
                value={values.amount}
                onChange={(e) => set({ amount: e.target.value })}
              />
            </Field>
            <Field label="Counts from" required error={errors.effectiveAt}>
              <DateInput
                value={values.effectiveAt}
                onValueChange={(effectiveAt) => set({ effectiveAt })}
              />
            </Field>
          </div>
          <Field label="Reason" required error={errors.reason}>
            <Textarea value={values.reason} onChange={(e) => set({ reason: e.target.value })} />
          </Field>
          {values.type === "correction" && (
            <Field
              label="Corrects transfer"
              required
              error={errors.linkedTransferId}
              hint="The ID of the paid transfer this fixes"
            >
              <Input
                inputMode="numeric"
                className="num w-40"
                value={values.linkedTransferId}
                onChange={(e) => set({ linkedTransferId: e.target.value })}
              />
            </Field>
          )}
          {values.type === "fronted" && (
            <Field
              label="Expected donation"
              error={errors.linkedDonationId}
              hint="Leave empty until the donation is registered; link it later"
            >
              <Input
                inputMode="numeric"
                className="num w-40"
                value={values.linkedDonationId}
                onChange={(e) => set({ linkedDonationId: e.target.value })}
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="In draft round" hint="Optional: decided as part of a later round">
              <Select
                value={values.roundId || "none"}
                onValueChange={(roundId) => set({ roundId: roundId === "none" ? "" : roundId })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No round</SelectItem>
                  {(drafts.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Document (bilag)" error={errors.documentRef}>
              <Input
                value={values.documentRef}
                onChange={(e) => set({ documentRef: e.target.value })}
              />
            </Field>
          </div>
        </>
      )}
    </RecordDialog>
  );
}
