import { z } from "zod";
import { TaxUnitType } from "../../custom_modules/DAO_modules/donations";
import { idSchema, isoDateOrDateTimeSchema, sortSchema } from "./common";

export const donationFilterSchema = z.strictObject({
  sum: z.strictObject({ from: z.number().optional(), to: z.number().optional() }).optional(),
  /**
   * Inclusive. A date (YYYY-MM-DD) means the whole Europe/Oslo day; a date-time with offset is
   * the exact instant.
   */
  date: z
    .strictObject({
      from: isoDateOrDateTimeSchema.optional(),
      to: isoDateOrDateTimeSchema.optional(),
    })
    .optional(),
  KID: z.string().optional(),
  paymentMethodIDs: z.array(idSchema).optional(),
  taxUnitTypes: z.array(z.enum(TaxUnitType).nullable()).optional(),
  donor: z.string().optional(),
  id: z.string().optional(),
  fundraiserId: z.string().optional(),
  organizationIDs: z.array(idSchema).optional(),
  dataOwnerIDs: z.array(idSchema).optional(),
});

export const donationSortSchema = sortSchema([
  "id",
  "donor",
  "paymentMethod",
  "sum",
  "transactionCost",
  "kid",
  "timestamp",
  "taxUnitType",
]);

export const distributionFilterSchema = z.strictObject({
  KID: z.string().optional(),
  donor: z.string().optional(),
});

export const distributionSortSchema = sortSchema(["KID", "full_name", "email", "sum", "count"]);

/** Donations.PaymentExternal_ID is varchar(32) */
export const paymentExternalRefSchema = z.string().min(1).max(32);

/** Donations.transaction_cost is decimal(16,2) and may be zero */
export const transactionCostSchema = z
  .number()
  .nonnegative()
  .max(99_999_999_999_999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "Amount can have at most two decimals",
  });

/**
 * Donation sum histogram buckets: `fixed` is 5 000 kr wide buckets (as REST, empty buckets
 * skipped); `log` is about `buckets` log-scale buckets with rounded edges, empty ones included.
 */
export const donationHistogramInput = z
  .discriminatedUnion("scale", [
    z.strictObject({ scale: z.literal("fixed") }),
    z.strictObject({
      scale: z.literal("log"),
      buckets: z.number().int().min(5).max(50).default(20),
    }),
  ])
  .optional();
