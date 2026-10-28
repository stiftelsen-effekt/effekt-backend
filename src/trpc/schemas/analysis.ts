import { z } from "zod";
import { idSchema, isoDateSchema, moneySchema } from "./common";

/**
 * Inputs of the analysis router. Pledges (tilsagn) hold only an amount and dates, never who
 * pledged: the objects are strict, so a field like `name` is rejected rather than stored.
 * Money is a number in kroner with at most two decimals (Pledges.Sum is DECIMAL(16,2)).
 */

const receivedFields = {
  /** The day the money came in; null while the pledge is open */
  receivedDate: isoDateSchema.nullable(),
  /** The donation that fulfilled the pledge. Only on a received pledge. */
  donationId: idSchema.nullable(),
};

/** A donation can only be linked to a received pledge (same rule as parsePledgeInput) */
const donationNeedsReceivedDate = (
  value: { receivedDate?: string | null; donationId?: number | null },
  ctx: z.core.$RefinementCtx,
) => {
  if (value.donationId != null && value.receivedDate == null) {
    ctx.addIssue({
      code: "custom",
      path: ["donationId"],
      message: "A donation can only be linked to a received pledge",
    });
  }
};

export const pledgeCreateInput = z
  .strictObject({
    sum: moneySchema,
    decidedDate: isoDateSchema,
    receivedDate: receivedFields.receivedDate.default(null),
    donationId: receivedFields.donationId.default(null),
  })
  .superRefine(donationNeedsReceivedDate);

/** Changes the amount (e.g. what remains after a partial payment) or the decision date */
export const pledgeUpdateInput = z
  .strictObject({
    id: idSchema,
    sum: moneySchema.optional(),
    decidedDate: isoDateSchema.optional(),
  })
  .refine((value) => value.sum !== undefined || value.decidedDate !== undefined, {
    message: "Nothing to change: give sum or decidedDate",
  });

export const pledgeMarkReceivedInput = z.strictObject({
  id: idSchema,
  receivedDate: isoDateSchema,
  donationId: idSchema.nullable().default(null),
});

export const pledgeByIdInput = z.strictObject({ id: idSchema });
