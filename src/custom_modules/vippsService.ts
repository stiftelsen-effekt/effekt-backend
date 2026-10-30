import { DAO } from "./DAO";
import { donationHelpers } from "./donationHelpers";
import { validateDistribution } from "./distribution";
import * as mail from "./mail";
import { DistributionInput } from "../schemas/types";
import type { VippsAgreement } from "./DAO_modules/vipps";

// Accessed through the module object (not destructured) so tests can stub its methods
const vipps = require("./vipps");

/**
 * Business logic for admin/donor edits of Vipps recurring agreements, shared by the REST
 * routes in routes/vipps.ts and the tRPC vipps router.
 *
 * Agreements are identified both by their Vipps agreement id (used against the Vipps API and
 * our DB) and by their agreement url code (used in the change-notification email).
 */

/** The subset of a Vipps Recurring v3 agreement we rely on; Vipps returns more fields. */
export type VippsRecurringAgreement = {
  id: string;
  status: VippsAgreement["status"];
  pricing: { amount: number; currency: string; type?: string };
  [field: string]: unknown;
};

/**
 * Fetches an agreement from Vipps, writes its status and price into our DB, and returns the
 * Vipps agreement merged with our DB row (DB fields win).
 */
export async function syncAndGetAgreement(agreementId: string) {
  const responseVipps: VippsRecurringAgreement | false = await vipps.getAgreement(agreementId);
  if (!responseVipps) {
    // Without this guard the status below would be written as undefined (NULL) before the
    // price access throws.
    throw new Error(`Could not fetch Vipps agreement ${agreementId} from Vipps`);
  }
  await DAO.vipps.updateAgreementStatus(agreementId, responseVipps.status);
  await DAO.vipps.updateAgreementPrice(agreementId, responseVipps.pricing.amount / 100);
  const responseDAO = await DAO.vipps.getAgreement(agreementId);

  return { ...responseVipps, ...responseDAO };
}

/**
 * Stops the agreement in Vipps; on success marks it STOPPED with today's cancellation date in
 * our DB and sends the change notification.
 * @returns Whether Vipps accepted the change
 */
export async function cancelAgreement(agreementId: string, agreementCode: string) {
  const response: boolean = await vipps.updateAgreementStatus(agreementId, "STOPPED");

  if (response) {
    await DAO.vipps.updateAgreementStatus(agreementId, "STOPPED");
    await DAO.vipps.updateAgreementCancellationDate(agreementId);
    await mail.sendVippsAgreementChange(agreementCode, "STOPPED");
  }

  return response;
}

/**
 * Updates the agreement price in Vipps; on success updates our DB (in NOK) and sends the
 * change notification.
 * @param priceOre The new monthly price in øre
 * @returns Whether Vipps accepted the change
 */
export async function updateAgreementPrice(
  agreementId: string,
  agreementCode: string,
  priceOre: number,
) {
  const response: boolean = await vipps.updateAgreementPrice(agreementId, priceOre);

  // Only update database if Vipps update was successful
  if (response) {
    await DAO.vipps.updateAgreementPrice(agreementId, priceOre / 100);
    await mail.sendVippsAgreementChange(agreementCode, "AMOUNT", priceOre / 100);
  }

  return response;
}

/**
 * Updates the monthly charge day in our DB (charges are created by our scheduler) and sends
 * the change notification. The caller validates the range (0 = last day of month, max 28).
 */
export async function updateAgreementChargeDay(
  agreementId: string,
  agreementCode: string,
  chargeDay: number,
) {
  const response = await DAO.vipps.updateAgreementChargeDay(agreementId, chargeDay);
  if (response) await mail.sendVippsAgreementChange(agreementCode, "CHARGEDAY", chargeDay);
  return response;
}

export type UpdateAgreementDistributionResult =
  | { ok: true; KID: string }
  | { ok: false; status: 400 | 404; message: string };

/**
 * Points the agreement at a distribution matching the input (reusing an existing KID or
 * creating a new distribution) and sends the change notification.
 */
export async function updateAgreementDistribution(
  agreementId: string,
  agreementCode: string,
  distributionInput: DistributionInput,
): Promise<UpdateAgreementDistributionResult> {
  const existingAgreement = await DAO.vipps.getAgreement(agreementId);
  if (!existingAgreement) {
    return { ok: false, status: 404, message: "Agreement not found" };
  }

  const donorId = await DAO.donors.getIDByAgreementCode(agreementCode);

  let validatedDistribution: DistributionInput;
  try {
    validatedDistribution = validateDistribution(distributionInput);
  } catch (ex) {
    return { ok: false, status: 400, message: ex.message };
  }

  if (validatedDistribution.donorId !== donorId) {
    return { ok: false, status: 400, message: "Donor ID mismatch" };
  }

  let KID: string;

  /**
   * Check for existing distribution
   */
  const existingDistributionKID = await DAO.distributions.getKIDbySplit(validatedDistribution);

  if (existingDistributionKID) {
    KID = existingDistributionKID;
  } else {
    KID = await donationHelpers.createKID();
    await DAO.distributions.add({ ...validatedDistribution, kid: KID });
  }

  const response = await DAO.vipps.updateAgreementKID(agreementId, KID);
  if (response) await mail.sendVippsAgreementChange(agreementCode, "SHARES", KID);

  return { ok: true, KID };
}

/**
 * Refunds a charge in Vipps; on success marks it REFUNDED in our DB.
 * @returns Whether Vipps accepted the refund
 */
export async function refundCharge(agreementId: string, chargeId: string) {
  const response: boolean = await vipps.refundCharge(agreementId, chargeId);
  if (response) await DAO.vipps.updateChargeStatus("REFUNDED", agreementId, chargeId);
  return response;
}

export type MatchingRuleInput = {
  salesLocation: string | null;
  message: string | null;
  periodFrom: string;
  periodTo: string;
  resolveKID: string;
  precedence: number | null;
};

export type CreateMatchingRuleResult =
  | { ok: true; result: number | false }
  | { ok: false; status: 400; message: string };

/**
 * Validates and inserts a Vipps matching rule. The caller checks that resolveKID, periodFrom
 * and periodTo are present.
 * @returns On success, the DAO result: the new rule id, or false if the insert failed
 */
export async function createMatchingRule(
  matchingRule: MatchingRuleInput,
): Promise<CreateMatchingRuleResult> {
  const invalid = await validateMatchingRule(matchingRule);
  if (invalid) return invalid;

  const result = await DAO.vipps.addMatchingRule(matchingRule);
  return { ok: true, result };
}

type MatchingRuleValidationError = { ok: false; status: 400; message: string };

/** The period must be ordered and resolveKID must be an existing distribution */
async function validateMatchingRule(
  matchingRule: MatchingRuleInput,
): Promise<MatchingRuleValidationError | null> {
  if (matchingRule.periodFrom >= matchingRule.periodTo) {
    return { ok: false, status: 400, message: "periodFrom must be before periodTo" };
  }

  // Validate resolveKID
  const exists = await DAO.distributions.KIDexists(matchingRule.resolveKID);
  if (!exists) {
    return {
      ok: false,
      status: 400,
      message: `Distribution with KID ${matchingRule.resolveKID} does not exist`,
    };
  }
  return null;
}

export type UpdateMatchingRuleResult =
  | { ok: true }
  | MatchingRuleValidationError
  | { ok: false; status: 404; message: string };

/** Validates like createMatchingRule and replaces the fields of an existing rule */
export async function updateMatchingRule(
  id: number,
  matchingRule: MatchingRuleInput,
): Promise<UpdateMatchingRuleResult> {
  const invalid = await validateMatchingRule(matchingRule);
  if (invalid) return invalid;

  if (!(await DAO.vipps.updateMatchingRule(id, matchingRule))) {
    return { ok: false, status: 404, message: "Matching rule not found" };
  }
  return { ok: true };
}
