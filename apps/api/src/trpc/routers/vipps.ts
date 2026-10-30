import { TRPCError } from "@trpc/server";
import { DateTime } from "luxon";
import { z } from "zod";
import { DAO } from "../../custom_modules/DAO";
import { osloDayRange } from "../../custom_modules/osloDays";
import type {
  VippsAgreementPayments,
  VippsChargeRow,
} from "../../custom_modules/DAO_modules/vipps";
import * as vippsService from "../../custom_modules/vippsService";
import { csvExport } from "../csv";
import { assertDistributionReferences } from "../distributionChecks";
import { distributionSplitSchema } from "../schemas/common";
import { adminProcedure, router } from "../trpc";
import {
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
  matchingRuleIdInput,
  matchingRuleListInput,
  matchingRuleUpdateInput,
} from "../schemas/vipps";

/** `created` is a range of whole Oslo days */
const toAgreementDaoFilter = (filter: z.infer<typeof agreementFilterSchema> | undefined) => {
  if (!filter) return null;
  const { created, ...rest } = filter;
  return { ...rest, createdRange: osloDayRange(created) };
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

/** The upstream error is logged, not returned: it can contain Vipps internals */
const vippsUnavailable = (action: string, cause?: unknown) => {
  if (cause !== undefined) {
    console.error("Vipps request failed (%s):", action, (cause as Error)?.message ?? cause);
  }
  return new TRPCError({ code: "BAD_GATEWAY", message: `Vipps could not ${action}`, cause });
};

/**
 * Runs a call that talks to the Vipps API. A `false` result (Vipps refused, or Vipps isn't
 * configured) or an exception becomes BAD_GATEWAY with a generic message.
 */
async function callVipps<T>(action: string, call: () => Promise<T | false>): Promise<T> {
  let result: T | false;
  try {
    result = await call();
  } catch (ex) {
    throw vippsUnavailable(action, ex);
  }
  if (result === false) throw vippsUnavailable(action);
  return result;
}

/** Drops the window aggregates; their values are in `statistics` */
const withoutAggregates = ({ full_count, full_sum, full_avg, ...row }: VippsChargeRow) => row;

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

  export: adminProcedure.input(agreementExportInput).query(async ({ input }) => {
    const results = await DAO.vipps.getAgreements(
      input.sort,
      0,
      Number.MAX_SAFE_INTEGER,
      toAgreementDaoFilter(input.filter),
    );
    return csvExport("vipps-agreements", results.rows);
  }),

  /** Syncs status and price from Vipps into our DB, then returns Vipps' agreement merged with ours. */
  get: adminProcedure.input(z.strictObject({ id: agreementIdSchema })).query(async ({ input }) => {
    await getAgreementOrThrow(input.id);
    return callVipps("fetch the agreement", () => vippsService.syncAndGetAgreement(input.id));
  }),

  /**
   * The agreement's payments from our DB: its charges, and its donations under every KID it
   * has had (Vipps recurring donations on the KIDs, plus donations registered from its charges),
   * each linked to the other where possible. NOT_FOUND for an unknown agreement.
   */
  payments: adminProcedure
    .input(z.strictObject({ id: agreementIdSchema }))
    .query(async ({ input }): Promise<VippsAgreementPayments> => {
      const payments = await DAO.vipps.getPaymentsByAgreementId(input.id);
      if (!payments) throw new TRPCError({ code: "NOT_FOUND", message: "Agreement not found" });
      return payments;
    }),

  report: adminProcedure.query(() => DAO.vipps.getAgreementReport()),

  histogram: adminProcedure.query(() => DAO.vipps.getAgreementSumHistogram()),

  updatePrice: adminProcedure
    .input(
      z.strictObject({
        id: agreementIdSchema,
        /** New monthly amount in whole NOK (Vipps minimum is 1 NOK) */
        amountNok: z.number().int().min(1).max(1_000_000),
      }),
    )
    .mutation(async ({ input }) => {
      await getAgreementOrThrow(input.id);
      await callVipps("update the agreement price", () =>
        vippsService.updateAgreementPrice(input.id, input.amountNok * 100),
      );
    }),

  cancel: adminProcedure
    .input(z.strictObject({ id: agreementIdSchema }))
    .mutation(async ({ input }) => {
      const agreement = await getAgreementOrThrow(input.id);
      if (agreement.status?.toUpperCase() === "STOPPED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Agreement is already stopped" });
      }
      await callVipps("cancel the agreement", () => vippsService.cancelAgreement(input.id));
    }),

  updateChargeDay: adminProcedure
    .input(
      z.strictObject({
        id: agreementIdSchema,
        /** 1–28, or 0 for the last day of the month */
        chargeDay: z.number().int().min(0).max(28),
      }),
    )
    .mutation(async ({ input }) => {
      await getAgreementOrThrow(input.id);
      await vippsService.updateAgreementChargeDay(input.id, input.chargeDay);
    }),

  /** Points the agreement at a matching distribution (existing KID or a new one) */
  updateDistribution: adminProcedure
    .input(z.strictObject({ id: agreementIdSchema, distribution: distributionSplitSchema }))
    .mutation(async ({ input }) => {
      const agreement = await getAgreementOrThrow(input.id);
      // Checked here rather than in the service shared with REST, to keep REST responses as-is
      await assertDistributionReferences({ ...input.distribution, donorId: agreement.donorID });
      const result = await vippsService.updateAgreementDistribution(input.id, {
        ...input.distribution,
        donorId: agreement.donorID,
      });
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
  list: adminProcedure.input(chargeListInput).query(async ({ input }) => {
    const result = await DAO.vipps.getCharges(
      input.sort ?? defaultChargeSort,
      input.page,
      input.limit,
      toChargeDaoFilter(input.filter),
    );
    return { ...result, rows: result.rows.map(withoutAggregates) };
  }),

  export: adminProcedure.input(chargeExportInput).query(async ({ input }) => {
    const results = await DAO.vipps.getCharges(
      input.sort ?? defaultChargeSort,
      0,
      Number.MAX_SAFE_INTEGER,
      toChargeDaoFilter(input.filter),
    );
    return csvExport("vipps-charges", results.rows.map(withoutAggregates));
  }),

  histogram: adminProcedure.query(() => DAO.vipps.getChargeSumHistogram()),

  /** Refunds a CHARGED charge in full through Vipps and marks it REFUNDED */
  refund: adminProcedure
    .input(z.strictObject({ agreementId: agreementIdSchema, chargeId: chargeIdSchema }))
    .mutation(async ({ input }) => {
      const charge: VippsChargeRow | false = await DAO.vipps.getCharge(
        input.agreementId,
        input.chargeId,
      );
      if (!charge) throw new TRPCError({ code: "NOT_FOUND", message: "Charge not found" });
      if (charge.status !== "CHARGED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Only CHARGED charges can be refunded (this charge is ${charge.status})`,
        });
      }
      await callVipps("refund the charge", () =>
        vippsService.refundCharge(input.agreementId, input.chargeId),
      );
    }),
});

/** Rules that resolve Vipps settlement transactions (by sales location and message) to a KID */
const matchingRulesRouter = router({
  list: adminProcedure.input(matchingRuleListInput).query(async ({ input }) => {
    const rules = await DAO.vipps.getMatchingRules();
    if (!input) return rules;

    const { from, to } = input.period;
    const day = (date: Date) => DateTime.fromJSDate(new Date(date)).toISODate() ?? "";
    return rules.filter((rule) => day(rule.periodFrom) <= to && day(rule.periodTo) >= from);
  }),

  create: adminProcedure.input(matchingRuleCreateInput).mutation(async ({ input }) => {
    const created = await vippsService.createMatchingRule(input);
    if (!created.ok) throw new TRPCError({ code: "BAD_REQUEST", message: created.message });
    if (created.result === false) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not create matching rule",
      });
    }
    return { id: created.result };
  }),

  /** Replaces a rule's fields, validated like create. NOT_FOUND for an unknown id. */
  update: adminProcedure.input(matchingRuleUpdateInput).mutation(async ({ input }) => {
    const { id, ...rule } = input;
    const updated = await vippsService.updateMatchingRule(id, rule);
    if (!updated.ok) {
      throw new TRPCError({
        code: updated.status === 404 ? "NOT_FOUND" : "BAD_REQUEST",
        message: updated.message,
      });
    }
    return { id };
  }),

  delete: adminProcedure.input(matchingRuleIdInput).mutation(async ({ input }) => {
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
