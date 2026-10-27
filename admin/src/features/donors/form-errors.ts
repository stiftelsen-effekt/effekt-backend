import { TRPCClientError } from "@trpc/client";
import { describeError } from "@/components/domain/error-state";

export type FormErrors<F extends string> = {
  fields: Partial<Record<F, string>>;
  /** Anything that doesn't belong to one field; shown above the buttons. */
  form?: { title: string; hint: string };
};

/**
 * Splits a mutation error into messages per field and one for the form. Input validation
 * arrives as `error.data.fieldErrors` (zod); service checks (ssn checksum, email taken) arrive
 * as a message, which `match` assigns to the field it is about.
 */
export function toFormErrors<F extends string>(
  error: unknown,
  match: Partial<Record<F, RegExp>> = {},
): FormErrors<F> {
  const fields: Partial<Record<F, string>> = {};
  if (error instanceof TRPCClientError) {
    const fieldErrors = (error.data as { fieldErrors?: Record<string, string[] | undefined> })
      ?.fieldErrors;
    for (const [field, messages] of Object.entries(fieldErrors ?? {})) {
      if (messages?.[0]) fields[field as F] = messages[0];
    }
    if (Object.keys(fields).length > 0) return { fields };
    for (const [field, pattern] of Object.entries(match) as [F, RegExp][]) {
      if (pattern.test(error.message)) return { fields: { [field]: error.message } as never };
    }
  }
  const info = describeError(error);
  return { fields, form: { title: info.title, hint: info.hint } };
}

/** Server messages that are about the ssn / organization number field. */
export const ssnMessage = /ssn|personnummer|organisationsnummer|organization number|fnr/i;
export const emailMessage = /email/i;
