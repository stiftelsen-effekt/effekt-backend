import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DAO } from "../../custom_modules/DAO";
import {
  replaceAvtaleGiroDistribution,
  setAvtaleGiroStatus,
  updateAvtaleGiroAmount,
  updateAvtaleGiroPaymentDate,
} from "../../custom_modules/avtalegiro";
import { createAutoGiroShipment, replaceAutoGiroDistribution } from "../../custom_modules/autogiro";
import { validateDistribution } from "../../custom_modules/distribution";
import { RequestLocale } from "../../middleware/locale";
import { DistributionInput } from "../../schemas/types";
import { csvExport } from "../csv";
import { assertDistributionReferences } from "../distributionChecks";
import { distributionSplitSchema, DistributionSplitInput, idSchema } from "../schemas/common";
import {
  AUTOGIRO_MAX_SEK,
  AVTALEGIRO_MAX_NOK,
  autoGiroExportInput,
  autoGiroListInput,
  avtaleGiroExportInput,
  avtaleGiroListInput,
  chargeDay,
  isoDate,
  mandateListInput,
  toLocalDate,
} from "../schemas/giro";
import { adminProcedure, router } from "../trpc";

const id = z.strictObject({ id: idSchema });
const byKID = z.strictObject({ KID: z.string() });
const forDate = z.strictObject({ date: isoDate });

const DEFAULT_SORT = { id: "id", desc: true } as const;

/**
 * Checks a new agreement split against the database and returns it as a full distribution
 * for the agreement's donor (agreements can't move between donors).
 */
const toAgreementDistribution = async (
  KID: string,
  split: DistributionSplitInput,
): Promise<DistributionInput> => {
  const { donorId } = await DAO.distributions.getSplitByKID(KID);
  const distribution = { ...split, donorId };
  await assertDistributionReferences(distribution);
  try {
    return validateDistribution(distribution);
  } catch (ex) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: ex instanceof Error ? ex.message : "Invalid distribution",
    });
  }
};

const assertAvtaleGiroExists = async (KID: string) => {
  if (!(await DAO.avtalegiroagreements.getByKID(KID))) throw new TRPCError({ code: "NOT_FOUND" });
};

const assertAutoGiroExists = async (KID: string) => {
  if (!(await DAO.autogiroagreements.getAgreementByKID(KID)))
    throw new TRPCError({ code: "NOT_FOUND" });
};

const getAvtaleGiroAgreements = async (
  input: z.infer<typeof avtaleGiroExportInput>,
  page: number,
  limit: number,
) => {
  const result = await DAO.avtalegiroagreements.getAgreements(
    input.sort ?? DEFAULT_SORT,
    page,
    limit,
    input.filter ?? null,
    RequestLocale.NO,
  );
  return {
    ...result,
    rows: result.rows.map((row) => ({
      ...row,
      active: row.active == 1,
      notice: row.notice == 1,
    })),
  };
};

const avtalegiroRouter = router({
  /** POST /avtalegiro/agreements. Amounts in NOK. */
  list: adminProcedure
    .input(avtaleGiroListInput)
    .query(({ input }) => getAvtaleGiroAgreements(input, input.page, input.limit)),

  /** POST /avtalegiro/agreements with export: true */
  export: adminProcedure.input(avtaleGiroExportInput).query(async ({ input }) => {
    const { rows } = await getAvtaleGiroAgreements(input, 0, Number.MAX_SAFE_INTEGER);
    return csvExport("avtalegiro-agreements", rows);
  }),

  /** GET /avtalegiro/agreement/:id. Amount in NOK. */
  get: adminProcedure.input(id).query(async ({ input }) => {
    const agreement = await DAO.avtalegiroagreements.getAgreement(input.id);
    if (!agreement) throw new TRPCError({ code: "NOT_FOUND" });
    const distribution = await DAO.distributions.getSplitByKID(agreement.KID);
    return {
      ...agreement,
      amount: Number(agreement.amount),
      active: agreement.active == 1,
      notice: agreement.notice == 1,
      distribution,
    };
  }),

  /** GET /avtalegiro/donations/:kid */
  donations: adminProcedure
    .input(byKID)
    .query(({ input }) => DAO.avtalegiroagreements.getDonationsByKID(input.KID)),

  /** GET /avtalegiro/histogram. Buckets in NOK. */
  histogram: adminProcedure.query(() => DAO.avtalegiroagreements.getAgreementSumHistogram()),

  /** GET /avtalegiro/report */
  report: adminProcedure.query(async () => {
    const report = await DAO.avtalegiroagreements.getAgreementReport();
    if (!report) throw new TRPCError({ code: "NOT_FOUND" });
    return report;
  }),

  /** GET /avtalegiro/validation. Sums in NOK. */
  validation: adminProcedure.query(() => DAO.avtalegiroagreements.getValidationTable()),

  /** GET /avtalegiro/missing?date=. Agreements charged on the date with no donation yet; amounts in NOK. */
  missing: adminProcedure.input(forDate).query(async ({ input }) => {
    const rows = await DAO.avtalegiroagreements.getMissingForDate(toLocalDate(input.date));
    return rows.map((row) => ({ ...row, active: row.active == 1 }));
  }),

  /** GET /avtalegiro/recieved?date= */
  received: adminProcedure
    .input(forDate)
    .query(({ input }) =>
      DAO.avtalegiroagreements.getRecievedDonationsForDate(toLocalDate(input.date)),
    ),

  /**
   * GET /avtalegiro/expected?date=. Agreements expected to be charged on the date. Unlike REST
   * (øre in `amount`), the amount is in NOK like the other procedures.
   */
  expected: adminProcedure.input(forDate).query(async ({ input }) => {
    const rows = await DAO.avtalegiroagreements.getExpectedDonationsForDate(
      toLocalDate(input.date),
    );
    return rows.map(({ amount, ...row }) => ({
      ...row,
      /** NOK */
      amount: amount / 100,
      active: row.active == 1,
      notice: row.notice == 1,
    }));
  }),

  /** POST /avtalegiro/:KID/amount. Amount in whole NOK (the REST route takes øre). */
  updateAmount: adminProcedure
    .input(
      z.strictObject({
        KID: z.string(),
        amount: z.number().int().positive().max(AVTALEGIRO_MAX_NOK),
      }),
    )
    .mutation(async ({ input }) => {
      await assertAvtaleGiroExists(input.KID);
      return updateAvtaleGiroAmount(input.KID, input.amount * 100);
    }),

  /** POST /avtalegiro/:KID/status. Deactivating sends the cancellation notice, as REST does for active: 0. */
  updateStatus: adminProcedure
    .input(z.strictObject({ KID: z.string(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      await assertAvtaleGiroExists(input.KID);
      return setAvtaleGiroStatus(input.KID, input.active ? 1 : 0);
    }),

  /** POST /avtalegiro/:KID/paymentdate */
  updatePaymentDate: adminProcedure
    .input(z.strictObject({ KID: z.string(), paymentDate: chargeDay }))
    .mutation(async ({ input }) => {
      await assertAvtaleGiroExists(input.KID);
      return updateAvtaleGiroPaymentDate(input.KID, input.paymentDate);
    }),

  /** POST /avtalegiro/:KID/distribution. The split stays with the agreement's donor. */
  updateDistribution: adminProcedure
    .input(z.strictObject({ KID: z.string(), distribution: distributionSplitSchema }))
    .mutation(async ({ input }) => {
      await assertAvtaleGiroExists(input.KID);
      const distribution = await toAgreementDistribution(input.KID, input.distribution);
      await replaceAvtaleGiroDistribution(input.KID, distribution);
      return true;
    }),
});

const autogiroRouter = router({
  /** POST /autogiro/agreements */
  list: adminProcedure
    .input(autoGiroListInput)
    .query(({ input }) =>
      DAO.autogiroagreements.getAgreements(
        input.sort ?? DEFAULT_SORT,
        input.page,
        input.limit,
        input.filter,
      ),
    ),

  /** POST /autogiro/agreements with export: true */
  export: adminProcedure.input(autoGiroExportInput).query(async ({ input }) => {
    const { rows } = await DAO.autogiroagreements.getAgreements(
      input.sort ?? DEFAULT_SORT,
      0,
      Number.MAX_SAFE_INTEGER,
      input.filter,
    );
    return csvExport("autogiro-agreements", rows);
  }),

  /** GET /autogiro/agreement/:id */
  get: adminProcedure.input(id).query(async ({ input }) => {
    const agreement = await DAO.autogiroagreements.getAgreementById(input.id);
    if (!agreement) throw new TRPCError({ code: "NOT_FOUND" });
    const distribution = await DAO.distributions.getSplitByKID(agreement.KID);
    return { ...agreement, distribution };
  }),

  /** GET /autogiro/donations/:KID */
  donations: adminProcedure.input(byKID).query(({ input }) => DAO.donations.getAllByKID(input.KID)),

  /** GET /autogiro/histogram */
  histogram: adminProcedure.query(() => DAO.autogiroagreements.getAgreementSumHistogram()),

  /** Amount part of PUT /autogiro/:KID/. Amount in whole SEK. */
  updateAmount: adminProcedure
    .input(
      z.strictObject({
        KID: z.string(),
        amount: z.number().int().positive().max(AUTOGIRO_MAX_SEK),
      }),
    )
    .mutation(async ({ input }) => {
      await assertAutoGiroExists(input.KID);
      return DAO.autogiroagreements.setAgreementAmountByKID(input.KID, input.amount);
    }),

  /** Payment date part of PUT /autogiro/:KID/ (and POST /autogiro/:KID/paymentdate) */
  updatePaymentDate: adminProcedure
    .input(z.strictObject({ KID: z.string(), paymentDate: chargeDay }))
    .mutation(async ({ input }) => {
      await assertAutoGiroExists(input.KID);
      await DAO.autogiroagreements.setAgreementPaymentDateByKID(input.KID, input.paymentDate);
      return true;
    }),

  /** Distribution part of PUT /autogiro/:KID/. The split stays with the agreement's donor. */
  updateDistribution: adminProcedure
    .input(z.strictObject({ KID: z.string(), distribution: distributionSplitSchema }))
    .mutation(async ({ input }) => {
      await assertAutoGiroExists(input.KID);
      const distribution = await toAgreementDistribution(input.KID, input.distribution);
      await replaceAutoGiroDistribution(input.KID, distribution);
      return true;
    }),

  /** PUT /autogiro/:KID/activate */
  activate: adminProcedure.input(byKID).mutation(async ({ input }) => {
    await assertAutoGiroExists(input.KID);
    await DAO.autogiroagreements.activateAgreementByKID(input.KID);
    return true;
  }),

  /** PUT /autogiro/:KID/cancel */
  cancel: adminProcedure.input(byKID).mutation(async ({ input }) => {
    await assertAutoGiroExists(input.KID);
    await DAO.autogiroagreements.cancelAgreementByKID(input.KID);
    return true;
  }),

  mandates: router({
    /** POST /autogiro/mandates */
    list: adminProcedure
      .input(mandateListInput)
      .query(({ input }) =>
        DAO.autogiroagreements.getMandates(
          input.sort ?? DEFAULT_SORT,
          input.page,
          input.limit,
          input.filter,
        ),
      ),

    /** No REST equivalent (the old admin called a non-existent GET /autogiro/mandate/:id) */
    get: adminProcedure.input(id).query(async ({ input }) => {
      const mandate = await DAO.autogiroagreements.getMandateById(input.id);
      // getMandateById returns {} rather than null when there is no row
      if (!mandate || mandate.ID === undefined) throw new TRPCError({ code: "NOT_FOUND" });
      return mandate;
    }),
  }),

  shipments: router({
    /** GET /autogiro/shipments */
    list: adminProcedure.query(() => DAO.autogiroagreements.getAllShipments()),

    /** GET /autogiro/shipment/:id/report: the stored BFEP.IAGAG claims file (plain text) */
    report: adminProcedure.input(id).query(async ({ input }) => {
      const file = await DAO.logging.getAutoGiroShipmentFile(input.id);
      if (!file || typeof file.fileContents !== "string") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return {
        filename: String(file.filename),
        contentType: "text/plain",
        content: file.fileContents,
      };
    }),

    /**
     * POST /scheduled/autogiro: creates a shipment and generates its claims file. The empty
     * result uses the same `numMandatesToBeConfirmed` key as a created shipment.
     */
    create: adminProcedure.mutation(async () => {
      const result = await createAutoGiroShipment();
      if (result.shipmentID === null) {
        const { mandatesToBeConfirmed, ...rest } = result;
        return { ...rest, numMandatesToBeConfirmed: mandatesToBeConfirmed };
      }
      return result;
    }),
  }),
});

export const giroRouter = router({
  avtalegiro: avtalegiroRouter,
  autogiro: autogiroRouter,
});
