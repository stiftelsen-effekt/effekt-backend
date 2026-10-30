/**
 * The confirmations for changing an agreement, shared by every provider: amount and charge
 * day (before → after, the new amount in the button), stop (consequences listed) and
 * activate. The provider page passes the mutation; errors stay in the dialog.
 */
import { BanIcon, CalendarIcon, CirclePlayIcon, PencilIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Money } from "@/components/domain/format";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { chargeDayOptions, parseWholeKroner } from "./edits";
import { agreementTypes, describeChargeDay, type AgreementType } from "./model";

export type AgreementSubject = {
  type: AgreementType;
  donorName: string;
  amount: number;
  chargeDay: number;
};

const agreementName = (agreement: AgreementSubject) =>
  `${agreement.donorName ? `${agreement.donorName}'s ` : ""}${
    agreementTypes[agreement.type].label
  } agreement`;

function BeforeAfter({
  label,
  before,
  after,
}: {
  label: string;
  before: ReactNode;
  after: ReactNode;
}) {
  return (
    <span>
      <span className="text-muted-foreground">{label}:</span> <span className="num">{before}</span>{" "}
      → <strong className="num font-semibold">{after}</strong>
    </span>
  );
}

export function ChangeAmountDialog({
  agreement,
  max,
  consequences = [],
  onConfirm,
  disabled,
}: {
  agreement: AgreementSubject;
  /** Largest whole-kroner amount the provider accepts. */
  max: number;
  /** Provider-specific facts, e.g. "Vipps asks the donor to accept the new amount". */
  consequences?: ReactNode[];
  onConfirm: (amount: number) => Promise<unknown>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const amount = parseWholeKroner(text, max);
  const same = amount === agreement.amount;
  const error =
    text.trim() === "" || amount !== null
      ? same
        ? "That's the current amount"
        : undefined
      : `Enter whole kroner between 1 and ${formatMoney(max)}`;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setText("");
      }}
      trigger={
        <Button disabled={disabled}>
          <PencilIcon />
          Change amount…
        </Button>
      }
      title={`Change the monthly amount of ${agreementName(agreement)}?`}
      consequences={[
        <BeforeAfter
          key="amount"
          label="Monthly amount"
          before={<Money value={agreement.amount} />}
          after={amount && !same ? <Money value={amount} /> : "…"}
        />,
        ...consequences,
        "The donor gets an email about the change.",
      ]}
      confirmLabel={amount && !same ? `Change to ${formatMoney(amount)}` : "Change amount"}
      disabled={amount === null || same}
      onConfirm={() => onConfirm(amount!)}
    >
      <Field label="New monthly amount" hint="In whole kroner" error={error}>
        <div className="relative max-w-48">
          <Input
            value={text}
            inputMode="numeric"
            autoComplete="off"
            data-autofocus
            className="num pr-8"
            onChange={(event) => setText(event.target.value)}
          />
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
            kr
          </span>
        </div>
      </Field>
    </ConfirmDialog>
  );
}

export function ChangeChargeDayDialog({
  agreement,
  consequences = [],
  onConfirm,
  disabled,
}: {
  agreement: AgreementSubject;
  consequences?: ReactNode[];
  onConfirm: (chargeDay: number) => Promise<unknown>;
  disabled?: boolean;
}) {
  const [day, setDay] = useState<string>("");
  const chosen = day === "" ? null : Number(day);
  const same = chosen === agreement.chargeDay;
  return (
    <ConfirmDialog
      onOpenChange={(next) => next && setDay("")}
      trigger={
        <Button disabled={disabled}>
          <CalendarIcon />
          Change charge day…
        </Button>
      }
      title={`Change when ${agreementName(agreement)} is charged?`}
      consequences={[
        <BeforeAfter
          key="day"
          label="Charge day"
          before={describeChargeDay(agreement.chargeDay)}
          after={chosen !== null && !same ? describeChargeDay(chosen) : "…"}
        />,
        ...consequences,
        "The donor gets an email about the change.",
      ]}
      confirmLabel="Change charge day"
      disabled={chosen === null || same}
      onConfirm={() => onConfirm(chosen!)}
    >
      <Field label="New charge day" error={same ? "That's the current charge day" : undefined}>
        <Select value={day} onValueChange={setDay}>
          <SelectTrigger className="max-w-64">
            <SelectValue placeholder="Choose a day" />
          </SelectTrigger>
          <SelectContent>
            {chargeDayOptions.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </ConfirmDialog>
  );
}

export function StopAgreementDialog({
  agreement,
  consequences = [],
  onConfirm,
  size,
}: {
  agreement: AgreementSubject;
  consequences?: ReactNode[];
  onConfirm: () => Promise<unknown>;
  size?: "sm";
}) {
  return (
    <ConfirmDialog
      tone="danger"
      trigger={
        <Button size={size}>
          <BanIcon />
          Stop agreement…
        </Button>
      }
      title={`Stop ${agreementName(agreement)}?`}
      consequences={[
        <>
          No more charges of <Money value={agreement.amount} className="font-semibold" /> a month.
        </>,
        ...consequences,
        "The donor gets an email confirming the cancellation.",
        "Donations already registered are kept.",
      ]}
      confirmLabel="Stop agreement"
      onConfirm={onConfirm}
    />
  );
}

export function ActivateAgreementDialog({
  agreement,
  consequences = [],
  onConfirm,
}: {
  agreement: AgreementSubject;
  consequences?: ReactNode[];
  onConfirm: () => Promise<unknown>;
}) {
  return (
    <ConfirmDialog
      trigger={
        <Button>
          <CirclePlayIcon />
          Activate…
        </Button>
      }
      title={`Activate ${agreementName(agreement)}?`}
      consequences={[
        <>
          The donor is charged <Money value={agreement.amount} className="font-semibold" /> on the{" "}
          {describeChargeDay(agreement.chargeDay).toLowerCase()}, from the next claim.
        </>,
        ...consequences,
      ]}
      confirmLabel={`Activate ${formatMoney(agreement.amount)} a month`}
      onConfirm={onConfirm}
    />
  );
}
