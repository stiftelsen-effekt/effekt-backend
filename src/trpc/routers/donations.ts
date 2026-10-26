import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DAO } from "../../custom_modules/DAO";
import { TaxUnitType } from "../../custom_modules/DAO_modules/donations";
import {
  confirmDonation,
  createDistribution,
  updateDonation,
} from "../../custom_modules/donationsService";
import { sendDonationReceipt } from "../../custom_modules/mail";
import { Distribution } from "../../schemas/types";
import { csvExport } from "../csv";
import { assertDistributionReferences } from "../distributionChecks";
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
  donationFilterSchema,
  donationSortSchema,
  paymentExternalRefSchema,
  transactionCostSchema,
} from "../schemas/donations";
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

const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });

const assertPaymentMethodExists = async (paymentId: number) => {
  const methods = await DAO.payment.getMethods();
  if (!methods?.some((method) => method.id === paymentId)) {
    throw badRequest(`Payment method ${paymentId} does not exist`);
  }
};

const assertDataOwnerExists = async (metaOwnerId: number) => {
  const owners = await DAO.meta.getDataOwners();
  if (!owners.some((owner) => owner.id === metaOwnerId)) {
    throw badRequest(`Data owner ${metaOwnerId} does not exist`);
  }
};

/**
 * PaymentExternal_ID is unique across all payment methods, so any existing donation with the
 * reference conflicts (the DAO's own check only looks at the same payment method).
 */
const assertExternalRefUnused = async (externalRef: string) => {
  if (await DAO.donations.externalRefExists(externalRef)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `A donation with external reference ${externalRef} already exists`,
    });
  }
};

const donationListInput = z.strictObject({
  ...paginationFields,
  sort: donationSortSchema.optional(),
  filter: donationFilterSchema.optional(),
  locale: localeSchema,
});

const donationExportInput = donationListInput.omit({ page: true, limit: true });

const toDaoDonationFilter = (filter: z.infer<typeof donationFilterSchema> | undefined) =>
  filter
    ? {
        ...filter,
        date: filter.date
          ? {
              from: filter.date.from ? new Date(filter.date.from) : undefined,
              to: filter.date.to ? new Date(filter.date.to) : undefined,
            }
          : undefined,
      }
    : null;

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
  list: adminProcedure
    .input(distributionListInput)
    .query(({ input }) =>
      DAO.distributions.getAll(
        input.page,
        input.limit,
        input.sort ?? DEFAULT_DISTRIBUTION_SORT,
        input.filter ?? null,
      ),
    ),

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
    return { ...distribution, donor, taxUnit };
  }),

  create: adminProcedure.input(distributionCreateSchema).mutation(async ({ input }) => {
    await assertDistributionReferences(input);
    const { metaOwnerId, ...distribution } = input;
    return createDistribution(distribution, metaOwnerId);
  }),
});

export const donationsRouter = router({
  list: adminProcedure
    .input(donationListInput)
    .query(({ input }) => getDonationList(input, input.page, input.limit)),

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
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Receipt failed with error code ${mailStatus}`,
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
    .mutation(async ({ input }) => {
      await assertPaymentMethodExists(input.paymentId);
      await assertDataOwnerExists(input.metaOwnerId);
      if (input.paymentExternalRef !== null) {
        await assertExternalRefUnused(input.paymentExternalRef);
      }

      let KID: string;
      let newDistribution = false;
      if (input.distribution) {
        await assertDistributionReferences(input.distribution);
        ({ KID, newDistribution } = await createDistribution(
          input.distribution,
          input.metaOwnerId,
        ));
      } else {
        KID = input.KID!;
      }

      let donationId: number;
      try {
        donationId = await confirmDonation({
          KID,
          paymentMethodId: input.paymentId,
          sum: input.sum,
          timestamp: new Date(input.timestamp),
          externalRef: input.paymentExternalRef,
          metaOwnerId: input.metaOwnerId,
          sendReceipt: input.sendReceipt,
        });
      } catch (ex) {
        const message = errorMessage(ex);
        if (message.startsWith("NO_KID")) {
          throw new TRPCError({ code: "BAD_REQUEST", message, cause: ex });
        }
        if (message.startsWith("EXISTING_DONATION")) {
          throw new TRPCError({ code: "CONFLICT", message, cause: ex });
        }
        throw ex;
      }

      return { donationId, KID, newDistribution };
    }),

  histogram: adminProcedure.query(() => DAO.donations.getHistogramBySum()),

  transactionCostsReport: adminProcedure.query(async () => {
    const report = await DAO.donations.getTransactionCostsReport();
    if (!report) throw new TRPCError({ code: "NOT_FOUND" });
    return report;
  }),

  /** Sum per organization of donations confirmed in an inclusive date range */
  total: adminProcedure
    .input(z.strictObject({ fromDate: isoDateSchema, toDate: isoDateSchema }))
    .query(({ input }) =>
      DAO.donations.getAggregateByTime(new Date(input.fromDate), new Date(input.toDate)),
    ),

  totalMonthly: adminProcedure.query(() => DAO.donations.getAggregateLastYearByMonth()),

  byKid: adminProcedure
    .input(z.strictObject({ kid: z.string() }))
    .query(({ input }) => DAO.donations.getAllByKID(input.kid)),

  distributions: distributionsRouter,
});
