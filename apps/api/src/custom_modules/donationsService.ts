import { DAO } from "./DAO";
import { donationHelpers } from "./donationHelpers";
import { validateDistribution } from "./distribution";
import { sendDonationReceipt } from "./mail";
import { Distribution, DistributionInput } from "../schemas/types";

const config = require("../config");

/**
 * Finds the KID of an existing distribution with the same split, or creates a new
 * distribution with a fresh KID. Shared by POST /distributions and the tRPC procedures.
 * Throws if the distribution is invalid (see validateDistribution).
 */
export async function createDistribution(
  distribution: DistributionInput,
  metaOwnerId: number | null = null,
): Promise<{ KID: string; newDistribution: boolean }> {
  const validatedDistribution = validateDistribution(distribution);

  const existing = await DAO.distributions.getKIDbySplit(validatedDistribution);

  if (existing) {
    return { KID: existing, newDistribution: false };
  }

  const KID = await donationHelpers.createKID();

  await DAO.distributions.add(
    {
      kid: KID,
      ...validatedDistribution,
    },
    metaOwnerId,
  );

  return { KID, newDistribution: true };
}

/**
 * Registers a confirmed donation on an existing KID, optionally sending a receipt
 * (receipts are only sent in production). Shared by POST /donations/confirm and tRPC.
 * @returns The new donation id
 */
export async function confirmDonation(donation: {
  KID: string;
  paymentMethodId: number;
  sum: number;
  timestamp: Date;
  externalRef: string | null;
  metaOwnerId: number | null;
  sendReceipt: boolean;
}): Promise<number> {
  const donationID = await DAO.donations.add(
    donation.KID,
    donation.paymentMethodId,
    donation.sum,
    donation.timestamp,
    donation.externalRef,
    donation.metaOwnerId,
  );

  if (config.env === "production" && donation.sendReceipt) await sendDonationReceipt(donationID);

  return donationID;
}

type ExistingDonation = Awaited<ReturnType<typeof DAO.donations.getByID>>;

/**
 * Updates a donation's fields and, if a distribution is given, moves the donation to the
 * KID matching that distribution (reusing an existing KID with the same split, or creating a
 * new one). Fundraiser KIDs are kept and their cause areas updated in place.
 * Shared by PUT /donations/:id and tRPC.
 */
export async function updateDonation(
  existingDonation: ExistingDonation,
  changes: {
    paymentId?: number;
    paymentExternalRef?: string;
    sum?: number;
    transactionCost?: number;
    timestamp?: Date;
    metaOwnerId?: number;
  },
  distribution?: Distribution | DistributionInput,
): Promise<void> {
  const donationId: number = existingDonation.id;

  await DAO.donations.update({
    id: donationId,
    ...changes,
  });

  if (distribution) {
    const validatedDistribution = validateDistribution(distribution);

    if (!("kid" in validatedDistribution)) {
      throw new Error("Distribution does not have a KID");
    }

    // Check if the existing donation has a fundraiser distribution
    const existingDistribution = await DAO.distributions.getSplitByKID(existingDonation.KID);

    if (existingDistribution?.fundraiserTransactionId) {
      // For fundraiser donations, keep the same KID but update the cause areas
      // Fundraiser KIDs are unique per donation and linked to a specific fundraiser transaction
      await DAO.distributions.updateCauseAreas(
        existingDonation.KID,
        validatedDistribution.causeAreas,
      );
    } else {
      // For non-fundraiser donations, use the existing KID consolidation logic
      const existingBySplitKID = await DAO.distributions.getKIDbySplit(validatedDistribution);

      if (existingBySplitKID != null && existingBySplitKID === validatedDistribution.kid) {
        // No change
      } else if (existingBySplitKID != null) {
        // Use an existing KID for a distribution matching the split
        await DAO.donations.updateKIDById(donationId, existingBySplitKID);
      } else {
        // Create a new KID and distribution
        const newKid = await donationHelpers.createKID();
        await DAO.distributions.add({
          ...validatedDistribution,
          // Overwrite the KID with the new one
          kid: newKid,
        });
        await DAO.donations.updateKIDById(donationId, newKid);
      }
    }

    if (validatedDistribution.donorId !== existingDonation.donorId) {
      console.log("UPDATE DONOR ID");
      await DAO.donations.updateDonorId(donationId, validatedDistribution.donorId);
    }
  }
}
