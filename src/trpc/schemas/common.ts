import { z } from "zod";
import { validateDistribution } from "../../custom_modules/distribution";
import { RequestLocale } from "../../middleware/locale";

export const idSchema = z.number().int().positive();

export const localeSchema = z.enum(RequestLocale).default(RequestLocale.NO);

/** An ISO 8601 date (YYYY-MM-DD) */
export const isoDateSchema = z.iso.date();

/** An ISO 8601 date (YYYY-MM-DD) or date-time with offset */
export const isoDateOrDateTimeSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })], {
  error: "Expected an ISO date (YYYY-MM-DD) or date-time with offset",
});

export const paginationFields = {
  page: z.number().int().min(0),
  limit: z.number().int().positive().max(1000),
};

/** Sort input whose column must be one of the given ids */
export const sortSchema = <const T extends readonly [string, ...string[]]>(ids: T) =>
  z.strictObject({ id: z.enum(ids), desc: z.boolean() });

/** A money amount in kroner with at most two decimals, matching decimal(16,2) columns */
export const moneySchema = z
  .number()
  .positive()
  .max(99_999_999_999_999)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "Amount can have at most two decimals",
  });

const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

/** Like moneySchema, but 0 is allowed */
export const nonNegativeMoneySchema = z
  .number()
  .min(0)
  .max(99_999_999_999_999)
  .refine(twoDecimals, { message: "Amount can have at most two decimals" });

/** A signed, non-zero money amount in kroner with at most two decimals */
export const signedMoneySchema = z
  .number()
  .min(-99_999_999_999_999)
  .max(99_999_999_999_999)
  .refine((value) => value !== 0, { message: "Amount can't be zero" })
  .refine(twoDecimals, { message: "Amount can have at most two decimals" });

/** A non-negative decimal number as a string, e.g. "33.333333333333" */
const percentageShareSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Percentage share must be a non-negative decimal string");

export const distributionCauseAreaSchema = z.strictObject({
  id: idSchema,
  percentageShare: percentageShareSchema,
  standardSplit: z.boolean(),
  organizations: z.array(z.strictObject({ id: idSchema, percentageShare: percentageShareSchema })),
});

/**
 * Runs the same validation the REST routes use (shares sum to 100 at both levels, no
 * duplicate ids, every cause area has organizations), surfacing failures as input errors.
 */
const refineShares = (
  distribution: { causeAreas: z.infer<typeof distributionCauseAreaSchema>[] },
  ctx: z.core.$RefinementCtx,
) => {
  // Share format errors are reported by the field schemas; validating the sums would only add noise
  const shares = distribution.causeAreas.flatMap((c) => [c, ...c.organizations]);
  if (shares.some((share) => !/^\d+(\.\d+)?$/.test(share.percentageShare))) return;
  try {
    // validateDistribution mutates nested arrays, so validate a copy. It also requires a donor
    // id, which a split doesn't have; the placeholder is overridden when there is one.
    validateDistribution(
      structuredClone({ donorId: 1, ...distribution }) as Parameters<
        typeof validateDistribution
      >[0],
    );
  } catch (ex) {
    ctx.addIssue({ code: "custom", message: (ex as Error).message });
  }
};

/** The split of a distribution, without donor (e.g. an agreement's, where the donor is fixed) */
export const distributionSplitSchema = z
  .strictObject({
    taxUnitId: idSchema.nullable(),
    causeAreas: z.array(distributionCauseAreaSchema).min(1),
  })
  .superRefine(refineShares);

/** A distribution without owner, as used when editing a donation's split */
export const distributionSchema = z
  .strictObject({
    donorId: idSchema,
    taxUnitId: idSchema.nullable(),
    causeAreas: z.array(distributionCauseAreaSchema).min(1),
  })
  .superRefine(refineShares);

/** Input for creating a distribution */
export const distributionCreateSchema = z
  .strictObject({
    donorId: idSchema,
    taxUnitId: idSchema.nullable(),
    metaOwnerId: idSchema,
    causeAreas: z.array(distributionCauseAreaSchema).min(1),
  })
  .superRefine(refineShares);

export type DistributionSplitInput = z.infer<typeof distributionSplitSchema>;
export type DistributionInputSchema = z.infer<typeof distributionSchema>;
