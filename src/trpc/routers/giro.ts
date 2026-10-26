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
import { generateCsv } from "../../custom_modules/csvexport";
import { validateDistribution } from "../../custom_modules/distribution";
import { RequestLocale } from "../../middleware/locale";
import { DistributionInput } from "../../schemas/types";
import {
  autoGiroExportInput,
  autoGiroListInput,
  avtaleGiroExportInput,
  avtaleGiroListInput,
  chargeDay,
  distributionInput,
  isoDate,
  mandateListInput,
  toLocalDate,
} from "../schemas/giro";
import { adminProcedure, router } from "../trpc";

const id = z.object({ id: z.number().int().positive() });
const byKID = z.object({ KID: z.string() });
const forDate = z.object({ date: isoDate });

const DEFAULT_SORT = { id: "id", desc: true } as const;

const validate = (distribution: z.infer<typeof distributionInput>): DistributionInput => {
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

const avtalegiroRouter = router({
  /** POST /avtalegiro/agreements */
  list: adminProcedure
    .input(avtaleGiroListInput)
    .query(({ input }) =>
      DAO.avtalegiroagreements.getAgreements(
        input.sort,
        input.page,
        input.limit,
        input.filter ?? null,
        RequestLocale.NO,
      ),
    ),

  /** POST /avtalegiro/agreements with export: true */
  export: adminProcedure.input(avtaleGiroExportInput).query(async ({ input }) => {
    const { rows } = await DAO.avtalegiroagreements.getAgreements(
      input.sort,
      0,
      Number.MAX_SAFE_INTEGER,
      input.filter ?? null,
      RequestLocale.NO,
    );
    return {
      filename: `avtalegiro-agreements-${new Date().toISOString()}.csv`,
      csv: generateCsv(rows),
    };
  }),

  /** GET /avtalegiro/agreement/:id */
  get: adminProcedure.input(id).query(async ({ input }) => {
    const agreement = await DAO.avtalegiroagreements.getAgreement(String(input.id));
    if (!agreement) throw new TRPCError({ code: "NOT_FOUND" });
    const distribution = await DAO.distributions.getSplitByKID(agreement.KID);
    return { ...agreement, distribution };
  }),

  /** GET /avtalegiro/donations/:kid */
  donations: adminProcedure
    .input(byKID)
    .query(({ input }) => DAO.avtalegiroagreements.getDonationsByKID(input.KID)),

  /** GET /avtalegiro/histogram */
  histogram: adminProcedure.query(() => DAO.avtalegiroagreements.getAgreementSumHistogram()),

  /** GET /avtalegiro/report */
  report: adminProcedure.query(async () => {
    const report = await DAO.avtalegiroagreements.getAgreementReport();
    if (!report) throw new TRPCError({ code: "NOT_FOUND" });
    return report;
  }),

  /** GET /avtalegiro/validation */
  validation: adminProcedure.query(() => DAO.avtalegiroagreements.getValidationTable()),

  /** GET /avtalegiro/missing?date= */
  missing: adminProcedure
    .input(forDate)
    .query(({ input }) => DAO.avtalegiroagreements.getMissingForDate(toLocalDate(input.date))),

  /** GET /avtalegiro/recieved?date= */
  received: adminProcedure
    .input(forDate)
    .query(({ input }) =>
      DAO.avtalegiroagreements.getRecievedDonationsForDate(toLocalDate(input.date)),
    ),

  /** GET /avtalegiro/expected?date= */
  expected: adminProcedure
    .input(forDate)
    .query(({ input }) =>
      DAO.avtalegiroagreements.getExpectedDonationsForDate(toLocalDate(input.date)),
    ),

  /** POST /avtalegiro/:KID/amount. Amount in whole NOK (the REST route takes øre). */
  updateAmount: adminProcedure
    .input(z.object({ KID: z.string(), amount: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await assertAvtaleGiroExists(input.KID);
      return updateAvtaleGiroAmount(input.KID, input.amount * 100);
    }),

  /** POST /avtalegiro/:KID/status. Deactivating sends the cancellation notice, as REST does for active: 0. */
  updateStatus: adminProcedure
    .input(z.object({ KID: z.string(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      await assertAvtaleGiroExists(input.KID);
      return setAvtaleGiroStatus(input.KID, input.active ? 1 : 0);
    }),

  /** POST /avtalegiro/:KID/paymentdate */
  updatePaymentDate: adminProcedure
    .input(z.object({ KID: z.string(), paymentDate: chargeDay }))
    .mutation(async ({ input }) => {
      await assertAvtaleGiroExists(input.KID);
      return updateAvtaleGiroPaymentDate(input.KID, input.paymentDate);
    }),

  /** POST /avtalegiro/:KID/distribution */
  updateDistribution: adminProcedure
    .input(z.object({ KID: z.string(), distribution: distributionInput }))
    .mutation(async ({ input }) => {
      const validated = validate(input.distribution);
      await assertAvtaleGiroExists(input.KID);
      await replaceAvtaleGiroDistribution(input.KID, validated);
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
    return {
      filename: `autogiro-agreements-${new Date().toISOString()}.csv`,
      csv: generateCsv(rows),
    };
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

  /** Amount part of PUT /autogiro/:KID/. Amount in SEK. */
  updateAmount: adminProcedure
    .input(z.object({ KID: z.string(), amount: z.number().positive() }))
    .mutation(async ({ input }) => {
      await assertAutoGiroExists(input.KID);
      return DAO.autogiroagreements.setAgreementAmountByKID(input.KID, input.amount);
    }),

  /** Payment date part of PUT /autogiro/:KID/ (and POST /autogiro/:KID/paymentdate) */
  updatePaymentDate: adminProcedure
    .input(z.object({ KID: z.string(), paymentDate: chargeDay }))
    .mutation(async ({ input }) => {
      await assertAutoGiroExists(input.KID);
      await DAO.autogiroagreements.setAgreementPaymentDateByKID(input.KID, input.paymentDate);
      return true;
    }),

  /** Distribution part of PUT /autogiro/:KID/ */
  updateDistribution: adminProcedure
    .input(z.object({ KID: z.string(), distribution: distributionInput }))
    .mutation(async ({ input }) => {
      const validated = validate(input.distribution);
      await assertAutoGiroExists(input.KID);
      await replaceAutoGiroDistribution(input.KID, validated);
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

    /** POST /scheduled/autogiro: creates a shipment and generates its claims file */
    create: adminProcedure.mutation(() => createAutoGiroShipment()),
  }),
});

export const giroRouter = router({
  avtalegiro: avtalegiroRouter,
  autogiro: autogiroRouter,
});
