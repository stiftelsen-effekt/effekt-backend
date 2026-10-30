import { z } from "zod";

/**
 * Request body schemas for public REST routes (the donation widget, the fundraiser widget).
 * They check the types of the fields that reach the database and keep any other fields as
 * they are (looseObject), so the payloads the widgets send today keep working.
 */

/** A positive integer id, also accepted as a string of digits (the fundraiser widget sends one) */
const idLike = z.union([
  z.number().int().positive(),
  z
    .string()
    .regex(/^\d{1,10}$/)
    .transform(Number),
]);

/**
 * A non-negative decimal string such as "33.333333333333" (what the widgets send). Numbers are
 * accepted too and turned into strings, the type the distribution code works with.
 */
const shareLike = z.union([
  z.string().regex(/^\d+(\.\d+)?$/, "Invalid percentage share"),
  z.number().finite().min(0).transform(String),
]);

/** A positive amount, as a number or a decimal string */
const amountLike = z.union([
  z.number().finite().positive(),
  z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount"),
]);

const optionalText = z.string().max(1000).nullish();

const distributionOrganizationSchema = z.looseObject({
  id: idLike,
  percentageShare: shareLike,
});

const distributionCauseAreaSchema = z.looseObject({
  id: idLike,
  percentageShare: shareLike,
  standardSplit: z.boolean().default(false),
  organizations: z.array(distributionOrganizationSchema).max(100),
});

export const registerDonationSchema = z.looseObject({
  distributionCauseAreas: z
    .array(distributionCauseAreaSchema)
    .min(1, "No cause areas provided")
    .max(50),
  donor: z.looseObject({
    email: z.string().min(1, "Invalid donor data").max(320),
    name: z.string().max(255).nullish(),
    newsletter: z
      .union([z.boolean(), z.literal(0).transform(() => false), z.literal(1).transform(() => true)])
      .nullish(),
    ssn: z.union([z.string().max(32), z.number().int().nonnegative().transform(String)]).nullish(),
  }),
  method: z.union([
    z.number().int().positive(),
    z
      .string()
      .regex(/^\d{1,3}$/)
      .transform(Number),
  ]),
  recurring: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
  amount: amountLike,
  fundraiser: z
    .looseObject({
      id: idLike,
      message: z.string().max(20000).nullish(),
      messageSenderName: optionalText,
      showName: z.boolean(),
    })
    .nullish(),
  referralCode: z.unknown().optional(),
});

export type RegisterDonationBody = z.infer<typeof registerDonationSchema>;

const numberRange = z.strictObject({
  from: z.number().finite().optional(),
  to: z.number().finite().optional(),
});

const dateLike = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .transform((value) => new Date(value));

const dateRange = z.strictObject({
  from: dateLike.optional(),
  to: dateLike.optional(),
});

export const fundraiserListSchema = z.object({
  pagination: z.strictObject({
    page: z.number().int().min(0),
    limit: z.number().int().positive().max(1000),
    sort: z.strictObject({ id: z.string().max(64), desc: z.boolean() }).nullish(),
  }),
  filter: z
    .strictObject({
      fundraiserId: z.number().int().positive().optional(),
      donor: z.string().max(255).optional(),
      registrationDate: dateRange.optional(),
      donationCount: numberRange.optional(),
      donationSum: numberRange.optional(),
      organizationIDs: z.array(z.number().int().positive()).max(1000).optional(),
    })
    .nullish(),
});

/** A short summary of what failed, without echoing the input */
export const describeIssues = (error: z.ZodError) =>
  error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
