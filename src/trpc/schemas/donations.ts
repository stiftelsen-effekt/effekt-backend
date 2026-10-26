import { z } from "zod";
import { validateDistribution } from "../../custom_modules/distribution";
import { TaxUnitType } from "../../custom_modules/DAO_modules/donations";
import { RequestLocale } from "../../middleware/locale";

export const idSchema = z.number().int().positive();

/** An ISO 8601 date (YYYY-MM-DD) or date-time with offset. */
export const isoDateSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

/** A non-negative decimal number as a string, e.g. "33.333333333333" */
const percentageShareSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Percentage share must be a non-negative decimal string");

const distributionCauseAreaSchema = z.strictObject({
  id: idSchema,
  percentageShare: percentageShareSchema,
  standardSplit: z.boolean(),
  organizations: z.array(
    z.strictObject({
      id: idSchema,
      percentageShare: percentageShareSchema,
    }),
  ),
});

const distributionFields = {
  donorId: idSchema,
  taxUnitId: idSchema.nullable(),
  causeAreas: z.array(distributionCauseAreaSchema).min(1),
};

/**
 * Runs the same validation the REST routes use (shares sum to 100 at both levels, no
 * duplicate ids, every cause area has organizations), surfacing failures as input errors.
 */
const refineDistribution = (
  distribution: z.infer<z.ZodObject<typeof distributionFields>>,
  ctx: z.core.$RefinementCtx,
) => {
  try {
    // validateDistribution mutates nested arrays, so validate a copy
    validateDistribution(structuredClone(distribution));
  } catch (ex) {
    ctx.addIssue({ code: "custom", message: (ex as Error).message });
  }
};

/** A distribution without owner, as used when editing a donation's split. */
export const distributionSchema = z
  .strictObject(distributionFields)
  .superRefine(refineDistribution);

/** Input for creating a distribution. */
export const distributionCreateSchema = z
  .strictObject({ ...distributionFields, metaOwnerId: idSchema })
  .superRefine(refineDistribution);

export const localeSchema = z.enum(RequestLocale).default(RequestLocale.NO);

export const donationFilterSchema = z.strictObject({
  sum: z.strictObject({ from: z.number().optional(), to: z.number().optional() }).optional(),
  date: z.strictObject({ from: isoDateSchema.optional(), to: isoDateSchema.optional() }).optional(),
  KID: z.string().optional(),
  paymentMethodIDs: z.array(idSchema).optional(),
  taxUnitTypes: z.array(z.enum(TaxUnitType).nullable()).optional(),
  donor: z.string().optional(),
  id: z.string().optional(),
  fundraiserId: z.string().optional(),
  organizationIDs: z.array(idSchema).optional(),
  dataOwnerIDs: z.array(idSchema).optional(),
});

export const donationSortSchema = z.strictObject({
  id: z.enum([
    "id",
    "donor",
    "paymentMethod",
    "sum",
    "transactionCost",
    "kid",
    "timestamp",
    "taxUnitType",
  ]),
  desc: z.boolean(),
});

export const distributionFilterSchema = z.strictObject({
  KID: z.string().optional(),
  donor: z.string().optional(),
});

export const distributionSortSchema = z.strictObject({
  id: z.enum(["KID", "full_name", "email", "sum", "count"]),
  desc: z.boolean(),
});

export const paginationFields = {
  page: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
};
