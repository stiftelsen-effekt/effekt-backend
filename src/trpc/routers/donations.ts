import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DAO } from "../../custom_modules/DAO";
import { TaxUnitType, type SumHistogramBucket } from "../../custom_modules/DAO_modules/donations";
import { createDistribution, updateDonation } from "../../custom_modules/donationsService";
import { sendDonationReceipt } from "../../custom_modules/mail";
import { osloDateOrInstantRange, osloDayEnd, osloDayStart } from "../../custom_modules/osloDays";
import { Distribution } from "../../schemas/types";
import { csvExport } from "../csv";
import { assertDistributionReferences } from "../distributionChecks";
import {
  assertDataOwnerExists,
  assertExternalRefUnused,
  assertPaymentMethodExists,
  registerDonation,
} from "../donationRegistration";
import {
  distributionCreateSchema,
  distributionSchema,
  idSchema,
  isoDateOrDateTimeSchema,
  isoDateSchema,
  localeSchema,
  moneySchema,
  paginationFields,
} from "../schemas/common";
import {
  distributionFilterSchema,
  distributionSortSchema,
  donationHistogramInput,
  donationFilterSchema,
  donationSortSchema,
  paymentExternalRefSchema,
  transactionCostSchema,
} from "../schemas/donations";
import { withOrgSplits } from "../orgSplits";
import { adminProcedure, router } from "../trpc";

const DEFAULT_DONATION_SORT = { id: "timestamp", desc: true } as const;
const DEFAULT_DISTRIBUTION_SORT = { id: "KID", desc: true } as const;

const errorMessage = (ex: unknown) => (ex instanceof Error ? ex.message : String(ex));

/** DAO lookups signal "not found" by throwing; translate those into NOT_FOUND. */
const rethrowNotFound = (ex: unknown, pattern: string): never => {
  if (errorMessage(ex).includes(pattern)) {
    throw new TRPCError({ code: "NOT_FOUND", message: errorMessage(ex), cause: ex });
  }
  throw ex;
};

const getDonationOrThrow = async (id: number) => {
  try {
    return await DAO.donations.getByID(id);
  } catch (ex) {
    return rethrowNotFound(ex, "Could not find donation");
  }
};

const donationListInput = z.strictObject({
  ...paginationFields,
  sort: donationSortSchema.optional(),
  filter: donationFilterSchema.optional(),
  locale: localeSchema,
});

const donationExportInput = donationListInput.omit({ page: true, limit: true });

/** Dates are whole Oslo days; date-times with offset are exact instants (osloDays.ts) */
const toDaoDonationFilter = (filter: z.infer<typeof donationFilterSchema> | undefined) =>
  filter ? { ...filter, date: osloDateOrInstantRange(filter.date) } : null;

/** A row of donations.list as the DAO returns it at runtime (decimals are strings) */
type DonationListRow = {
  id: number;
  donor: string;
  paymentMethod: string;
  /** Decimal string */
  sum: string;
  /** Decimal string */
  transactionCost: string | null;
  kid: string;
  timestamp: Date;
  taxUnitType: TaxUnitType | null;
};

const getDonationList = async (
  input: z.infer<typeof donationExportInput>,
  page: number,
  limit: number,
) => {
  const result = await DAO.donations.getAll(
    input.sort ?? DEFAULT_DONATION_SORT,
    page,
    limit,
    toDaoDonationFilter(input.filter),
    input.locale,
  );
  return {
    // The DAO's declared row type predates the tax unit type column and decimal strings
    rows: result.rows as unknown as DonationListRow[],
    statistics: {
      numDonations: Number(result.statistics.numDonations),
      /** Decimal string */
      sumDonations: String(result.statistics.sumDonations ?? 0),
      /** Decimal string */
      avgDonation: String(result.statistics.avgDonation ?? 0),
    },
    pages: result.pages,
  };
};

const distributionListInput = z.strictObject({
  ...paginationFields,
  sort: distributionSortSchema.optional(),
  filter: distributionFilterSchema.optional(),
});

const distributionExportInput = distributionListInput.omit({ page: true, limit: true });

const distributionsRouter = router({
  list: adminProcedure.input(distributionListInput).query(async ({ input }) => {
    const result = await DAO.distributions.getAll(
      input.page,
      input.limit,
      input.sort ?? DEFAULT_DISTRIBUTION_SORT,
      input.filter ?? null,
    );
    return { ...result, rows: await withOrgSplits(result.rows, (row) => row.KID) };
  }),

  export: adminProcedure.input(distributionExportInput).query(async ({ input }) => {
    const results = await DAO.distributions.getAll(
      0,
      Number.MAX_SAFE_INTEGER,
      input.sort ?? DEFAULT_DISTRIBUTION_SORT,
      input.filter ?? null,
    );
    return csvExport("distributions", results.rows);
  }),

  get: adminProcedure.input(z.strictObject({ kid: z.string() })).query(async ({ input }) => {
    let distribution: Distribution;
    try {
      distribution = await DAO.distributions.getSplitByKID(input.kid);
    } catch (ex) {
      return rethrowNotFound(ex, "NOT FOUND");
    }
    const [donor, taxUnit] = await Promise.all([
      DAO.donors.getByID(distribution.donorId),
      distribution.taxUnitId != null
        ? DAO.tax.getById(distribution.taxUnitId)
        : Promise.resolve(null),
    ]);
    return {
      ...distribution,
      donor: donor && { ...donor, trash: Boolean(donor.trash) },
      taxUnit,
    };
  }),

  create: adminProcedure.input(distributionCreateSchema).mutation(async ({ input }) => {
    await assertDistributionReferences(input);
    const { metaOwnerId, ...distribution } = input;
    return createDistribution(distribution, metaOwnerId);
  }),
});

export const donationsRouter = router({
  list: adminProcedure.input(donationListInput).query(async ({ input }) => {
    const result = await getDonationList(input, input.page, input.limit);
    return { ...result, rows: await withOrgSplits(result.rows, (row) => row.kid) };
  }),

  export: adminProcedure.input(donationExportInput).query(async ({ input }) => {
    const results = await getDonationList(input, 0, Number.MAX_SAFE_INTEGER);
    return csvExport("donations", results.rows);
  }),

  get: adminProcedure
    .input(z.strictObject({ id: idSchema }))
    .query(({ input }) => getDonationOrThrow(input.id)),

  /**
   * Updates a donation. The external reference can't be cleared: the shared update keeps the
   * current value for null/undefined (as PUT /donations/:id does).
   */
  update: adminProcedure
    .input(
      z.strictObject({
        id: idSchema,
        sum: moneySchema.optional(),
        transactionCost: transactionCostSchema.optional(),
        timestamp: isoDateOrDateTimeSchema.optional(),
        paymentId: idSchema.optional(),
        paymentExternalRef: paymentExternalRefSchema.optional(),
        metaOwnerId: idSchema.optional(),
        distribution: distributionSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const existingDonation = await getDonationOrThrow(input.id);

      if (input.paymentId !== undefined) await assertPaymentMethodExists(input.paymentId);
      if (input.metaOwnerId !== undefined) await assertDataOwnerExists(input.metaOwnerId);
      if (
        input.paymentExternalRef !== undefined &&
        input.paymentExternalRef !== existingDonation.paymentExternalRef
      ) {
        await assertExternalRefUnused(input.paymentExternalRef);
      }
      if (input.distribution) await assertDistributionReferences(input.distribution);

      await updateDonation(
        existingDonation,
        {
          sum: input.sum,
          transactionCost: input.transactionCost,
          timestamp: input.timestamp ? new Date(input.timestamp) : undefined,
          paymentId: input.paymentId,
          paymentExternalRef: input.paymentExternalRef,
          metaOwnerId: input.metaOwnerId,
        },
        // The KID is the donation's current one; the service moves the donation if the
        // split differs.
        input.distribution ? { ...input.distribution, kid: existingDonation.KID } : undefined,
      );
    }),

  delete: adminProcedure.input(z.strictObject({ id: idSchema })).mutation(async ({ input }) => {
    const removed = await DAO.donations.remove(input.id);
    if (!removed) throw new TRPCError({ code: "NOT_FOUND" });
  }),

  resendReceipt: adminProcedure
    .input(z.strictObject({ id: idSchema, email: z.email().optional() }))
    .mutation(async ({ input }) => {
      await getDonationOrThrow(input.id);
      const mailStatus = await sendDonationReceipt(input.id, input.email ?? null);
      if (mailStatus !== true) {
        // Not INTERNAL_SERVER_ERROR, whose message is hidden in production
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            typeof mailStatus === "number"
              ? `The mail service didn't accept the receipt (status ${mailStatus})`
              : "The receipt could not be sent: the donor may have no email address, or the mail service failed",
        });
      }
    }),

  /**
   * Manually registers a confirmed donation, either on an existing KID or on a distribution
   * created (or matched by split) first.
   */
  register: adminProcedure
    .input(
      z
        .strictObject({
          KID: z.string().min(1).optional(),
          distribution: distributionSchema.optional(),
          sum: moneySchema,
          timestamp: isoDateOrDateTimeSchema,
          paymentId: idSchema,
          paymentExternalRef: paymentExternalRefSchema.nullable(),
          metaOwnerId: idSchema,
          sendReceipt: z.boolean(),
        })
        .refine((input) => (input.KID === undefined) !== (input.distribution === undefined), {
          message: "Provide either a KID or a distribution, not both",
        }),
    )
    .mutation(({ input }) => registerDonation(input)),

  /**
   * Donation count per sum bucket, in whole currency units. Without input (or `scale: "fixed"`)
   * the 5 000 kr buckets of REST GET /donations/histogram; `scale: "log"` spreads ~`buckets`
   * buckets over the range on a log scale, so small donations aren't all in the first bucket.
   */
  histogram: adminProcedure
    .input(donationHistogramInput)
    .query(async ({ input }): Promise<SumHistogramBucket[]> => {
      if (input?.scale === "log") return DAO.donations.getLogHistogramBySum(input.buckets);
      const rows = await DAO.donations.getHistogramBySum();
      // DECIMAL arithmetic: mysql2 returns the bucket as a string
      return rows.map((row) => {
        const bucket = Number(row.bucket);
        return {
          bucket,
          bucketEnd: bucket + 5000,
          items: Number(row.items),
          bar: Number(row.bar),
        };
      });
    }),

  transactionCostsReport: adminProcedure.query(async () => {
    const report = await DAO.donations.getTransactionCostsReport();
    if (!report) throw new TRPCError({ code: "NOT_FOUND" });
    return report;
  }),

  /** Sum per organization of donations confirmed in an inclusive range of Oslo days */
  total: adminProcedure
    .input(z.strictObject({ fromDate: isoDateSchema, toDate: isoDateSchema }))
    .query(({ input }) =>
      DAO.donations.getAggregateByTime(osloDayStart(input.fromDate), osloDayEnd(input.toDate), {
        exclusiveEnd: true,
      }),
    ),

  totalMonthly: adminProcedure.query(() => DAO.donations.getAggregateLastYearByMonth()),

  byKid: adminProcedure
    .input(z.strictObject({ kid: z.string() }))
    .query(({ input }) => DAO.donations.getAllByKID(input.kid)),

  distributions: distributionsRouter,
});
