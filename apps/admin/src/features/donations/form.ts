/**
 * Form ↔ API helpers shared by the donation edit form, single registration and creating a
 * distribution: money and date inputs, and server errors mapped to the field they are about.
 */
import { TRPCClientError } from "@trpc/client";
import { describeError } from "@/components/domain/error-state";
import { osloDay, osloInstant, osloTime } from "@/lib/dates";
import { compareMoney } from "@/lib/money";
import { errorCode } from "@/lib/trpc";

/**
 * Parses what people type for an amount ("1 234,50", "1234.5", "500 kr") into a canonical
 * decimal string with at most two decimals. Null when it isn't an amount.
 */
export function parseMoneyInput(text: string): string | null {
  const cleaned = text.replace(/[\s  ]|kr$/gi, "");
  if (!/^\d+([.,]\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(/[.,]/);
  return `${BigInt(whole!)}.${fraction.padEnd(2, "0")}`;
}

/**
 * Why an amount field can't be used, or undefined when it's a positive amount. Comma or point
 * as decimal sign, at most two decimals (the database stores øre).
 */
export function moneyInputError(text: string): string | undefined {
  if (text.trim() === "") return "Enter the amount";
  const value = parseMoneyInput(text);
  if (value === null) return "Enter the amount in kroner with at most two decimals, like 1250,50";
  if (compareMoney(value, 0) <= 0) return "Enter an amount above 0";
  return undefined;
}

/** The API takes amounts as numbers; a canonical two-decimal string converts exactly. */
export const moneyToApi = (decimal: string) => Number(decimal);

/** An instant as the date (YYYY-MM-DD) and time (HH:mm) fields, in Oslo time. */
export function toDateTimeInputs(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return { date: osloDay(date), time: osloTime(date) };
}

/** Date (+ optional time) fields, in Oslo time, back to an ISO instant. Null if invalid. */
export function fromDateTimeInputs(date: string, time: string): string | null {
  return osloInstant(date, time || "00:00")?.toISOString() ?? null;
}

export type ServerErrors<F extends string> = {
  /** Messages for specific fields, shown next to them. */
  fields: Partial<Record<F, string>>;
  /** Anything that isn't about one field, shown above the submit button. */
  general?: { title: string; hint: string };
};

/** Server messages that start with a code ("NO_KID | KID 1 does not exist") lose the code. */
const withoutCode = (message: string) => message.replace(/^[A-Z_]+ \| /, "");

/** Which field a server message is about, for the register / update / create procedures. */
const messageRules: { pattern: RegExp; field: string }[] = [
  {
    pattern: /external reference|ExternalPaymentID|^EXISTING_DONATION/i,
    field: "paymentExternalRef",
  },
  { pattern: /^NO_KID|^KID /, field: "KID" },
  { pattern: /^Payment method/, field: "paymentId" },
  { pattern: /^Data owner/, field: "metaOwnerId" },
  { pattern: /^Tax unit/, field: "taxUnitId" },
  { pattern: /^Donor \d+/, field: "donorId" },
  { pattern: /^(Organization|Cause area|Distribution)/, field: "distribution" },
];

/**
 * Splits a failed mutation into per-field messages and a general one. Uses
 * `error.data.fieldErrors` from input validation where present, otherwise matches the
 * server's message (BAD_REQUEST for invalid references, CONFLICT for duplicates) to a field.
 * `fieldNames` maps API input keys to form field names; unknown keys become general errors.
 */
export function serverErrors<F extends string>(
  error: unknown,
  fieldNames: Partial<Record<string, F>>,
): ServerErrors<F> {
  const fields: Partial<Record<F, string>> = {};
  const general: string[] = [];
  const code = errorCode(error);
  const data =
    error instanceof TRPCClientError
      ? (error.data as { fieldErrors?: Record<string, string[] | undefined> } | undefined)
      : undefined;

  if (data?.fieldErrors && Object.keys(data.fieldErrors).length > 0) {
    for (const [key, messages] of Object.entries(data.fieldErrors)) {
      const field = fieldNames[key];
      const message = messages?.[0];
      if (!message) continue;
      if (field) fields[field] ??= message;
      else general.push(message);
    }
  } else if (code === "BAD_REQUEST" || code === "CONFLICT") {
    const message = error instanceof Error ? error.message : String(error);
    const rule = messageRules.find((r) => r.pattern.test(message));
    const field = rule && fieldNames[rule.field];
    if (field) fields[field] = withoutCode(message);
    else general.push(withoutCode(message));
  } else {
    const info = describeError(error);
    return { fields, general: { title: info.title, hint: info.hint } };
  }

  return {
    fields,
    general: general.length ? { title: "That didn't work", hint: general.join(" ") } : undefined,
  };
}
