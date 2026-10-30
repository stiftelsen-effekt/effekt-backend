import { z } from "zod";
import {
  adjustmentTypes,
  onwardBases,
  onwardKinds,
  paidByValues,
  projectStatuses,
  roundKinds,
  roundStatuses,
} from "../../custom_modules/regranting/types";
import {
  idSchema as id,
  isoDateSchema,
  moneySchema,
  nonNegativeMoneySchema,
  signedMoneySchema,
} from "./common";

/** Inputs of the regranting router. Money is a number in kroner (two decimals max). */

export const roundKindSchema = z.enum(roundKinds);
export const roundStatusSchema = z.enum(roundStatuses);
export const adjustmentTypeSchema = z.enum(adjustmentTypes);
export const projectStatusSchema = z.enum(projectStatuses);
export const paidBySchema = z.enum(paidByValues);

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable();
/** Required free text (reasons, rationales): non-blank */
const reasonText = z.string().trim().min(1, "Required").max(5000);

/** ISO 4217 code, or e.g. BTC */
export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3,8}$/, "Currency must be an upper-case code like NOK, EUR or BTC");

/** Decimal string with up to 8 decimals, e.g. "0.01234567" (foreign amounts, FX rates) */
const preciseDecimal = (integerDigits: number) =>
  z
    .string()
    .regex(
      new RegExp(`^\\d{1,${integerDigits}}(\\.\\d{1,8})?$`),
      `Expected a positive decimal string with at most ${integerDigits} integer digits and 8 decimals`,
    )
    .refine((v) => Number(v) > 0, "Must be greater than 0");

export const byId = z.strictObject({ id });

/**
 * Free-text notes on a round or transfer (calculation errors, held-back amounts, mis-keyed
 * donations): trimmed, blank → null
 */
export const notesSchema = z
  .string()
  .trim()
  .max(5000)
  .nullable()
  .transform((v) => (v ? v : null));

/** Sets or clears (null or blank) the notes of a round or transfer, in any round status */
export const setNotesInput = z.strictObject({ id, notes: notesSchema });

//region Lines

const lineFields = {
  organizationId: id,
  /** null = unrestricted */
  projectId: id.nullable(),
};

const noDuplicateLines = <T extends { organizationId: number; projectId: number | null }>(
  lines: T[],
  ctx: z.core.$RefinementCtx,
) => {
  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.organizationId}:${line.projectId ?? ""}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: "custom",
        message: `Recipient ${line.organizationId}${
          line.projectId ? `, project ${line.projectId}` : " (unrestricted)"
        } appears twice; use one line`,
      });
    }
    seen.add(key);
  }
};

export const transferLineInput = z.strictObject({ ...lineFields, amountNok: moneySchema });
export const transferLinesSchema = z.array(transferLineInput).superRefine(noDuplicateLines);

export const fundGrantLineInput = z.strictObject({ ...lineFields, amount: moneySchema });
export const fundGrantLinesSchema = z
  .array(fundGrantLineInput)
  .min(1)
  .superRefine(noDuplicateLines);

//endregion

//region Balances and statements

export const balancesListInput = z
  .strictObject({
    /** Default: today (Europe/Oslo) */
    at: isoDateSchema.optional(),
    /** Only these recipients */
    organizationIds: z.array(id).min(1).optional(),
  })
  .optional();

export const statementInput = z
  .strictObject({
    organizationId: id,
    from: isoDateSchema,
    /** Default: today (Europe/Oslo) */
    to: isoDateSchema.optional(),
    /** Omit for all; null for unrestricted only; an id for that project */
    projectId: id.nullable().optional(),
  })
  .refine((v) => v.to === undefined || v.to >= v.from, {
    message: "The period ends before it starts",
    path: ["to"],
  });

/** A month, "2026-08" */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected a month like 2026-08");

const monthIndex = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return y! * 12 + m!;
};

export const breakdownInput = z
  .strictObject({
    organizationId: id,
    /** Omit for the recipient (all projects); null for unrestricted only; an id for that project */
    projectId: id.nullable().optional(),
    /** Default: today (Europe/Oslo). With roundId: the round's cutoff (leave it out) */
    at: isoDateSchema.optional(),
    /** The round builder's view: at the round's cutoff, the round's own entries shown separately */
    roundId: id.optional(),
  })
  .refine((v) => v.roundId === undefined || v.at === undefined, {
    message: "With roundId the date is the round's cutoff; leave out at",
    path: ["at"],
  });

export const compositionInput = z.strictObject({
  roundId: id,
  /** Only this recipient's lines */
  organizationId: id.optional(),
  /** With organizationId: only this project's lines (null = unrestricted) */
  projectId: id.nullable().optional(),
});

/** At most five years at a time */
export const reconciliationInput = z
  .strictObject({ from: monthSchema, to: monthSchema })
  .refine((v) => v.to >= v.from, { message: "The period ends before it starts", path: ["to"] })
  .refine((v) => monthIndex(v.to) - monthIndex(v.from) < 60, {
    message: "Check at most 60 months at a time",
    path: ["to"],
  });

//endregion

//region Rounds

export const roundListInput = z
  .strictObject({
    statuses: z.array(roundStatusSchema).min(1).optional(),
    kinds: z.array(roundKindSchema).min(1).optional(),
  })
  .optional();

export const roundCreateInput = z
  .strictObject({
    name: text(255),
    kind: roundKindSchema,
    cutoff: isoDateSchema,
    /** Proposal: a recipient whose total is under this is proposed 0. Default 0. */
    minTransfer: nonNegativeMoneySchema.default(0),
    /** major_donor only (required there): the donations the round passes on */
    donationIds: z.array(id).min(1).max(1000).optional(),
    /** Fill the round with the proposal right away. Default true. */
    propose: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "major_donor" && !v.donationIds) {
      ctx.addIssue({
        code: "custom",
        message: "A major_donor round needs donationIds",
        path: ["donationIds"],
      });
    }
    if (v.kind !== "major_donor" && v.donationIds) {
      ctx.addIssue({
        code: "custom",
        message: "Only major_donor rounds have donations",
        path: ["donationIds"],
      });
    }
  });

export const roundUpdateInput = z.strictObject({
  id,
  name: text(255).optional(),
  cutoff: isoDateSchema.optional(),
  minTransfer: nonNegativeMoneySchema.optional(),
});

export const roundDonationsInput = z.strictObject({
  id,
  donationIds: z.array(id).min(1).max(1000),
});

export const includeDirectInput = z.strictObject({
  roundId: id,
  organizationId: id,
  /** null clears the override (the kind's default applies) */
  includeDirect: z.boolean().nullable(),
  /** Re-propose this recipient's lines afterwards. Default true. */
  propose: z.boolean().default(true),
});

export const earmarkInput = z.strictObject({
  roundId: id,
  organizationId: id,
  /** A project of that recipient */
  projectId: id,
  /** Moved from the recipient's unrestricted balance to the project; at most what is available */
  amount: moneySchema,
  /** Added to the reason, which names the project and the round */
  note: optionalText(1000).optional(),
});

export const removeEarmarkInput = z.strictObject({
  /** Either half of the earmark */
  adjustmentId: id,
});

export const proposeInput = z.strictObject({
  id,
  /** Only re-propose these recipients' lines (all when omitted) */
  organizationIds: z.array(id).min(1).optional(),
});

//endregion

//region Transfers

export const transferCreateInput = z.strictObject({
  roundId: id,
  payeeId: id,
  /** Default: the payee's currency */
  currency: currencySchema.optional(),
  /** Default: none. amount_nok is set to their sum. */
  lines: transferLinesSchema.optional(),
  notes: notesSchema.optional(),
});

export const transferUpdateInput = z.strictObject({
  id,
  payeeId: id.optional(),
  currency: currencySchema.optional(),
  /** Set the bank amount explicitly (validation checks the lines sum to it) */
  amountNok: nonNegativeMoneySchema.optional(),
  notes: notesSchema.optional(),
});

export const transferSetLinesInput = z.strictObject({
  id,
  lines: transferLinesSchema,
  /** Set amount_nok to the lines' sum. Default true. */
  syncAmount: z.boolean().default(true),
});

export const transferSetLineInput = z.strictObject({
  id,
  ...lineFields,
  /** 0 removes the line. amount_nok is set to the lines' sum. */
  amountNok: nonNegativeMoneySchema,
});

export const recordPaymentInput = z.strictObject({
  id,
  paidAt: isoDateSchema,
  /** Default: the transfer's currency */
  currency: currencySchema.optional(),
  /** In `currency`; up to 8 decimals */
  amountForeign: preciseDecimal(16).nullable().default(null),
  /** NOK per unit of `currency`; up to 8 decimals */
  fxRate: preciseDecimal(10).nullable().default(null),
  /** NOK, paid by operations; doesn't reduce the recipient's balance */
  bankFee: nonNegativeMoneySchema.nullable().default(null),
  bankRef: optionalText(255).default(null),
  paidBy: paidBySchema.default("foundation"),
});

//endregion

//region Fund grants

export const fundGrantCreateInput = z.strictObject({
  roundId: id,
  /** The own fund's organization id */
  fundId: id,
  rationale: reasonText,
  lines: fundGrantLinesSchema,
});

export const fundGrantUpdateInput = z.strictObject({
  id,
  rationale: reasonText.optional(),
  lines: fundGrantLinesSchema.optional(),
});

//endregion

//region Adjustments

const adjustmentFields = {
  organizationId: id,
  projectId: id.nullable().default(null),
  /** Signed. fronted: the amount fronted (positive; a record, not counted in the balance) */
  amount: signedMoneySchema,
  type: adjustmentTypeSchema,
  reason: reasonText,
  effectiveAt: isoDateSchema,
  /** A draft round this belongs to, e.g. a correction decided in a later round */
  roundId: id.nullable().default(null),
  /** correction only: the paid transfer it corrects */
  linkedTransferId: id.nullable().default(null),
  /** fronted only: the expected donation (can be linked later with linkDonation) */
  linkedDonationId: id.nullable().default(null),
};

const refineAdjustment = (
  a: {
    type: string;
    amount: number;
    linkedTransferId: number | null;
    linkedDonationId: number | null;
  },
  ctx: z.core.$RefinementCtx,
) => {
  if (a.linkedTransferId !== null && a.type !== "correction") {
    ctx.addIssue({
      code: "custom",
      message: "Only corrections link a transfer",
      path: ["linkedTransferId"],
    });
  }
  if (a.linkedDonationId !== null && a.type !== "fronted") {
    ctx.addIssue({
      code: "custom",
      message: "Only fronted entries link a donation",
      path: ["linkedDonationId"],
    });
  }
  if (a.type === "fronted" && a.amount < 0) {
    ctx.addIssue({ code: "custom", message: "A fronted amount is positive", path: ["amount"] });
  }
};

export const adjustmentCreateInput = z.strictObject(adjustmentFields).superRefine(refineAdjustment);

/** Replaces every field (send the full adjustment) */
export const adjustmentUpdateInput = z
  .strictObject({ id, ...adjustmentFields })
  .superRefine(refineAdjustment);

export const adjustmentListInput = z
  .strictObject({
    organizationId: id.optional(),
    projectId: id.optional(),
    roundId: id.optional(),
    types: z.array(adjustmentTypeSchema).min(1).optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .optional();

export const linkDonationInput = z.strictObject({ id, donationId: id.nullable() });

//endregion

//region Payees and routing

const payeeFields = {
  name: text(255),
  currency: currencySchema.default("NOK"),
  bankAccount: optionalText(64).default(null),
  iban: optionalText(64).default(null),
  swift: optionalText(16).default(null),
  wallet: optionalText(128).default(null),
  /** e.g. "Gi Effektivt {round}" */
  paymentReferenceTemplate: optionalText(255).default(null),
  isActive: z.boolean().default(true),
};

export const payeeCreateInput = z.strictObject(payeeFields);

export const payeeUpdateInput = z.strictObject({
  id,
  name: text(255).optional(),
  currency: currencySchema.optional(),
  bankAccount: optionalText(64).optional(),
  iban: optionalText(64).optional(),
  swift: optionalText(16).optional(),
  wallet: optionalText(128).optional(),
  paymentReferenceTemplate: optionalText(255).optional(),
  isActive: z.boolean().optional(),
});

const validRange = (
  v: { validFrom?: string; validTo?: string | null },
  ctx: z.core.$RefinementCtx,
) => {
  if (v.validFrom && v.validTo && v.validTo < v.validFrom) {
    ctx.addIssue({ code: "custom", message: "Ends before it starts", path: ["validTo"] });
  }
};

export const routingListInput = z
  .strictObject({ organizationId: id.optional(), payeeId: id.optional() })
  .optional();

export const routingCreateInput = z
  .strictObject({
    organizationId: id,
    payeeId: id,
    validFrom: isoDateSchema,
    /** Inclusive; null = open-ended */
    validTo: isoDateSchema.nullable().default(null),
  })
  .superRefine(validRange);

export const routingUpdateInput = z
  .strictObject({
    id,
    organizationId: id.optional(),
    payeeId: id.optional(),
    validFrom: isoDateSchema.optional(),
    validTo: isoDateSchema.nullable().optional(),
  })
  .superRefine(validRange);

//endregion

//region Projects, funds, holds

const projectFields = {
  organizationId: id,
  name: text(255),
  description: optionalText(5000).default(null),
  country: optionalText(64).default(null),
  startDate: isoDateSchema.nullable().default(null),
  endDate: isoDateSchema.nullable().default(null),
  status: projectStatusSchema.default("proposed"),
  agreementRef: optionalText(255).default(null),
  reportDue: isoDateSchema.nullable().default(null),
  documentsUrl: optionalText(512).default(null),
};

export const projectCreateInput = z.strictObject(projectFields);

export const projectUpdateInput = z.strictObject({
  id,
  organizationId: id.optional(),
  name: text(255).optional(),
  description: optionalText(5000).optional(),
  country: optionalText(64).optional(),
  startDate: isoDateSchema.nullable().optional(),
  endDate: isoDateSchema.nullable().optional(),
  status: projectStatusSchema.optional(),
  agreementRef: optionalText(255).optional(),
  reportDue: isoDateSchema.nullable().optional(),
  documentsUrl: optionalText(512).optional(),
});

export const projectListInput = z
  .strictObject({
    organizationId: id.optional(),
    statuses: z.array(projectStatusSchema).min(1).optional(),
  })
  .optional();

const maxHoldDays = z.number().int().positive().max(36500).nullable();

export const fundCreateInput = z.strictObject({
  organizationId: id,
  maxHoldDays: maxHoldDays.default(null),
});

export const fundUpdateInput = z.strictObject({ organizationId: id, maxHoldDays });

export const fundByOrganization = z.strictObject({ organizationId: id });

export const holdListInput = z
  .strictObject({
    /** Only holds active on this day */
    activeAt: isoDateSchema.optional(),
    organizationId: id.optional(),
  })
  .optional();

export const holdCreateInput = z.strictObject({
  organizationId: id,
  /** null = the whole recipient */
  projectId: id.nullable().default(null),
  reason: reasonText,
  /** Active for rounds with cutoff on or before this day; null = until removed */
  until: isoDateSchema.nullable().default(null),
});

export const holdUpdateInput = z.strictObject({
  id,
  projectId: id.nullable().optional(),
  reason: reasonText.optional(),
  until: isoDateSchema.nullable().optional(),
});

//endregion

//region Documents

/** What a document belongs to: exactly one of roundId, transferId, adjustmentId, onwardReportId */
const documentParentFields = {
  roundId: id.optional(),
  transferId: id.optional(),
  adjustmentId: id.optional(),
  onwardReportId: id.optional(),
};

const exactlyOneParent = (
  d: { roundId?: number; transferId?: number; adjustmentId?: number; onwardReportId?: number },
  ctx: z.core.$RefinementCtx,
) => {
  const set = [d.roundId, d.transferId, d.adjustmentId, d.onwardReportId].filter(
    (v) => v !== undefined,
  ).length;
  if (set !== 1) {
    ctx.addIssue({
      code: "custom",
      message: "Give exactly one of roundId, transferId, adjustmentId and onwardReportId",
    });
  }
};

export const documentListInput = z.strictObject(documentParentFields).superRefine(exactlyOneParent);

export const documentAddInput = z
  .strictObject({
    ...documentParentFields,
    /** A link, usually Google Drive */
    url: z
      .string()
      .trim()
      .min(1, "Required")
      .max(1024)
      .refine(
        (v) => /^https?:\/\/\S+$/i.test(v),
        "Must be a link starting with http:// or https://",
      ),
    /** e.g. "Bilag 16-043" */
    label: optionalText(255)
      .default(null)
      .transform((v) => v || null),
  })
  .superRefine(exactlyOneParent);

//endregion

//region Downstream regrants (docs/regranting-downstream.md)

export const onwardKindSchema = z.enum(onwardKinds);
export const onwardBasisSchema = z.enum(onwardBases);

/** Paid dates from, to (inclusive) and one intermediary payee; all optional */
const onwardLineFilterFields = {
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  payeeId: id.optional(),
};

export const onwardTransferInput = z.strictObject({ transferId: id });

export const onwardLineInput = z.strictObject({ transferLineId: id });

export const onwardAwaitingInput = z.strictObject(onwardLineFilterFields).optional();

/**
 * Bulk backfill: an `assumed` allocation for every paid pass-through line to an intermediary
 * payee that has none yet. `dryRun` lists them without writing.
 */
export const onwardAssumeInput = z.strictObject({
  ...onwardLineFilterFields,
  dryRun: z.boolean().default(false),
});

const allocationFields = {
  kind: onwardKindSchema.default("grant"),
  basis: onwardBasisSchema.default("reported"),
  /** grant: one of our recipients… */
  organizationId: id.nullable().default(null),
  /** …or an external grantee */
  externalGranteeId: id.nullable().default(null),
  /** Only with organizationId, a project of it */
  projectId: id.nullable().default(null),
  currency: currencySchema,
  /** As the intermediary reports it */
  amountForeign: preciseDecimal(16).nullable().default(null),
  /** The share of our line in kroner; null = amountForeign × the transfer's fx_rate */
  amountNok: moneySchema.nullable().default(null),
  forwardedAt: isoDateSchema,
  /** Required for basis reported */
  reportId: id.nullable().default(null),
  purpose: optionalText(255)
    .default(null)
    .transform((v) => v || null),
  note: notesSchema.default(null),
};

export const allocationCreateInput = z.strictObject({ transferLineId: id, ...allocationFields });

/** Replaces every field of the allocation; the line stays */
export const allocationUpdateInput = z.strictObject({ id, ...allocationFields });

export const onwardReportListInput = z.strictObject({ payeeId: id.optional() }).optional();

const reportFields = {
  payeeId: id,
  reportedAt: isoDateSchema,
  /** e.g. "GiveWell forwarding statement Q2 2025" */
  reference: optionalText(255)
    .default(null)
    .transform((v) => v || null),
  notes: notesSchema.default(null),
};

export const onwardReportCreateInput = z.strictObject(reportFields);

export const onwardReportUpdateInput = z.strictObject({
  id,
  payeeId: id.optional(),
  reportedAt: isoDateSchema.optional(),
  reference: optionalText(255)
    .transform((v) => v || null)
    .optional(),
  notes: notesSchema.optional(),
});

const granteeFields = {
  name: text(255),
  country: optionalText(64)
    .default(null)
    .transform((v) => v || null),
  url: optionalText(512)
    .default(null)
    .transform((v) => v || null),
  notes: notesSchema.default(null),
};

export const granteeCreateInput = z.strictObject(granteeFields);

export const granteeUpdateInput = z.strictObject({
  id,
  name: text(255).optional(),
  country: optionalText(64)
    .transform((v) => v || null)
    .optional(),
  url: optionalText(512)
    .transform((v) => v || null)
    .optional(),
  notes: notesSchema.optional(),
});

//endregion
