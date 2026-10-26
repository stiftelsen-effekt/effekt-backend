import { TRPCError } from "@trpc/server";
import { DateTime } from "luxon";
import { z } from "zod";
import { DAO } from "../../custom_modules/DAO";
import { generateCsv } from "../../custom_modules/csvexport";
import * as vippsService from "../../custom_modules/vippsService";
import { adminProcedure, router } from "../trpc";
import {
  agreementDistributionSchema,
  agreementExportInput,
  agreementFilterSchema,
  agreementIdSchema,
  agreementListInput,
  chargeExportInput,
  chargeFilterSchema,
  chargeIdSchema,
  chargeListInput,
  defaultChargeSort,
  matchingRuleCreateInput,
  matchingRuleListInput,
} from "../schemas/vipps";

/** Parses a YYYY-MM-DD input as local midnight, like the dates the REST admin sent. */
const localDate = (isoDate: string) => DateTime.fromISO(isoDate).toJSDate();

const toAgreementDaoFilter = (filter: z.infer<typeof agreementFilterSchema> | undefined) => {
  if (!filter) return null;
  const { created, ...rest } = filter;
  return {
    ...rest,
    created: created && {
      from: created.from ? localDate(created.from) : null,
      to: created.to ? localDate(created.to) : null,
    },
  };
};

// The DAO's `timestamp` branch (which reads filter.dueDate) is unreachable: the schema has no
// `timestamp` field. dueDate stays a string because the column is a YYYY-MM-DD varchar.
const toChargeDaoFilter = (filter: z.infer<typeof chargeFilterSchema> | undefined) =>
  filter ?? null;

/** Loads an agreement from our DB, or throws NOT_FOUND. */
async function getAgreementOrThrow(agreementId: string) {
  const agreement = await DAO.vipps.getAgreement(agreementId);
  if (!agreement) throw new TRPCError({ code: "NOT_FOUND", message: "Agreement not found" });
  return agreement;
}

const exportFilename = (prefix: string) => `${prefix}_${new Date().toISOString()}.csv`;

const agreementsRouter = router({
  list: adminProcedure
    .input(agreementListInput)
    .query(({ input }) =>
      DAO.vipps.getAgreements(
        input.sort,
        input.page,
        input.limit,
        toAgreementDaoFilter(input.filter),
      ),
    ),

  export: adminProcedure.input(agreementExportInput).mutation(async ({ input }) => {
    const results = await DAO.vipps.getAgreements(
      input.sort,
      0,
      Number.MAX_SAFE_INTEGER,
      toAgreementDaoFilter(input.filter),
    );
    return { filename: exportFilename("vipps-agreements"), csv: generateCsv(results.rows) };
  }),

  /** Syncs status and price from Vipps into our DB, then returns Vipps' agreement merged with ours. */
  get: adminProcedure.input(z.object({ id: agreementIdSchema })).query(async ({ input }) => {
    await getAgreementOrThrow(input.id);
    return vippsService.syncAndGetAgreement(input.id);
  }),

  report: adminProcedure.query(() => DAO.vipps.getAgreementReport()),

  histogram: adminProcedure.query(() => DAO.vipps.getAgreementSumHistogram()),

  updatePrice: adminProcedure
    .input(
      z.object({
        id: agreementIdSchema,
        /** New monthly amount in whole NOK (Vipps minimum is 1 NOK) */
        amountNok: z.number().int().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const agreement = await getAgreementOrThrow(input.id);
      const ok = await vippsService.updateAgreementPrice(
        input.id,
        agreement.agreement_url_code,
        input.amountNok * 100,
      );
      if (!ok) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "Vipps did not accept the new agreement price",
        });
      }
    }),

  cancel: adminProcedure.input(z.object({ id: agreementIdSchema })).mutation(async ({ input }) => {
    const agreement = await getAgreementOrThrow(input.id);
    const ok = await vippsService.cancelAgreement(input.id, agreement.agreement_url_code);
    if (!ok) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "Vipps did not cancel the agreement (it may already be stopped)",
      });
    }
  }),

  updateChargeDay: adminProcedure
    .input(
      z.object({
        id: agreementIdSchema,
        /** 1–28, or 0 for the last day of the month */
        chargeDay: z.number().int().min(0).max(28),
      }),
    )
    .mutation(async ({ input }) => {
      const agreement = await getAgreementOrThrow(input.id);
      await vippsService.updateAgreementChargeDay(
        input.id,
        agreement.agreement_url_code,
        input.chargeDay,
      );
    }),

  /** Points the agreement at a matching distribution (existing KID or a new one) */
  updateDistribution: adminProcedure
    .input(z.object({ id: agreementIdSchema, distribution: agreementDistributionSchema }))
    .mutation(async ({ input }) => {
      const agreement = await getAgreementOrThrow(input.id);
      const result = await vippsService.updateAgreementDistribution(
        input.id,
        agreement.agreement_url_code,
        { ...input.distribution, donorId: agreement.donorID },
      );
      if (!result.ok) {
        throw new TRPCError({
          code: result.status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
          message: result.message,
        });
      }
      return { KID: result.KID };
    }),
});

const chargesRouter = router({
  list: adminProcedure
    .input(chargeListInput)
    .query(({ input }) =>
      DAO.vipps.getCharges(
        input.sort ?? defaultChargeSort,
        input.page,
        input.limit,
        toChargeDaoFilter(input.filter),
      ),
    ),

  export: adminProcedure.input(chargeExportInput).mutation(async ({ input }) => {
    const results = await DAO.vipps.getCharges(
      input.sort ?? defaultChargeSort,
      0,
      Number.MAX_SAFE_INTEGER,
      toChargeDaoFilter(input.filter),
    );
    return {
      filename: exportFilename("vipps-charges"),
      csv: generateCsv(results.rows.map(({ full_count, full_sum, full_avg, ...row }) => row)),
    };
  }),

  histogram: adminProcedure.query(() => DAO.vipps.getChargeSumHistogram()),

  /** Refunds a CHARGED charge in full through Vipps and marks it REFUNDED */
  refund: adminProcedure
    .input(z.object({ agreementId: agreementIdSchema, chargeId: chargeIdSchema }))
    .mutation(async ({ input }) => {
      const ok = await vippsService.refundCharge(input.agreementId, input.chargeId);
      if (!ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Vipps did not refund the charge (only CHARGED charges can be refunded)",
        });
      }
    }),
});

const matchingRulesRouter = router({
  list: adminProcedure.input(matchingRuleListInput).query(async ({ input }) => {
    const rules = await DAO.vipps.getMatchingRules();
    const withoutAdoveo = rules.map(({ resolveAdoveoFundraiserID, ...rule }) => rule);
    if (!input) return withoutAdoveo;

    const { from, to } = input.period;
    const day = (date: Date) => DateTime.fromJSDate(new Date(date)).toISODate() ?? "";
    return withoutAdoveo.filter((rule) => day(rule.periodFrom) <= to && day(rule.periodTo) >= from);
  }),

  create: adminProcedure.input(matchingRuleCreateInput).mutation(async ({ input }) => {
    const created = await vippsService.createMatchingRule({
      ...input,
      resolveAdoveoFundraiserID: null,
    });
    if (!created.ok) throw new TRPCError({ code: "BAD_REQUEST", message: created.message });
    if (created.result === false) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not create matching rule",
      });
    }
    return { id: created.result };
  }),

  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const deleted = await DAO.vipps.deleteMatchingRule(input.id);
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Matching rule not found" });
      }
    }),
});

export const vippsRouter = router({
  agreements: agreementsRouter,
  charges: chargesRouter,
  matchingRules: matchingRulesRouter,
});
