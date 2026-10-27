/**
 * Registering one donation by hand: the form draft, its validation, and the
 * donations.register input (on an existing KID, or on a new distribution).
 */
import { draftToApi, validateDraft, type DistributionDraft } from "@/features/distribution/model";
import { compareMoney } from "@/lib/money";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";
import { fromDateTimeInputs, moneyToApi, parseMoneyInput } from "./form";

export type RegisterInput = RouterInputs["donations"]["register"];
export type RegisterResult = RouterOutputs["donations"]["register"];

export type RegisterDraft = {
  mode: "kid" | "distribution";
  KID: string;
  donorId: number | null;
  /** "" = no tax unit */
  taxUnitId: string;
  /** Null until the cause area config has loaded. */
  distribution: DistributionDraft | null;
  sum: string;
  date: string;
  time: string;
  paymentId: string;
  externalRef: string;
  ownerId: string;
  sendReceipt: boolean;
};

export type RegisterField =
  | "KID"
  | "donorId"
  | "taxUnitId"
  | "distribution"
  | "sum"
  | "timestamp"
  | "paymentId"
  | "externalRef"
  | "ownerId";

/** API input keys → form fields, for serverErrors. */
export const registerFieldNames: Record<string, RegisterField> = {
  KID: "KID",
  distribution: "distribution",
  donorId: "donorId",
  taxUnitId: "taxUnitId",
  sum: "sum",
  timestamp: "timestamp",
  paymentId: "paymentId",
  paymentExternalRef: "externalRef",
  metaOwnerId: "ownerId",
};

export function emptyRegisterDraft(defaults: Partial<RegisterDraft> = {}): RegisterDraft {
  return {
    mode: "kid",
    KID: "",
    donorId: null,
    taxUnitId: "",
    distribution: null,
    sum: "",
    date: "",
    time: "",
    paymentId: "",
    externalRef: "",
    ownerId: "",
    sendReceipt: true,
    ...defaults,
  };
}

export function validateRegister(draft: RegisterDraft) {
  const sum = parseMoneyInput(draft.sum);
  const errors: Partial<Record<RegisterField, string>> = {};
  if (draft.mode === "kid") {
    if (!/^\d{1,32}$/.test(draft.KID.trim())) errors.KID = "Enter the KID (digits only)";
  } else {
    if (draft.donorId == null) errors.donorId = "Choose the donor";
    if (!draft.distribution || !validateDraft(draft.distribution).valid)
      errors.distribution = "The distribution must add up to 100 %";
  }
  if (sum === null || compareMoney(sum, 0) <= 0) errors.sum = "Enter an amount above 0";
  if (!fromDateTimeInputs(draft.date, draft.time)) errors.timestamp = "Enter the payment date";
  if (!draft.paymentId) errors.paymentId = "Choose the payment method";
  if (draft.externalRef.trim().length > 32) errors.externalRef = "At most 32 characters";
  if (!draft.ownerId) errors.ownerId = "Choose the data owner";
  return errors;
}

/** The donations.register input. Assumes validateRegister passed. */
export function registerInput(draft: RegisterDraft): RegisterInput {
  const target =
    draft.mode === "kid"
      ? { KID: draft.KID.trim() }
      : {
          distribution: {
            donorId: draft.donorId!,
            taxUnitId: draft.taxUnitId ? Number(draft.taxUnitId) : null,
            causeAreas: draftToApi(draft.distribution!),
          },
        };
  return {
    ...target,
    sum: moneyToApi(parseMoneyInput(draft.sum)!),
    timestamp: fromDateTimeInputs(draft.date, draft.time)!,
    paymentId: Number(draft.paymentId),
    paymentExternalRef: draft.externalRef.trim() || null,
    metaOwnerId: Number(draft.ownerId),
    sendReceipt: draft.sendReceipt,
  };
}
