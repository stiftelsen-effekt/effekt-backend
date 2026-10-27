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
import type { DataOwner, PaymentMethod } from "./api";

export type DonationFieldValues = {
  sum: string;
  transactionCost?: string;
  date: string;
  time: string;
  paymentId: string;
  externalRef: string;
  ownerId: string;
};
type Key = keyof DonationFieldValues;
export type DonationFieldErrors = Partial<
  Record<
    "sum" | "transactionCost" | "timestamp" | "paymentId" | "externalRef" | "ownerId",
    ReactNode
  >
>;

/** An amount in kroner: decimal keyboard, tabular digits, "kr" suffix. */
export function MoneyInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={className ?? "relative"}>
      <Input
        value={value}
        inputMode="decimal"
        autoComplete="off"
        className="num pr-8 text-right"
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
        kr
      </span>
    </div>
  );
}

/**
 * The payment facts of a donation, shared by editing a donation and registering one: amount,
 * (fee), date and time, method, external reference, data owner.
 */
export function DonationFields({
  values,
  onChange,
  errors,
  paymentMethods,
  owners,
  showTransactionCost = false,
  externalRefHint,
}: {
  values: DonationFieldValues;
  onChange: (key: Key, value: string) => void;
  errors: DonationFieldErrors;
  paymentMethods: PaymentMethod[];
  owners: DataOwner[];
  showTransactionCost?: boolean;
  externalRefHint?: ReactNode;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Amount" error={errors.sum} required>
        <MoneyInput value={values.sum} onChange={(value) => onChange("sum", value)} />
      </Field>
      {showTransactionCost && (
        <Field
          label="Fee"
          hint="Transaction cost charged by the payment provider."
          error={errors.transactionCost}
        >
          <MoneyInput
            value={values.transactionCost ?? ""}
            onChange={(value) => onChange("transactionCost", value)}
          />
        </Field>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
        <Field label="Payment date" error={errors.timestamp} required>
          <DateInput value={values.date} onValueChange={(value) => onChange("date", value)} />
        </Field>
        <Field label="Time">
          <Input
            type="time"
            value={values.time}
            className="num"
            onChange={(event) => onChange("time", event.target.value)}
          />
        </Field>
      </div>
      <Field label="Payment method" error={errors.paymentId} required>
        <Select value={values.paymentId} onValueChange={(value) => onChange("paymentId", value)}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a method" />
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
      <Field
        label="External reference"
        hint={
          externalRefHint ??
          "The provider's transaction id. A reference can only be registered once."
        }
        error={errors.externalRef}
      >
        <Input
          value={values.externalRef}
          maxLength={32}
          autoComplete="off"
          className="num"
          onChange={(event) => onChange("externalRef", event.target.value)}
        />
      </Field>
      <Field label="Data owner" error={errors.ownerId} required>
        <Select value={values.ownerId} onValueChange={(value) => onChange("ownerId", value)}>
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
    </div>
  );
}
