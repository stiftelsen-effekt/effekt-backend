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
      if (pattern.test(error.message)) {
        return { fields: { [field]: plainMessage(error.message) } as never };
      }
    }
  }
  const info = describeError(error);
  return { fields, form: { title: info.title, hint: info.hint } };
}

/** Server messages that are about the ssn / organization number field. */
export const ssnMessage = /ssn|organization number|fnr/i;
export const emailMessage = /email/i;

/** The API's message for an email that already belongs to a donor. */
export const isDuplicateEmail = (message: string | undefined) =>
  Boolean(message && /already (exists|belongs|in use)|duplicate/i.test(message));

/** The donor a CONFLICT is about: the API ends the message with "(donor <id>)". */
export function conflictingDonorId(message: string | undefined): number | null {
  // "… (donor 12)" as the API writes it, or "… donor #12." as plainMessage rewrites it
  const match = message ? /\(?donor #?(\d+)\)?\.?$/.exec(message.trim()) : null;
  return match ? Number(match[1]) : null;
}

/**
 * Service messages written for developers, in the person's terms. Unknown messages are
 * returned as they are (DESIGN.md › Writing: server validation is shown as written).
 */
export function plainMessage(message: string): string {
  if (/failed fnr validation/i.test(message))
    return "That isn't a valid fødselsnummer: the check digits or the birth date don't add up. Check the 11 digits.";
  if (/organization number \(failed checksum\)/i.test(message))
    return "That isn't a valid organization number: the check digit doesn't add up. Check the 9 digits.";
  if (/expected 11 digit/i.test(message))
    return "Enter an 11-digit fødselsnummer or a 9-digit organization number, digits only.";
  if (/^email already exists$/i.test(message.trim()))
    return "A donor with this email already exists.";
  const donorId = conflictingDonorId(message);
  if (donorId !== null && /email/i.test(message))
    return `This email already belongs to donor #${donorId}.`;
  return message;
}
