/**
 * Input and output schemas of the Min Side procedures (routers/minside.ts).
 *
 * apps/web imports this file at runtime (through @effekt/api/minside): the Danish site has no tRPC
 * backend, so its REST link validates REST responses with these same output schemas. Keep this
 * file free of backend imports; it may only import zod. src/__test__/trpc.minside.spec.ts checks.
 */
import { z } from "zod";

/** A donor id, as in the REST routes' integer `:id` param */
export const donorIdSchema = z.number().int().positive();

export const donorInput = z.strictObject({ donorId: donorIdSchema });

/**
 * The backend returns dates as Date objects, which JSON sends as ISO strings; REST and tRPC
 * responses arrive as strings. Accept both and always output the ISO string.
 */
const isoDateTime = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));

/** GET /donors/:id (Min Side profile). Undeclared fields, such as `trash`, are stripped. */
export const donorProfileOutput = z.object({
  // The Danish backend answers with 0: it identifies the donor by the token's email claim
  id: z.number().int().nonnegative(),
  name: z.string().nullable(),
  email: z.string(),
  newsletter: z.boolean(),
  registered: isoDateTime,
});

export type DonorProfile = z.output<typeof donorProfileOutput>;

/**
 * Decimal amounts. Our backend sends MySQL DECIMAL columns as strings ("500.00"); the Danish
 * backend sends numbers. Min Side parses both, so both pass through unchanged.
 */
const decimal = z.union([z.string(), z.number()]);

/** GET /donors/:id/taxunits (Min Side tax units). NO and SV use our backend; the default is NO. */
export const taxUnitsInput = donorInput.extend({ locale: z.enum(["NO", "SV"]).optional() });

export const taxUnitOutput = z.object({
  // The Danish backend numbers the donor's tax units 1, 2, …; donorId is 0 there
  id: z.number().int().nonnegative(),
  donorId: z.number().int().nonnegative(),
  name: z.string(),
  ssn: z.string(),
  registered: isoDateTime.nullable(),
  archived: isoDateTime.nullable(),
  sumDonations: decimal,
  // A COUNT(*) on the Danish backend, which its Postgres driver sends as a string
  numDonations: z.union([z.number(), z.string()]),
  taxDeductions: z
    .array(
      z.object({
        year: z.number(),
        sumDonations: z.number(),
        deduction: z.number(),
        benefit: z.number(),
      }),
    )
    .optional(),
});

export const taxUnitsOutput = z.array(taxUnitOutput);

/**
 * GET /donors/:id/donations/aggregated: the donor's donations per organization and year. Rows
 * whose distribution has no organization come back with nulls, as from REST.
 */
export const donationsAggregatedOutput = z.array(
  z.object({
    organization: z.string().nullable(),
    // Only our backend sends it; Min Side doesn't read it, but it's in the web's type
    abbriv: z.string().nullable().optional(),
    value: decimal.nullable(),
    year: z.number(),
  }),
);

/** One entry of a Danish donation's impact (only the Danish backend sends `impact`) */
const donationImpactEntry = z.object({
  recipient: z.string(),
  unit: z.string().nullable(),
  organization: z.string().nullable(),
  amount: z.number(),
  count: z.number().nullable(),
});

/**
 * GET /donors/:id/donations. Every field is kept: the Min Side donation table's columns are
 * configured in Sanity and can show any of them.
 */
export const donationsOutput = z.array(
  z.object({
    id: z.number().int(),
    KID: z.string(),
    donor: z.string().nullable(),
    donorId: z.number().int().nonnegative(),
    email: z.string().nullable(),
    sum: decimal,
    transactionCost: decimal.nullable(),
    timestamp: isoDateTime,
    paymentMethod: z.string(),
    taxUnitId: z.number().int().nullable(),
    // Only our backend sends metaOwnerId, only the Danish backend sends impact
    metaOwnerId: z.number().int().optional(),
    impact: z.array(donationImpactEntry).optional(),
  }),
);

/**
 * GET /donors/:id/distributions/?kids=…: the donor's distributions, only those with the given
 * KIDs when `kids` is set (REST: a comma separated query parameter).
 */
export const distributionsInput = donorInput.extend({
  kids: z.array(z.string().min(1).max(64)).max(5000).optional(),
});

export const distributionsOutput = z.array(
  z.object({
    kid: z.string(),
    donorId: z.number().int().nonnegative(),
    taxUnitId: z.number().int().nullable(),
    causeAreas: z.array(
      z.object({
        id: z.number().int(),
        name: z.string().optional(),
        standardSplit: z.boolean(),
        percentageShare: decimal,
        // Only the Danish backend sends amounts
        amount: z.number().optional(),
        organizations: z.array(
          z.object({
            id: z.number().int(),
            name: z.string().optional(),
            percentageShare: decimal,
            amount: z.number().optional(),
          }),
        ),
      }),
    ),
  }),
);

/*
 * Recurring agreements (Norwegian Min Side's agreements page). Only the fields Min Side reads are
 * declared; the Danish site lists its own agreements (GET /donors/:id/recurring), so these three
 * have no Danish REST route.
 */

/** GET /donors/:id/recurring/vipps */
export const vippsAgreementsOutput = z.array(
  z.object({
    // Vipps' agreement id, such as "agr_5kSeqz"
    ID: z.string(),
    status: z.string().nullable(),
    KID: z.string(),
    // Whole kroner
    amount: z.number(),
    monthly_charge_day: z.number().int(),
    timestamp_created: isoDateTime.nullable(),
  }),
);

/** GET /donors/:id/recurring/avtalegiro */
export const avtaleGiroAgreementsOutput = z.array(
  z.object({
    ID: z.number().int(),
    // MySQL TINYINT: 1 or 0
    active: z.number().int(),
    // Whole kroner (ROUND(amount / 100) in SQL, a DECIMAL)
    amount: decimal,
    KID: z.string(),
    payment_date: z.number().int(),
    created: isoDateTime.nullable(),
    cancelled: isoDateTime.nullable(),
  }),
);

/** GET /donors/:id/recurring/autogiro */
export const autoGiroAgreementsOutput = z.array(
  z.object({
    ID: z.number().int(),
    active: z.boolean(),
    amount: decimal,
    KID: z.string(),
    payment_date: z.number().int(),
    created: isoDateTime.nullable(),
    cancelled: isoDateTime.nullable(),
  }),
);

/**
 * GET /donors/:id/taxreports: one report per year, from the previous year down to 2022, computed
 * by the backend with the Norwegian (default) or Swedish deduction rules. No Danish REST route.
 */
export const taxReportsInput = donorInput.extend({ locale: z.enum(["NO", "SV"]).optional() });

const taxReportChannel = z.object({ channel: z.string(), sumDonations: z.number() });

export const taxReportsOutput = z.array(
  z.object({
    year: z.number().int(),
    units: z.array(
      z.object({
        id: z.number().int(),
        name: z.string(),
        ssn: z.string(),
        sumDonations: z.number(),
        taxDeduction: z.number(),
        channels: z.array(taxReportChannel),
      }),
    ),
    sumDonations: z.number(),
    sumTaxDeductions: z.number(),
    sumDonationsWithoutTaxUnit: z.object({
      sumDonations: z.number(),
      channels: z.array(taxReportChannel),
    }),
    sumNonDeductibleDonationsByType: z.array(
      z.object({ type: z.string(), sumNonDeductibleDonations: z.number() }),
    ),
  }),
);

export type TaxUnit = z.output<typeof taxUnitOutput>;
export type DonationsAggregated = z.output<typeof donationsAggregatedOutput>;
export type Donations = z.output<typeof donationsOutput>;
export type Distributions = z.output<typeof distributionsOutput>;
export type VippsAgreements = z.output<typeof vippsAgreementsOutput>;
export type AvtaleGiroAgreements = z.output<typeof avtaleGiroAgreementsOutput>;
export type AutoGiroAgreements = z.output<typeof autoGiroAgreementsOutput>;
export type TaxReports = z.output<typeof taxReportsOutput>;
