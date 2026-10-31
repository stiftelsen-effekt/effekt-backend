import { TRPCError } from "@trpc/server";
import { osloToday } from "../../custom_modules/osloDays";
import { z } from "zod";
import { DAO } from "../../custom_modules/DAO";
import type { AvtaleGiroAgreementPayments } from "../../custom_modules/DAO_modules/avtalegiroagreements";
import type { AvtaleGiroChargeListRow } from "../../custom_modules/DAO_modules/avtalegirocharges";
import {
  replaceAvtaleGiroDistribution,
  setAvtaleGiroStatus,
  updateAvtaleGiroAmount,
  updateAvtaleGiroPaymentDate,
} from "../../custom_modules/avtalegiro";
import { validateDistribution } from "../../custom_modules/distribution";
import { RequestLocale } from "../../middleware/locale";
import { DistributionInput } from "../../schemas/types";
import { csvExport } from "../csv";
import { assertDistributionReferences } from "../distributionChecks";
import { distributionSplitSchema, DistributionSplitInput, idSchema } from "../schemas/common";
import {
  AVTALEGIRO_MAX_NOK,
  avtaleGiroAgreementChargesInput,
  avtaleGiroAgreementChargesOutput,
  avtaleGiroChargeListInput,
  avtaleGiroChargeListOutput,
  avtaleGiroExportInput,
  avtaleGiroListInput,
  chargeDay,
  defaultAvtaleGiroChargeSort,
  isoDate,
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

const toIsoOrNull = (value: Date | null) => value?.toISOString() ?? null;

const toChargeOutput = (row: AvtaleGiroChargeListRow) => ({
  ...row,
  created: toIsoOrNull(row.created),
  lastUpdated: toIsoOrNull(row.lastUpdated),
});

/**
 * The claims sent to Mastercard Payment Services (Avtalegiro_agreement_charges): one per
 * agreement and due date, with the payment it was matched to and any deletion after a cancellation.
 */
const avtalegiroChargesRouter = router({
  /** A page of charges, newest due date first by default, with counts and sums for the filter */
  list: adminProcedure
    .input(avtaleGiroChargeListInput)
    .output(avtaleGiroChargeListOutput)
    .query(async ({ input }) => {
      const result = await DAO.avtalegirocharges.getList({
        filter: input.filter ?? {},
        sort: input.sort ?? defaultAvtaleGiroChargeSort,
        page: input.page,
        limit: input.limit,
      });
      return { ...result, rows: result.rows.map(toChargeOutput) };
    }),

  /** Every charge on one agreement, newest due date first. NOT_FOUND for an unknown agreement. */
  byAgreement: adminProcedure
    .input(avtaleGiroAgreementChargesInput)
    .output(avtaleGiroAgreementChargesOutput)
    .query(async ({ input }) => {
      const rows = await DAO.avtalegirocharges.getByAgreementId(input.agreementId);
      if (rows.length === 0 && !(await DAO.avtalegiroagreements.getAgreement(input.agreementId))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agreement not found" });
      }
      return rows.map(toChargeOutput);
    }),
});

const avtalegiroRouter = router({
  charges: avtalegiroChargesRouter,

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

  /**
   * The agreement's AvtaleGiro donations under every KID it has had: changing the distribution
   * moves earlier donations to a new "historic" KID, which donations({ KID }) doesn't follow.
   * Donations moved by a tax unit change aren't linked to the agreement and are not included.
   */
  payments: adminProcedure
    .input(z.strictObject({ agreementId: idSchema }))
    .query(async ({ input }): Promise<AvtaleGiroAgreementPayments> => {
      const payments = await DAO.avtalegiroagreements.getPaymentsByAgreementId(input.agreementId);
      if (!payments) throw new TRPCError({ code: "NOT_FOUND", message: "Agreement not found" });
      return payments;
    }),

  /** GET /avtalegiro/histogram. Buckets in NOK. */
  histogram: adminProcedure.query(() => DAO.avtalegiroagreements.getAgreementSumHistogram()),

  /** GET /avtalegiro/report */
  report: adminProcedure.query(async () => {
    const report = await DAO.avtalegiroagreements.getAgreementReport();
    if (!report) throw new TRPCError({ code: "NOT_FOUND" });
    // mysql2 returns the aggregates as decimal strings, and the monthly sums are null without rows
    const toNumber = (value: unknown) => Number(value ?? 0);
    return {
      activeAgreementCount: toNumber(report.activeAgreementCount),
      averageAgreementSum: toNumber(report.averageAgreementSum),
      totalAgreementSum: toNumber(report.totalAgreementSum),
      medianAgreementSum: toNumber(report.medianAgreementSum),
      draftedThisMonth: toNumber(report.draftedThisMonth),
      sumDraftedThisMonth: toNumber(report.sumDraftedThisMonth),
      activatedThisMonth: toNumber(report.activatedThisMonth),
      sumActivatedThisMonth: toNumber(report.sumActivatedThisMonth),
      stoppedThisMonth: toNumber(report.stoppedThisMonth),
      sumStoppedThisMonth: toNumber(report.sumStoppedThisMonth),
    };
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
   *
   * For a past date the rows are the claims actually sent to Mastercard Payment Services for that
   * due date, with the claimed amounts, read from the claim file logged by the AvtaleGiro job
   * (`amountSource` "claim"). Without a logged file (today and later, or before June 2021) the rows
   * are the agreements due that day with their current amounts (`amountSource` "agreement"), which
   * can differ from what was charged if an amount changed since.
   */
  expected: adminProcedure.input(forDate).query(async ({ input }) => {
    const claimed =
      input.date < osloToday()
        ? await DAO.avtalegiroagreements.getClaimedAgreementsForDate(input.date)
        : null;
    const rows =
      claimed ??
      (await DAO.avtalegiroagreements.getExpectedDonationsForDate(toLocalDate(input.date)));
    return rows.map(({ amount, ...row }) => ({
      ...row,
      /** NOK */
      amount: amount / 100,
      active: row.active == 1,
      notice: row.notice == 1,
      amountSource: claimed ? ("claim" as const) : ("agreement" as const),
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

export const giroRouter = router({
  avtalegiro: avtalegiroRouter,
});
