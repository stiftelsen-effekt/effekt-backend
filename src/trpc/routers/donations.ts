import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DAO } from "../../custom_modules/DAO";
import { generateCsv } from "../../custom_modules/csvexport";
import {
  confirmDonation,
  createDistribution,
  updateDonation,
} from "../../custom_modules/donationsService";
import { sendDonationReceipt } from "../../custom_modules/mail";
import {
  distributionCreateSchema,
  distributionFilterSchema,
  distributionSchema,
  distributionSortSchema,
  donationFilterSchema,
  donationSortSchema,
  idSchema,
  isoDateSchema,
  localeSchema,
  paginationFields,
} from "../schemas/donations";
import { adminProcedure, router } from "../trpc";

const DEFAULT_DONATION_SORT = { id: "timestamp", desc: true } as const;
const DEFAULT_DISTRIBUTION_SORT = { id: "KID", desc: true } as const;

/** Excel needs the BOM to read UTF-8 (æøå); matches the REST csv download. */
const toCsvExport = (prefix: string, rows: object[]) => ({
  filename: `${prefix}-${new Date().toISOString()}.csv`,
  csv: "﻿" + generateCsv(rows),
});

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
    return toCsvExport("distributions", results.rows);
  }),

  get: adminProcedure.input(z.strictObject({ kid: z.string() })).query(async ({ input }) => {
    let distribution;
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

  create: adminProcedure.input(distributionCreateSchema).mutation(({ input }) => {
    const { metaOwnerId, ...distribution } = input;
    return createDistribution(distribution, metaOwnerId);
  }),
});

export const donationsRouter = router({
  list: adminProcedure
    .input(donationListInput)
    .query(({ input }) =>
      DAO.donations.getAll(
        input.sort ?? DEFAULT_DONATION_SORT,
        input.page,
        input.limit,
        toDaoDonationFilter(input.filter),
        input.locale,
      ),
    ),

  export: adminProcedure.input(donationExportInput).query(async ({ input }) => {
    const results = await DAO.donations.getAll(
      input.sort ?? DEFAULT_DONATION_SORT,
      0,
      Number.MAX_SAFE_INTEGER,
      toDaoDonationFilter(input.filter),
      input.locale,
    );
    return toCsvExport("donations", results.rows);
  }),

  get: adminProcedure
    .input(z.strictObject({ id: idSchema }))
    .query(({ input }) => getDonationOrThrow(input.id)),

  update: adminProcedure
    .input(
      z.strictObject({
        id: idSchema,
        sum: z.number().positive().optional(),
        timestamp: isoDateSchema.optional(),
        paymentId: idSchema.optional(),
        paymentExternalRef: z.string().optional(),
        metaOwnerId: idSchema.optional(),
        distribution: distributionSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const existingDonation = await getDonationOrThrow(input.id);
      await updateDonation(
        existingDonation,
        {
          sum: input.sum,
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
          sum: z.number().positive(),
          timestamp: isoDateSchema,
          paymentId: idSchema,
          paymentExternalRef: z.string().min(1).nullable(),
          metaOwnerId: idSchema,
          sendReceipt: z.boolean(),
        })
        .refine((input) => (input.KID === undefined) !== (input.distribution === undefined), {
          message: "Provide either a KID or a distribution, not both",
        }),
    )
    .mutation(async ({ input }) => {
      let KID: string;
      let newDistribution = false;
      if (input.distribution) {
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

  transactionCostsReport: adminProcedure.query(() => DAO.donations.getTransactionCostsReport()),

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
