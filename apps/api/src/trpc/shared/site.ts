import { z } from "zod";

/**
 * Input and output schemas of the public site procedures (routers/site.ts): the results page and
 * teaser, the fundraiser pages and the lifetime value estimate. Shared with apps/web through
 * `@effekt/api/site`. On the Danish site the REST link validates the Danish backend's responses
 * with these too, so they accept what both backends send: ours sends MySQL decimals as strings
 * ("375.00"), the Danish one numbers. This file may only import zod.
 */

/** A decimal amount: a number, or a MySQL DECIMAL string. Passed on unchanged. */
const decimal = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]);

/**
 * Dates: our backend has Date objects (DATE/DATETIME columns), which JSON sends as ISO strings;
 * the Danish backend sends ISO strings. Always outputs the ISO string.
 */
const isoDateTime = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));

/** site.resultsHeadline (REST GET /results/headline). Null when there are no figures yet. */
export const siteResultsHeadlineOutput = z
  .object({
    totalDonationsToRecommendedOrgs: decimal,
    numberOfDonors: decimal,
    lastUpdated: isoDateTime,
  })
  .nullable();

/** site.dailyDonations (REST GET /results/donations/daily): the sum donated per day */
export const siteDailyDonationsOutput = z.array(z.object({ date: isoDateTime, sum: decimal }));

/** The yearly referral figures the results page charts (EffektAnalysisDB.OP_ref_data) */
const referralSumFields = [
  "Num_Donors",
  "Total_sum",
  "Num_Donors_ref",
  "Total_sum_ref",
  "Num_Donors_EA_ref",
  "Total_sum_EA_ref",
  "Median_yearly_ds_EA_ref",
  "Avg_yearly_ds_EA_ref",
  "Max_yearly_ds_EA_ref",
  "Num_Donors_ac_ref",
  "Total_sum_ac_ref",
  "Num_Donors_some_ref",
  "Total_sum_some_ref",
  "Num_Donors_pod_ref",
  "Total_sum_pod_ref",
  "Num_Donors_tvr_ref",
  "Total_sum_tvr_ref",
  "Num_Donors_news_ref",
  "Total_sum_news_ref",
  "Num_Donors_web_ref",
  "Total_sum_web_ref",
  "Num_Donors_oth_ref",
  "Total_sum_oth_ref",
] as const;

/** site.referralSums (REST GET /results/referrals/sums): one row per year */
export const siteReferralSumsOutput = z.array(
  z.object({
    Year: z.number().int(),
    ...(Object.fromEntries(referralSumFields.map((field) => [field, decimal.nullable()])) as {
      [K in (typeof referralSumFields)[number]]: z.ZodNullable<typeof decimal>;
    }),
    Inserted: isoDateTime.nullish(),
    Updated: isoDateTime.nullish(),
  }),
);

const outputSums = z.object({ sum: z.number(), numberOfOutputs: z.number() });

/** Outputs bought in one period, per organisation (keyed by its abbreviation or name) */
const aggregatedOutputs = z.object({
  period: z.string(),
  numberOfOutputs: z.number(),
  organizations: z.array(
    z.record(z.string(), z.object({ direct: outputSums, smartDistribution: outputSums })),
  ),
});

/** site.monthlyOutputs (REST GET /results/donations/monthly/outputs) */
export const siteMonthlyOutputsOutput = z.array(
  z.object({
    output: z.string(),
    total: aggregatedOutputs,
    monthly: z.array(aggregatedOutputs),
  }),
);

/** site.ltvEstimate (REST GET /ltv/recentestimate): per recurring payment method */
export const siteLtvEstimateOutput = z.array(
  z.object({
    label: z.string(),
    expectedLtv: z.union([
      z.number(),
      z
        .string()
        .regex(/^-?\d+(\.\d+)?$/)
        .transform(Number),
    ]),
    median: z.number().nullable(),
  }),
);

/**
 * site.fundraiser input. Sanity stores a fundraiser's database id as a number or a string of
 * digits, so both are accepted (the REST route parses `:id` with parseInt).
 */
export const siteFundraiserInput = z.strictObject({
  id: z.union([
    z.number().int().positive().max(2147483647),
    z
      .string()
      .regex(/^\d{1,10}$/)
      .transform(Number)
      .pipe(z.number().int().positive().max(2147483647)),
  ]),
});

/**
 * site.fundraiser (REST GET /fundraisers/:id): the totals and gifts shown on a fundraiser page. The
 * Danish backend answers the same shape for its (UUID) fundraiser ids.
 */
export const siteFundraiserOutput = z.object({
  totalSum: z.number(),
  donationCount: z.number().int(),
  transactions: z.array(
    z.object({
      // The Danish backend's transaction ids are UUIDs
      id: z.union([z.number().int(), z.string()]),
      name: z.string().nullable(),
      message: z.string().nullable(),
      amount: z.number(),
      date: isoDateTime,
    }),
  ),
});

export type SiteFundraiser = z.output<typeof siteFundraiserOutput>;

const optionalText = z.string().nullish();

/**
 * site.organizations (REST GET /organizations/all): every organization, inactive ones included, so
 * Min Side can name the recipients of old donations. The Danish backend leaves out or nulls most
 * descriptions; its catalog also has a "Smart fordeling" entry outside any cause area.
 */
export const siteOrganizationsOutput = z.array(
  z.object({
    id: z.number().int(),
    causeAreaId: z.number().int(),
    name: z.string(),
    widgetDisplayName: optionalText,
    widgetContext: optionalText,
    abbreviation: optionalText,
    shortDescription: optionalText,
    longDescription: optionalText,
    informationUrl: optionalText,
    standardShare: z.number().nullish(),
    isActive: z.boolean(),
    ordering: z.number().nullish(),
  }),
);
