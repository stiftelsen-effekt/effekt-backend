import { sendAvtaleGiroChange, sendAvtalegiroNotification } from "./mail";
import { DAO } from "./DAO";
import { DateTime } from "luxon";

const writer = require("./avtalegiro/filewriterutil");
const config = require("../config");
import workdays from "norwegian-workdays";
import { AvtaleGiroAgreement } from "./DAO_modules/avtalegiroagreements";
import { donationHelpers } from "./donationHelpers";
import { DistributionInput } from "../schemas/types";
import { requestDeletionOfUpcomingCharges } from "./avtalegiro/deletions";
import { assertDistributionOwnedBy } from "./distributionOwnership";
import { registrationFor } from "./registrationToken";
import methods from "../enums/methods";
import { WIDGET_MAX_AMOUNT } from "../trpc/shared/widget";

/**
 * Generates a claims file to claim payments for AvtaleGiro agreements
 * @param {number} shipmentID A shipment ID from the database
 * @param {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} agreements Agreements that we should claim payment from
 * @param {DateTime} dueDate Due date
 * @returns {Buffer} The file buffer
 */
export async function generateAvtaleGiroFile(shipmentID, agreements, dueDate) {
  const today = DateTime.fromJSDate(new Date());
  let fileContents = "";

  fileContents += writer.startRecordTransmission(shipmentID);

  /**
   * Claim requests
   */
  let claims: any[] = [];
  for (let i = 0; i < agreements.length; i++) {
    fileContents += writer.startRecordPaymentAssignment(i, shipmentID);

    let assignmentClaims: any[] = [];
    /**
     * Right now, we only send one transaction
     * We are able to send claims up to 12 months ahead of time
     */
    for (let transactionNumber = 1; transactionNumber <= 1; transactionNumber++) {
      const claim = agreements[i];
      const donor = await DAO.donors.getByKID(claim.KID);
      fileContents += writer.firstAndSecondLine(claim, donor, "02", transactionNumber, dueDate);
      assignmentClaims.push(claim);
    }

    fileContents += writer.endRecordPaymentAssignment(assignmentClaims, dueDate, dueDate);
    claims.push(...assignmentClaims);
  }

  /**
   * Deletion requests
   * Currently not utilized
   */

  let deletions = [];
  /*
  fileContents += writer.startRecordDeletionRequest()
  fileContents += writer.endRecordDeletionRequest(date)
  */

  fileContents += writer.endRecordTransmission(claims, deletions, dueDate);

  const fileBuffer = Buffer.from(fileContents, "utf8");

  return fileBuffer;
}

/**
 * Generates a file with deletion requests for claims we have already sent. A deletion request is the
 * original claim with transaction type 93 instead of 02, so it identifies the claim by KID, amount
 * and due date. Each deletion gets its own assignment, like the claims do.
 * @param shipmentID A shipment ID from the database
 * @param deletions The claims to delete, with amounts in øre
 * @returns The file buffer
 */
export async function generateAvtaleGiroDeletionFile(
  shipmentID: number,
  deletions: Array<{ KID: string; amount: number; dueDate: DateTime }>,
): Promise<Buffer> {
  if (deletions.length === 0) throw new Error("Cannot generate a deletion file without deletions");

  let fileContents = "";
  fileContents += writer.startRecordTransmission(shipmentID);

  for (let i = 0; i < deletions.length; i++) {
    const deletion = deletions[i];
    fileContents += writer.startRecordDeletionRequest(i, shipmentID);

    const donor = await DAO.donors.getByKID(deletion.KID);
    fileContents += writer.firstAndSecondLine(deletion, donor, "93", 1, deletion.dueDate);

    fileContents += writer.endRecordDeletionRequest([deletion], deletion.dueDate, deletion.dueDate);
  }

  const earliestDueDate = DateTime.min(...deletions.map((deletion) => deletion.dueDate));
  fileContents += writer.endRecordTransmission([], deletions, earliestDueDate);

  return Buffer.from(fileContents, "utf8");
}

/**
 * @typedef NotifyAgreementsResult
 * @property {number} success
 * @property {number} failed
 */

/**
 * Takes in agreements with a claim date three days from now
 * We are required to notify those who have chosen to be notified
 * three days in advance of any claims.
 * @param {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} agreements Agreements to notify
 * @returns {NotifyAgreementsResult}
 */
export async function notifyAgreements(agreements: AvtaleGiroAgreement[], claimDate: DateTime) {
  let result = {
    success: 0,
    failed: 0,
  };
  if (config.env === "production") {
    for (let i = 0; i < agreements.length; i++) {
      try {
        if ((await sendAvtalegiroNotification(agreements[i], claimDate)) === true) {
          result.success++;
        } else {
          result.failed++;
        }
      } catch (ex) {
        result.failed++;
      }
    }
  } else {
    result.success = agreements.length;
    result.failed = 0;
  }

  return result;
}

/**
 * @typedef UpdateAgreementsResult
 * @property {number} activated
 * @property {number} updated
 * @property {number} added
 * @property {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} failed
 */

/**
 * Takes in agreements recieved on the OCR file
 * They may either need to be created, updated or deleted
 * @param {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} agreements Agreements parsed from the OCR file
 * @returns {UpdateAgreementsResult}
 */
export async function updateAgreements(agreements) {
  /** @type {UpdateAgreementsResult} */
  let result = {
    activated: 0,
    updated: 0,
    added: 0,
    terminated: 0,
    failed: [] as any[],
  };

  for (let i = 0; i < agreements.length; i++) {
    const agreement = agreements[i];
    /**
     * It's possible to ask for a complete listing of all the
     * agreements connected to the account. If we've done so
     * we ignore those agreements (as they are already in the database)
     */
    if (!agreement.totalReadout) {
      if (agreement.isTerminated) {
        try {
          await DAO.avtalegiroagreements.cancelAgreement(agreement.KID);
          result.terminated++;
        } catch (ex) {
          console.error("Failed to cancel AvtaleGiro agreement", ex);
          result.failed.push(agreement);
        }
        continue;
      }

      const exists = await DAO.avtalegiroagreements.exists(agreement.KID);
      if (!exists) {
        /**
         * The agreement is not stored in our database. This may be the case
         * if the user has created an agreement from their own bank.
         * We then check if the user has donated to us before with the KID
         * specified. It so, we create a new agreement with tha same limit
         * and todays date as claim date.
         */
        const latestDonation = await DAO.donations.getLatestByKID(agreement.KID);

        if (latestDonation == null) {
          console.error(
            `AvtaleGiro found in file from Mastercard Payment Services, but no coresponding agreement exists in DB, and no donatinos have been made with the KID previously (${agreement.KID})`,
          );
          result.failed.push(agreement);
          continue;
        } else {
          await DAO.avtalegiroagreements.add(
            agreement.KID,
            latestDonation.sum,
            new Date(),
            agreement.notice,
          );
          result.added++;
        }
      } else {
        /**
         * The agreement does exist, and we update the agreement in the DB to
         * reflect the chosen notification setting (yes/no).
         */
        await DAO.avtalegiroagreements.updateNotification(agreement.KID, agreement.notice);
        result.updated++;
      }

      /**
       * If the agreement is not active in the database, we activate it.
       * An agreement may either be activated, changed or terminated.
       * Thus, if it is activated or changed, we know it should be active.
       */
      const active = await DAO.avtalegiroagreements.isActive(agreement.KID);
      if (!active) {
        await DAO.avtalegiroagreements.setActive(agreement.KID, true);
        result.activated++;
      }
    }
  }

  return result;
}

/**
 * A function that returns a list of due dates for payment claims
 * We are required to send claims four banking days in advance of the due date
 * Holidays and weekends are not counted as banking days
 * Takes in a date to calculate the due date from
 * @returns
 */
export function getDueDates(date: DateTime) {
  // Start iterating backwards 30 days from the date given
  // Keep going until 4 days after the date given
  // Add all the dates that have 4 banking days in between
  // Return the list of dates

  // We only send claims on banking days
  // Thus, we start by checking if the date given is a banking day
  if (!workdays.isWorkingDay(date.toJSDate())) {
    return [];
  }

  let dueDates: DateTime[] = [];
  let iterationDate = date.plus({ days: 30 });
  while (iterationDate >= date.plus({ days: 4 })) {
    let bankingDays = 0;
    let innerIterationDate = iterationDate.minus({ days: 1 });
    while (innerIterationDate >= date) {
      if (workdays.isWorkingDay(innerIterationDate.toJSDate())) {
        bankingDays++;
      }
      innerIterationDate = innerIterationDate.minus({ days: 1 });
    }

    if (bankingDays === 4) {
      dueDates.push(iterationDate);
    }

    iterationDate = iterationDate.minus({ days: 1 });
  }

  // Debug table to visualize the due dates
  // printDueDatesTable(date, dueDates);

  return dueDates;
}

/**
 * Replaces the distribution of an AvtaleGiro agreement. The current distribution is preserved
 * under a newly generated KID (keeping donation history), and the new distribution takes over
 * the agreement's original KID. Notifies the donor of the change.
 * @param KID The agreement KID
 * @param validatedDistribution A distribution that has passed validateDistribution
 */
export async function replaceAvtaleGiroDistribution(
  KID: string,
  validatedDistribution: DistributionInput,
) {
  const originalDistribution = await DAO.distributions.getSplitByKID(KID);
  await assertDistributionOwnedBy(originalDistribution.donorId, validatedDistribution);
  const newKid = await donationHelpers.createAvtaleGiroKID();
  await DAO.avtalegiroagreements.replaceDistribution(
    originalDistribution,
    newKid,
    validatedDistribution,
  );
  await sendAvtaleGiroChange(KID, "SHARES");
}

/**
 * Sets the active status of an AvtaleGiro agreement, notifying the donor on cancellation
 * (only when active is exactly 0, as sent by the REST API and the admin).
 *
 * Cancelling also requests deletion of claims already sent to MPS, where there's still time.
 * Reactivating takes back deletion requests that haven't been sent yet.
 */
export async function setAvtaleGiroStatus(KID: string, active: unknown) {
  const response = await DAO.avtalegiroagreements.setActive(KID, active);

  if (active === 0 || active === false) {
    // A failure here must not stop the cancellation
    try {
      const { deletable, tooLate } = await requestDeletionOfUpcomingCharges(KID, DateTime.now());
      if (deletable.length > 0 || tooLate.length > 0) {
        console.log(
          `AvtaleGiro ${KID} cancelled: deleting claims due ${deletable
            .map((charge) => charge.dueDate)
            .join(", ")}; too late for ${tooLate.map((charge) => charge.dueDate).join(", ")}`,
        );
      }
    } catch (ex) {
      console.error("Failed to request deletion of AvtaleGiro claims for %s", KID, ex);
    }
  } else if (active === 1 || active === true) {
    // Deletions not yet sent are no longer wanted
    await DAO.avtalegirocharges.restoreDeletionRequestsByKID(KID);
  }

  if (active === 0) await sendAvtaleGiroChange(KID, "CANCELLED");
  return response;
}

/**
 * Updates the amount of an AvtaleGiro agreement and notifies the donor
 * @param amount The new amount in øre
 */
export async function updateAvtaleGiroAmount(KID: string, amount: any) {
  const response = await DAO.avtalegiroagreements.updateAmount(KID, amount);
  const newAmountInNok = parseFloat(amount) / 100;
  await sendAvtaleGiroChange(KID, "AMOUNT", newAmountInNok.toString());
  return response;
}

/**
 * Updates the payment date (day of month, 0 = last day) of an AvtaleGiro agreement and notifies the donor
 */
export async function updateAvtaleGiroPaymentDate(KID: string, paymentDate: any) {
  const response = await DAO.avtalegiroagreements.updatePaymentDate(KID, paymentDate);
  await sendAvtaleGiroChange(KID, "CHARGEDAY", paymentDate);
  return response;
}

export type WidgetDraftResult = { ok: true } | { ok: false; status: 400 | 403; message: string };

/**
 * Drafts an AvtaleGiro agreement for a KID the widget just registered, before the donor signs it
 * at Mastercard Payment Services (REST POST /avtalegiro/draft and tRPC widget.draftAvtaleGiro).
 *
 * Only for a KID registered for AvtaleGiro by the same client in the last couple of hours (the
 * registrationToken from registerDonation) that has no agreement yet. Sending the draft again
 * for that KID, as the widget does when the donor retries, updates the draft.
 *
 * @param amountKroner The monthly amount in NOK, as the widget sends it; stored in øre
 * @param dueDay Day of the month, 0 = last day
 */
export async function draftAvtaleGiroAgreement(
  KID: string,
  amountKroner: number,
  dueDay: number,
  registrationToken: unknown,
): Promise<WidgetDraftResult> {
  if (!registrationFor(registrationToken, KID, [methods.AVTALEGIRO])) {
    return { ok: false, status: 403, message: "Not a new AvtaleGiro registration" };
  }

  const amount = Math.round(amountKroner * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > WIDGET_MAX_AMOUNT * 100) {
    return { ok: false, status: 400, message: "Invalid amount" };
  }
  if (!Number.isInteger(dueDay) || dueDay < 0 || dueDay > 28) {
    return { ok: false, status: 400, message: "Invalid due day" };
  }

  let existing = await DAO.avtalegiroagreements.getDraftState(KID);
  if (existing.rows === 0) {
    try {
      if (await DAO.avtalegiroagreements.addDraftIfNone(KID, amount, dueDay)) return { ok: true };
    } catch (ex: any) {
      // A concurrent draft for the same KID (a double click) won the race
      if (ex?.code !== "ER_LOCK_DEADLOCK" && ex?.code !== "ER_DUP_ENTRY") throw ex;
    }
    existing = await DAO.avtalegiroagreements.getDraftState(KID);
  }

  // The same registration sending its draft again (a retry, or the donor going back to change the
  // due day before signing at Mastercard Payment Services): the one draft row is updated, never a
  // second added. A KID whose agreement is or has been active is never touched.
  if (existing.draft) {
    await DAO.avtalegiroagreements.updateDraft(KID, amount, dueDay);
    return { ok: true };
  }
  return { ok: false, status: 403, message: "Not a new AvtaleGiro registration" };
}
