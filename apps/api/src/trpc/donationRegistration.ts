import { TRPCError } from "@trpc/server";
import { DAO } from "../custom_modules/DAO";
import { confirmDonation, createDistribution } from "../custom_modules/donationsService";
import { assertDistributionReferences } from "./distributionChecks";
import type { DistributionInputSchema } from "./schemas/common";

const errorMessage = (ex: unknown) => (ex instanceof Error ? ex.message : String(ex));

const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });

export const assertPaymentMethodExists = async (paymentId: number) => {
  const methods = await DAO.payment.getMethods();
  if (!methods?.some((method) => method.id === paymentId)) {
    throw badRequest(`Payment method ${paymentId} does not exist`);
  }
};

export const assertDataOwnerExists = async (metaOwnerId: number) => {
  const owners = await DAO.meta.getDataOwners();
  if (!owners.some((owner) => owner.id === metaOwnerId)) {
    throw badRequest(`Data owner ${metaOwnerId} does not exist`);
  }
};

/**
 * PaymentExternal_ID is unique across all payment methods, so any existing donation with the
 * reference conflicts (the DAO's own check only looks at the same payment method).
 */
export const assertExternalRefUnused = async (externalRef: string) => {
  if (await DAO.donations.externalRefExists(externalRef)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `A donation with external reference ${externalRef} already exists`,
    });
  }
};

export type RegisterDonationInput = {
  /** Exactly one of KID and distribution */
  KID?: string;
  distribution?: DistributionInputSchema;
  sum: number;
  /** ISO date or date-time */
  timestamp: string;
  paymentId: number;
  paymentExternalRef: string | null;
  metaOwnerId: number;
  sendReceipt: boolean;
};

/**
 * Registers a confirmed donation, either on an existing KID or on a distribution created (or
 * matched by split) first. Used by donations.register and reports.reviewQueue.register.
 */
export async function registerDonation(input: RegisterDonationInput) {
  await assertPaymentMethodExists(input.paymentId);
  await assertDataOwnerExists(input.metaOwnerId);
  if (input.paymentExternalRef !== null) {
    await assertExternalRefUnused(input.paymentExternalRef);
  }

  let KID: string;
  let newDistribution = false;
  if (input.distribution) {
    await assertDistributionReferences(input.distribution);
    ({ KID, newDistribution } = await createDistribution(input.distribution, input.metaOwnerId));
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
}
