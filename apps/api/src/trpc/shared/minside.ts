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

/*
 * Min Side mutations. Each mirrors a REST route's permission and ownership check; the schemas are
 * at least as strict as the REST validation (the rest, such as the shares summing to 100, is
 * checked by the same backend code REST uses).
 */

/** Whole kroner, as Min Side edits agreement sums */
const wholeKroner = (max: number) => z.number().int().min(1).max(max);

/** A KID: digits only (REST takes it from the path) */
export const kidSchema = z.string().regex(/^\d{1,32}$/, "KID must be 1 to 32 digits");

/** Day of month an agreement is charged: 1-28, or 0 for the last day of the month */
export const chargeDaySchema = z.number().int().min(0).max(28);

/** Mutations without a result answer `true`, as the REST routes' `content` mostly did */
export const mutationOkOutput = z.literal(true);

/** PUT /donors/:id from Min Side: name and newsletter. The email can't be changed there. */
export const updateProfileInput = donorInput.extend({
  // Donors.full_name is a TINYTEXT
  name: z.string().min(1).max(255),
  newsletter: z.boolean().optional(),
});

/**
 * A tax unit's ssn as the REST routes accept it: a fødselsnummer (11 digits, checked with
 * @navikt/fnrvalidator by the procedure), an organisasjonsnummer (9 digits) or, on create only, a
 * Swedish number of 13 characters (YYYYMMDD-NNNN).
 */
const norwegianSsn = z.string().regex(/^(\d{9}|\d{11})$/, "ssn must be 9 or 11 digits");

/** Tax_unit.full_name is a VARCHAR(128) */
const taxUnitName = z.string().min(1).max(128);

/** POST /donors/:id/taxunits */
export const createTaxUnitInput = donorInput.extend({
  name: taxUnitName,
  ssn: z
    .string()
    .regex(/^(\d{9}|\d{11}|\d{8}-\d{4})$/, "ssn must be 9 or 11 digits, or YYYYMMDD-NNNN"),
  locale: z.enum(["NO", "SV"]).optional(),
});

/** PUT /donors/:id/taxunits/:taxunitid: only name and ssn change */
export const updateTaxUnitInput = donorInput.extend({
  taxUnitId: donorIdSchema,
  name: taxUnitName,
  ssn: norwegianSsn,
});

/** DELETE /donors/:id/taxunits/:taxunitid, optionally moving this year's donations to another unit */
export const deleteTaxUnitInput = donorInput.extend({
  taxUnitId: donorIdSchema,
  transferTaxUnitId: donorIdSchema.nullable().optional(),
});

/** The created or updated tax unit. The Danish backend numbers its units 1, 2, … and sends donorId 0. */
export const changedTaxUnitOutput = z.object({
  id: z.number().int().nonnegative(),
  donorId: z.number().int().nonnegative(),
  name: z.string(),
  ssn: z.string(),
  archived: isoDateTime.nullable().optional(),
});

export type ChangedTaxUnit = z.output<typeof changedTaxUnitOutput>;

/** A share in percent as a decimal string, as the distributions are stored ("33.333333333333") */
const percentageShare = z
  .string()
  .max(32)
  .regex(/^\d+(\.\d+)?$/, "Percentage share must be a non-negative decimal string");

/**
 * The new split of an agreement's distribution. The donor is the agreement's (input.donorId), so
 * it isn't part of the split; the tax unit must be one of the donor's.
 */
export const agreementDistributionSchema = z.strictObject({
  taxUnitId: donorIdSchema.nullable(),
  causeAreas: z
    .array(
      z.strictObject({
        id: donorIdSchema,
        standardSplit: z.boolean(),
        percentageShare,
        organizations: z
          .array(z.strictObject({ id: donorIdSchema, percentageShare }))
          .min(1)
          .max(100),
      }),
    )
    .min(1)
    .max(50),
});

export type AgreementDistribution = z.input<typeof agreementDistributionSchema>;

/** Vipps' agreement id, such as "agr_5kSeqz" (Vipps_agreements.ID is a VARCHAR(20)) */
const vippsAgreementId = z.string().min(1).max(20);

/** The donor-scoped Vipps routes PUT /donors/:id/recurring/vipps/:agreementId/… */
export const vippsAgreementInput = donorInput.extend({ agreementId: vippsAgreementId });

export const updateVippsAgreementPriceInput = vippsAgreementInput.extend({
  // REST takes øre; Min Side only sends whole kroner. Same cap as the admin's price change.
  amount: wholeKroner(1_000_000),
});

export const updateVippsAgreementChargeDayInput = vippsAgreementInput.extend({
  chargeDay: chargeDaySchema,
});

export const updateVippsAgreementDistributionInput = vippsAgreementInput.extend({
  distribution: agreementDistributionSchema,
});

/** The agreement's KID after a distribution change (an existing matching KID or a new one) */
export const updateVippsAgreementDistributionOutput = z.object({ KID: z.string() });

/** The AvtaleGiro routes POST /avtalegiro/:KID/…, which check that the donor owns the KID */
export const avtaleGiroAgreementInput = donorInput.extend({ KID: kidSchema });

export const updateAvtaleGiroAmountInput = avtaleGiroAgreementInput.extend({
  // REST takes øre; stored in øre in a signed INT, so this is the largest whole NOK that fits
  amount: wholeKroner(21_474_836),
});

export const updateAvtaleGiroPaymentDateInput = avtaleGiroAgreementInput.extend({
  paymentDate: chargeDaySchema,
});

export const updateAvtaleGiroDistributionInput = avtaleGiroAgreementInput.extend({
  distribution: agreementDistributionSchema,
});

export type TaxUnit = z.output<typeof taxUnitOutput>;
export type DonationsAggregated = z.output<typeof donationsAggregatedOutput>;
export type Donations = z.output<typeof donationsOutput>;
export type Distributions = z.output<typeof distributionsOutput>;
export type VippsAgreements = z.output<typeof vippsAgreementsOutput>;
export type AvtaleGiroAgreements = z.output<typeof avtaleGiroAgreementsOutput>;
export type TaxReports = z.output<typeof taxReportsOutput>;
