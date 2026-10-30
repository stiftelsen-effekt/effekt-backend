import { z } from "zod";
import { intentSortColumns, intentStatuses } from "../../custom_modules/DAO_modules/paymentIntents";
import { idSchema, isoDateSchema, paginationFields, sortSchema } from "./common";

export const intentStatusSchema = z.enum(intentStatuses);

/** Days after which an unpaid intent counts as expired instead of awaiting */
export const awaitingDaysSchema = z.number().int().min(1).max(365);

/** KIDs are digits, at most VARCHAR(20) */
const kidSchema = z
  .string()
  .trim()
  .regex(/^\d{1,20}$/, "KID must be digits");

export const intentsFilter = z.strictObject({
  statuses: z.array(intentStatusSchema).min(1).optional(),
  /** Payment ids, e.g. 2 bank, 7 AvtaleGiro, 6 Vipps, 8 Vipps recurring */
  methodIds: z.array(idSchema).min(1).max(50).optional(),
  /** Whole Oslo days, `to` inclusive */
  created: z
    .strictObject({ from: isoDateSchema.optional(), to: isoDateSchema.optional() })
    .optional(),
  /** Only donors with no donation before the intent's day */
  newDonorsOnly: z.boolean().optional(),
  donorId: idSchema.optional(),
  KID: kidSchema.optional(),
  /** Partial match on the donor's name or email */
  donor: z.string().trim().min(1).max(255).optional(),
});

export const intentsListInput = z.strictObject({
  ...paginationFields,
  sort: sortSchema(intentSortColumns).optional(),
  filter: intentsFilter.optional(),
  awaitingDays: awaitingDaysSchema.optional(),
});

export const intentsForDonorInput = z.strictObject({
  donorId: idSchema,
  awaitingDays: awaitingDaysSchema.optional(),
});

export const intentsAttentionInput = z
  .strictObject({
    /** How far back to look, in days */
    days: z.number().int().min(1).max(365).optional(),
  })
  .optional();
