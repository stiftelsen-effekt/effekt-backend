import { DateTime } from "luxon";
import type { PoolConnection } from "mysql2/promise";

import writer from "./autogiro/filewriterutil";
import config from "../config";
import { AutoGiro_agreements, AutoGiro_mandates } from "@prisma/client";
import { AutoGiroContent, AutoGiroParser } from "./parsers/autogiro";
import { DAO } from "./DAO";
import paymentMethods from "../enums/paymentMethods";
import {
  AutoGiroMandateCancelledInformationCodes,
  AutoGiroMandateCommentaryCodes,
  AutoGiroMandateInformationCodes,
  AutogiroMandateFailedCommentaryCodes,
} from "./parsers/autogiro/mandates";
import { RequestLocale } from "../middleware/locale";
import { isSwedishWorkingDay } from "./swedish-workdays";
import {
  AutoGiroIncomingPaymentRecord,
  AutoGiroPaymentStatusCode,
  autogiroPaymentStatusCodeToStringExplenation,
} from "./parsers/autogiro/transactions";
import { AutogiroChargeToBeAmended } from "./DAO_modules/autogiroagreements";
import { donationHelpers } from "./donationHelpers";
import { DistributionInput } from "../schemas/types";
import { assertDistributionOwnedBy } from "./distributionOwnership";

/**
 * Generates a claims file to claim payments for AutoGiro agreements
 * @param shipmentID A shipment ID from the database
 * @param agreements Agreements that we should claim payment from
 * @param mandatesToBeConfirmed New mandates that need confirmation
 * @param transaction All writes (charges, charge and mandate statuses) go through this transaction
 * @returns {Buffer} The file buffer
 */
async function generateAutogiroGiroFile(
  shipmentID: number,
  agreementsToClaim: {
    agreement: AutoGiro_agreements;
    claimDate: DateTime;
  }[],
  chargesToBeAmended: AutogiroChargeToBeAmended[],
  mandatesToBeConfirmed: AutoGiro_mandates[],
  transaction: PoolConnection,
) {
  const today = DateTime.fromJSDate(new Date());
  let fileContents = "";

  fileContents += writer.getOpeningRecord(
    today,
    config.autogiro_customer_number!,
    config.autogiro_bankgiro_number!,
  );
  fileContents += "\n";

  /**
   * Withdrawal requests
   */
  for (const agreementClaim of agreementsToClaim) {
    // Check for existing charges
    const existingCharge = await DAO.autogiroagreements.getAgreementChargeByAgreementIdAndClaimDate(
      agreementClaim.agreement.ID,
      agreementClaim.claimDate,
    );

    if (existingCharge) {
      console.log(
        `Skipping charge for agreement with KID ${
          agreementClaim.agreement.KID
        } and claim date ${agreementClaim.claimDate.toISO()} as it already exists with ID ${
          existingCharge.ID
        }`,
      );
      continue;
    }

    // Create a charge record for each agreement
    const chargeId = await DAO.autogiroagreements.addAgreementCharge(
      {
        agreementID: agreementClaim.agreement.ID,
        shipmentID: shipmentID,
        status: "PENDING",
        claim_date: agreementClaim.claimDate.toJSDate(),
        amount: agreementClaim.agreement.amount.toString(),
        donationID: null,
      },
      transaction,
    );

    fileContents += writer.getWithdrawalRecord(
      agreementClaim.claimDate,
      agreementClaim.agreement.KID,
      config.autogiro_bankgiro_number!,
      agreementClaim.agreement.amount * 100, // Agreement amount in øre
      chargeId.toString(),
    );
    fileContents += "\n";
  }

  const newChargesAfterAmendmentLines: string[] = [];
  const cancelledChargesAfterAmendmentLines: string[] = [];
  for (const chargeToBeAmended of chargesToBeAmended) {
    /**
     * First we cancel the existing charge
     */
    const charge = await DAO.autogiroagreements.getAgreementChargeById(chargeToBeAmended.chargeId);
    if (!charge) {
      console.log(`Could not find charge with ID ${chargeToBeAmended.chargeId}`);
      continue;
    }

    if (charge.status !== "PENDING") {
      console.log(`Charge with ID ${charge.ID} has already been completed, skipping`);
      continue;
    }

    cancelledChargesAfterAmendmentLines.push(
      writer.getCancellationRecord(charge, chargeToBeAmended.KID),
    );

    if (chargeToBeAmended.agreementCancelled) {
      // Set charge status to cancelled
      await DAO.autogiroagreements.cancelAgreementCharge(charge.ID, transaction);
      // For cancelled agreements, we don't need to create a new charge
      continue;
    } else {
      // Set charge status to amended
      await DAO.autogiroagreements.setAgreementChargeAmended(charge.ID, transaction);
    }

    /**
     * Then we create a new charge, if the agreement was not cancelled
     */
    let today = DateTime.fromJSDate(new Date());
    let newClaimDate: DateTime;
    if (chargeToBeAmended.agreementDay === 0) {
      // End of month
      newClaimDate = today.endOf("month");
      if (getSeBankingDaysBetweenDates(today, newClaimDate) < 1) {
        newClaimDate = newClaimDate.plus({ days: 1 }).endOf("month");
      }
    } else {
      newClaimDate = today.set({ day: chargeToBeAmended.agreementDay });
      if (getSeBankingDaysBetweenDates(today, newClaimDate) < 1) {
        newClaimDate = newClaimDate.plus({ months: 1 });
      }
    }

    const newChargeId = await DAO.autogiroagreements.addAgreementCharge(
      {
        agreementID: chargeToBeAmended.agreementId,
        shipmentID: shipmentID,
        status: "PENDING",
        claim_date: newClaimDate.toJSDate(),
        amount: chargeToBeAmended.agreementAmount.toString(),
        donationID: null,
      },
      transaction,
    );

    newChargesAfterAmendmentLines.push(
      writer.getWithdrawalRecord(
        newClaimDate,
        chargeToBeAmended.KID,
        config.autogiro_bankgiro_number!,
        chargeToBeAmended.agreementAmount * 100, // Agreement amount in øre
        newChargeId.toString(),
      ),
    );
  }

  // Add the new charges for amended charges
  if (newChargesAfterAmendmentLines.length > 0) {
    fileContents += newChargesAfterAmendmentLines.join("\n") + "\n";
  }

  // Add the cancelled charges after amendment
  if (cancelledChargesAfterAmendmentLines.length > 0) {
    fileContents += cancelledChargesAfterAmendmentLines.join("\n") + "\n";
  }

  /**
   * Mandates that need confirmation
   */
  for (const mandate of mandatesToBeConfirmed) {
    try {
      const taxUnit = await DAO.tax.getByKID(mandate.KID, RequestLocale.SV);

      fileContents += writer.getMandateConfirmationRecord(
        mandate,
        taxUnit,
        config.autogiro_bankgiro_number!,
      );
      fileContents += "\n";
    } catch (ex) {
      console.error(ex);
      console.log(`Failed to add mandate confirmation record for mandate with KID ${mandate.KID}`);
      continue;
    }

    await DAO.autogiroagreements.setMandateStatus(mandate.ID, "PENDING", transaction);
  }

  const fileBuffer = Buffer.from(fileContents, "utf8");

  return fileBuffer;
}

export async function processAutogiroInputFile(fileContents: string) {
  const parsedFile = AutoGiroParser.parse(fileContents);

  if (parsedFile.reportContents === AutoGiroContent.PAYMENT_SPECIFICATION_AND_STOP) {
    /**
     * AutoGiro payments
     */
    let valid = 0;
    let invalid = 0;
    const invalidTransactions: {
      reason: ProcessAutogiroPaymentResult["reason"];
      transaction: NonNullable<ProcessAutogiroPaymentResult["transaction"]>;
    }[] = [];
    const unapprovedPayments: AutoGiroIncomingPaymentRecord[] = [];

    for (const deposit of parsedFile.deposits) {
      const approvedPayments = deposit.payments.filter(
        (payment) => payment.paymentStatusCode === AutoGiroPaymentStatusCode.APPROVED,
      );
      unapprovedPayments.push(
        ...deposit.payments.filter(
          (payment) => payment.paymentStatusCode !== AutoGiroPaymentStatusCode.APPROVED,
        ),
      );

      const promises = approvedPayments.map((payment) =>
        processAutogiroDeposit(payment, parsedFile.openingRecord.dateWritten),
      );
      const results = await Promise.allSettled(promises);
      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value.valid) {
            valid++;
          } else {
            invalid++;
            if (result.value.transaction) {
              invalidTransactions.push({
                reason: result.value.reason,
                transaction: result.value.transaction,
              });
            }
          }
        } else {
          invalid++;
          console.error(result.reason);
        }
      }
    }

    const importLogId = await DAO.logging.add("Autogiro - Payments BAG", {
      valid,
      invalid: invalidTransactions.length,
      ignored: invalid - invalidTransactions.length,
      unapprovedPayments: unapprovedPayments.map((p) => ({
        reason: autogiroPaymentStatusCodeToStringExplenation(p.paymentStatusCode),
        payment: p,
      })),
      file: fileContents,
    });

    return {
      openingRecord: parsedFile.openingRecord,
      /** The "Autogiro - Payments BAG" log entry */
      importLogId,
      results: {
        valid,
        invalid,
        invalidTransactions,
      },
    };
  } else if (parsedFile.reportContents === AutoGiroContent.CANCELLATION_AND_AMENDMENT) {
    /**
     * Autogiro payment cancellation and amendments
     */

    for (const cancellation of parsedFile.cancellations) {
      console.log("Cancellation", cancellation.reference, cancellation.commentCode);
      try {
        const charge = await DAO.autogiroagreements.getAgreementChargeById(
          parseInt(cancellation.reference),
        );
        if (!charge) {
          console.log(`Could not find charge with ID ${cancellation.reference} to cancel`);
          continue;
        }

        await DAO.autogiroagreements.cancelAgreementCharge(charge.ID);

        console.log(
          `Cancelled charge with ID ${charge.ID} with comment code ${cancellation.commentCode}`,
        );
      } catch (ex) {
        console.error(ex);
        console.log(
          `Failed to cancel charge with ID ${cancellation.reference} with comment code ${cancellation.commentCode}`,
        );
      }
    }

    for (const amendment of parsedFile.amendments) {
      console.error("Autogiro charge amendments not supported");
    }
  } else if (parsedFile.reportContents === AutoGiroContent.E_MANDATES) {
    /**
     * New e-mandates
     */
    let valid = 0;
    let invalid = 0;
    let ignored = 0;

    for (const emandate of parsedFile.emandates) {
      try {
        const validKID = await getValidatedKID(emandate.payerNumber);

        const taxUnit = await DAO.tax.getByKID(validKID, RequestLocale.SV);
        if (emandate.payerSsn && !taxUnit) {
          try {
            const donor = await DAO.donors.getByKID(validKID);
            if (!donor) throw new Error(`Could not find donor with KID ${validKID}`);
            const taxUnitId = await DAO.tax.addTaxUnit(donor.id, emandate.payerSsn, donor.name!);
            await DAO.distributions.setTaxUnit(validKID, taxUnitId);
          } catch (ex) {
            console.log(ex);
            console.error(
              `Failed to add tax unit for donor with KID ${validKID} based on e-mandate`,
            );
            // If we can't add the tax unit, we won't be able to send a confirmation file for the mandate
            // Therefore we fail fast here
            continue;
          }
        }

        const existingMandage = await DAO.autogiroagreements.getMandateByKID(validKID);

        if (!existingMandage) {
          await DAO.autogiroagreements.addMandate({
            KID: validKID,
            name_and_address: emandate.information.payerNameAndAddress,
            postal_code: emandate.information.postNumber,
            postal_label: emandate.information.postAddress,
            special_information: emandate.information.specialInformation,
            status: "NEW",
            bank_account: emandate.payerBankAccountNumber,
          });
          valid++;
          continue;
        } else if (existingMandage.status === "DRAFTED") {
          await DAO.autogiroagreements.updateMandate({
            ID: existingMandage.ID,
            KID: validKID,
            name_and_address: emandate.information.payerNameAndAddress,
            postal_code: emandate.information.postNumber,
            postal_label: emandate.information.postAddress,
            special_information: emandate.information.specialInformation,
            status: "NEW",
            bank_account: emandate.payerBankAccountNumber,
          });
          valid++;
          continue;
        } else {
          console.log(
            `Mandate with KID ${validKID} already exists with status ${existingMandage.status}, skipping`,
          );
          ignored++;
          continue;
        }
      } catch (ex) {
        console.error(ex);
        console.log(`Failed to add mandate with KID ${emandate.payerNumber}`);
      }
    }

    await DAO.logging.add("Autogiro - e-mandates BGE", {
      valid,
      invalid,
      ignored,
      file: fileContents,
    });
  } else if (parsedFile.reportContents === AutoGiroContent.MANDATES) {
    /**
     * Status updates on mandate from the bank
     * Can be cancelled mandates, or confirmations of new mandates
     */
    let confirmed = 0;
    let rejected = 0;
    let cancelled = 0;
    let invalid = 0;
    const invalidMandates: {
      KID: string;
      informationCode: AutoGiroMandateInformationCodes;
      commentaryCode: AutoGiroMandateCommentaryCodes;
      message: any;
    }[] = [];
    for (const mandate of parsedFile.mandates) {
      try {
        const KID = await getValidatedKID(mandate.payerNumber);

        if (AutoGiroMandateCancelledInformationCodes.some((c) => c === mandate.informationCode)) {
          // Mandate cancellation or deletion
          try {
            const dbMandate = await DAO.autogiroagreements.getMandateByKID(KID);
            await DAO.autogiroagreements.cancelMandate(dbMandate!.ID);
            console.log(
              `Cancelled mandate with KID ${KID} with information code ${mandate.informationCode} and comment code ${mandate.commentaryCode}`,
            );
            // Set agreement status to stopped
            await DAO.autogiroagreements.cancelAgreementByKID(dbMandate!.KID);

            cancelled++;
          } catch (ex) {
            console.error(ex);
            console.log(
              `Failed to cancel mandate with KID ${KID} with information code ${mandate.informationCode} and comment code ${mandate.commentaryCode}`,
            );
            invalid++;
            invalidMandates.push({
              KID: mandate.payerNumber,
              informationCode: mandate.informationCode,
              commentaryCode: mandate.commentaryCode,
              message: ex.message,
            });
            continue;
          }
        } else if (
          mandate.informationCode === AutoGiroMandateInformationCodes.ADDITION ||
          mandate.informationCode === AutoGiroMandateInformationCodes.BANK_RESPONSE_FOR_NEW_MANDATE
        ) {
          if (mandate.commentaryCode === AutoGiroMandateCommentaryCodes.NEW_MANDATE) {
            // New mandate accepted, either the bank confirms a mandate or we've successfully added a mandate
            try {
              const dbMandate = await DAO.autogiroagreements.getMandateByKID(KID);
              await DAO.autogiroagreements.activateMandate(dbMandate!.ID);
              console.log(`Updated mandate with KID ${KID} and ID ${dbMandate!.ID} to ACTIVE`);
              await DAO.autogiroagreements.activateAgreementByKID(dbMandate!.KID);
              console.log(`Updated agreement with KID ${KID} to ACTIVE`);

              confirmed++;
            } catch (ex) {
              console.error(ex);
              console.log(`Failed to update mandate with KID ${KID} to ACTIVE`);
              invalid++;
              invalidMandates.push({
                KID: mandate.payerNumber,
                informationCode: mandate.informationCode,
                commentaryCode: mandate.commentaryCode,
                message: ex.message,
              });
              continue;
            }
          } else if (
            AutogiroMandateFailedCommentaryCodes.some((c) => c === mandate.commentaryCode)
          ) {
            // Mandate addition failed
            try {
              const dbMandate = await DAO.autogiroagreements.getMandateByKID(KID);
              await DAO.autogiroagreements.setMandateStatus(dbMandate!.ID, "REJECTED");
              console.log(
                `Updated mandate with KID ${KID} and ID ${
                  dbMandate!.ID
                } to REJECTED with commentary code ${mandate.commentaryCode}`,
              );
              rejected++;
            } catch (ex) {
              console.error(ex);
              console.log(`Failed to update mandate with KID ${KID} to REJECTED`);
              invalid++;
              invalidMandates.push({
                KID: mandate.payerNumber,
                informationCode: mandate.informationCode,
                commentaryCode: mandate.commentaryCode,
                message: ex.message,
              });
              continue;
            }
          }
        }
      } catch (ex) {
        invalid++;
        console.error(ex);
        invalidMandates.push({
          KID: mandate.payerNumber,
          informationCode: mandate.informationCode,
          commentaryCode: mandate.commentaryCode,
          message: ex.message,
        });
      }
    }

    await DAO.logging.add("Autogiro - mandates BAM", {
      confirmed,
      invalid,
      rejected,
      cancelled,
      file: fileContents,
    });

    return {
      openingRecord: parsedFile.openingRecord,
      results: {
        confirmed,
        cancelled,
        invalid,
        rejected,
        invalidMandates,
      },
    };
  } else if (parsedFile.reportContents === AutoGiroContent.REJECTED_CHARGES) {
    /**
     * Rejected charges
     */
    let rejectedCharges = 0;
    let failedRejectedCharges = 0;
    for (const charge of parsedFile.rejectedCharges) {
      try {
        const dbCharge = await DAO.autogiroagreements.getAgreementChargeById(
          charge.paymentReference,
        );

        if (!dbCharge) {
          console.log(`Could not find charge with reference ${charge.paymentReference}`);
          rejectedCharges++;
          continue;
        }

        if (dbCharge.status === "FAILED") {
          // Ignore charges that are already marked as failed
          continue;
        }

        await DAO.autogiroagreements.setAgreementChargeFailed(dbCharge.ID);
        console.log(`Updated charge with reference ${charge.paymentReference} to FAILED`);
        rejectedCharges++;
      } catch (ex) {
        console.error(ex);
        console.log(`Failed to update charge with reference ${charge.paymentReference}`);
        failedRejectedCharges++;
      }
    }

    return {
      openingRecord: parsedFile.openingRecord,
      results: {
        rejectedCharges,
        failedRejectedCharges,
      },
    };
  }

  return parsedFile;
}

type ProcessAutogiroPaymentResult = {
  valid: boolean;
  reason?: string;
  transaction?: {
    KID: string;
    transactionID: string;
    paymentID: number;
    amount: number;
    date: Date;
  };
};
export const processAutogiroDeposit = async (
  payment,
  reportDate,
): Promise<ProcessAutogiroPaymentResult> => {
  const paymentReference: string = payment.paymentReference.trim();
  // Donations recorded before charges were deduplicated used this key, which includes the
  // report date, so the same payment in two reports got two keys. It is still checked so that
  // re-uploading an old report doesn't add its payments again.
  const legacyReference = `autogiro.${reportDate.toFormat("yyyyMMdd")}.${paymentReference}`;
  let reference = legacyReference;
  try {
    const KID = await getValidatedKID(payment.payerNumber);

    let date = DateTime.fromFormat(payment.paymentDate, "yyyyMMdd").toJSDate();

    // The payment reference is the charge ID for claims sent by us. Early 2024 payments had
    // references from before that, so the charge is only used if it is this payer's agreement.
    const charge = await findChargeForPayment(paymentReference, KID);

    try {
      if (charge) {
        if (charge.status === "COMPLETED") {
          console.log(`Ignoring payment for charge ${charge.ID}, which is already completed`);
          return { valid: false, reason: "EXISTING_DONATION" };
        }
        if (await DAO.donations.externalPaymentIDExists(legacyReference, paymentMethods.autoGiro)) {
          throw new Error(`EXISTING_DONATION | ${legacyReference}`);
        }
        // One key per charge, whichever report it comes in
        reference = `autogiro.charge.${charge.ID}`;
        const donationID = await DAO.autogiroagreements.completeAgreementChargeWithDonation(
          charge.ID,
          { KID, amount: payment.amount / 100, date, externalPaymentID: reference },
        );
        if (donationID === null) {
          return { valid: false, reason: "EXISTING_DONATION" };
        }
      } else {
        await DAO.donations.add(
          KID,
          paymentMethods.autoGiro,
          payment.amount / 100,
          date,
          legacyReference,
        );
      }

      return {
        valid: true,
      };
    } catch (ex) {
      if (ex.message.indexOf("EXISTING_DONATION") !== -1) {
        console.log(
          `Ignoring duplicate donation for KID ${payment.payerNumber} with reference ${reference}`,
        );
        return {
          valid: false,
          reason: "EXISTING_DONATION",
        };
      } else {
        throw ex;
      }
    }
  } catch (ex) {
    console.error(ex);
    let date = DateTime.fromFormat(payment.paymentDate, "yyyyMMdd").toJSDate();
    return {
      valid: false,
      reason: ex.message,
      transaction: {
        KID: payment.payerNumber,
        transactionID: reference,
        paymentID: paymentMethods.autoGiro,
        amount: payment.amount,
        date: date,
      },
    };
  }
};

async function findChargeForPayment(paymentReference: string, KID: string) {
  if (!/^\d+$/.test(paymentReference)) return undefined;
  const charge = await DAO.autogiroagreements.getAgreementChargeById(parseInt(paymentReference));
  if (!charge) return undefined;
  const agreement = await DAO.autogiroagreements.getAgreementById(charge.agreementID);
  return agreement?.KID === KID ? charge : undefined;
}

const getValidatedKID = async (KID: string) => {
  let returnKID = KID;
  let exists = await DAO.distributions.KIDexists(returnKID);
  if (exists) {
    return returnKID;
  }

  // Check if we have the kid when we remove leading zeros
  returnKID = parseInt(KID.trim()).toString();
  exists = await DAO.distributions.KIDexists(returnKID);
  if (exists) {
    return returnKID;
  }

  // Check if we find a KID that starts with the KID we have
  // The banks sometimes omit the last digit
  // If there is only one KID in the database that is one digit longer than the KID we have, we assume that is the correct KID
  const matchingKids = await DAO.distributions.getKIDsByPrefix(returnKID);
  const oneLonger = matchingKids.filter((kid) => kid.length === returnKID.length + 1);
  if (oneLonger.length === 1) {
    return oneLonger[0];
  }

  console.log(`KID ${returnKID} not found in distributions`);
  throw new Error(`KID ${returnKID} not found in distributions`);
};

/**
 * Returns the number of banking days between two dates
 */
export function getSeBankingDaysBetweenDates(start: DateTime, end: DateTime) {
  if (start > end) {
    throw new Error("Start date must be before end date");
  }
  if (start.equals(end)) {
    return 0;
  }

  let dueDates = 0;
  let currentDate = start.plus({ days: 1 }); // Skip the first day, as we're counting the days between the two dates
  while (currentDate < end) {
    if (isSwedishWorkingDay(currentDate.toJSDate())) {
      dueDates++;
    }
    currentDate = currentDate.plus({ days: 1 });
  }

  return dueDates;
}

export type AutoGiroShipmentResult =
  | {
      shipmentID: number;
      numCharges: number;
      numMandatesToBeConfirmed: number;
      file: string;
      filename: string;
    }
  | {
      shipmentID: null;
      numCharges: 0;
      mandatesToBeConfirmed: 0;
      file: null;
      filename: null;
    };

/**
 * Creates a new AutoGiro shipment: collects agreements to charge for the current month, new
 * mandates to confirm and pending charges to amend, generates the claims file and logs the
 * result (the stored log is what the shipment report download reads back).
 * Used by POST /scheduled/autogiro and the admin tRPC procedure.
 */
export async function createAutoGiroShipment(): Promise<AutoGiroShipmentResult> {
  // One connection holds a named lock for the whole run, so two concurrent runs can't both
  // see the same agreements as uncharged, and carries the transaction for all writes, so a
  // failed run leaves no charges, statuses or shipment behind. The lock name includes the
  // database, as the Norwegian and Swedish databases share a server.
  const connection = await DAO.startTransaction();
  let locked = false;
  try {
    const [lockRows] = await connection.query<any[]>(
      "SELECT GET_LOCK(CONCAT(DATABASE(), '.autogiro_shipment'), 0) AS acquired",
    );
    if (Number(lockRows[0]?.acquired) !== 1) {
      throw new Error("An AutoGiro shipment is already being created");
    }
    locked = true;

    const result = await createAutoGiroShipmentLocked(connection);
    await connection.query("COMMIT");
    await DAO.logging.add("AutoGiro", result);
    return result;
  } catch (ex) {
    await connection.query("ROLLBACK").catch((rollbackEx) => console.error(rollbackEx));
    throw ex;
  } finally {
    if (locked) {
      await connection
        .query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), '.autogiro_shipment'))")
        .catch((releaseEx) => console.error(releaseEx));
    }
    connection.release();
  }
}

async function createAutoGiroShipmentLocked(
  transaction: PoolConnection,
): Promise<AutoGiroShipmentResult> {
  let result: AutoGiroShipmentResult;
  const today = DateTime.fromJSDate(new Date());

  const agreements = await DAO.autogiroagreements.getAgreementsToCharge();

  let agreementsToClaim: {
    agreement: AutoGiro_agreements;
    claimDate: DateTime;
  }[] = [];
  for (let agreement of agreements) {
    if (agreement.payment_date === 0) {
      const lastDayOfMonth = today.endOf("month");
      agreementsToClaim.push({
        agreement,
        claimDate: lastDayOfMonth,
      });
      continue;
    }

    if (
      agreement.payment_date <= today.day &&
      agreement.created!.getDate() < agreement.payment_date
    ) {
      let skewedDate = DateTime.now().plus({ days: 1 });
      while (getSeBankingDaysBetweenDates(today, skewedDate) < 1) {
        if (skewedDate.month !== today.month) {
          console.error("Skewed date is in next month");
          break;
        }
        skewedDate = skewedDate.plus({ days: 1 });
      }
      agreementsToClaim.push({
        agreement,
        claimDate: skewedDate,
      });
      continue;
    }

    const claimDate = today.set({ day: agreement.payment_date });
    agreementsToClaim.push({
      agreement,
      claimDate: claimDate,
    });
  }

  const mandatesToBeConfirmed = await DAO.autogiroagreements.getMandatesByStatus("NEW");
  const amendmentCandidates = await DAO.autogiroagreements.getAmendmentCandidates();

  /* Check if the claim date is within the timeframe where we can send the file
   * We need at least one banking day between the claim date and today
   */
  const chargesToAmend = amendmentCandidates.filter((candidate) => {
    const claimDate =
      candidate.agreementDay == 0
        ? DateTime.now().endOf("month")
        : DateTime.now().set({ day: candidate.agreementDay });
    if (claimDate.diff(today, "days").days > 0) {
      // Find the number of banking days between today and the claim date
      const bankingDaysBetween = getSeBankingDaysBetweenDates(today, claimDate);
      return bankingDaysBetween > 0;
    }
    return false;
  });

  agreementsToClaim = agreementsToClaim.filter((agreement) => {
    return !chargesToAmend.some((charge) => charge.agreementId === agreement.agreement.ID);
  });

  if (
    agreementsToClaim.length > 0 ||
    mandatesToBeConfirmed.length > 0 ||
    chargesToAmend.length > 0
  ) {
    /**
     * Create file to charge agreements for current day
     */
    const shipmentID = await DAO.autogiroagreements.addShipment(
      agreementsToClaim.length,
      transaction,
    );

    let autoGiroClaimsFile: Buffer;
    try {
      autoGiroClaimsFile = await generateAutogiroGiroFile(
        shipmentID,
        agreementsToClaim,
        chargesToAmend,
        mandatesToBeConfirmed,
        transaction,
      );
    } catch (ex) {
      console.error(ex);
      // The caller rolls back the shipment and everything written for it
      throw new Error("Error generating file");
    }

    result = {
      shipmentID: shipmentID,
      numCharges: agreementsToClaim.length,
      numMandatesToBeConfirmed: mandatesToBeConfirmed.length,
      file: autoGiroClaimsFile.toString(),
      filename: `BFEP.IAGAG.${shipmentID}.${today.toFormat("yyLLdd.HHmmss")}`,
    };
  } else {
    result = {
      shipmentID: null,
      numCharges: 0,
      mandatesToBeConfirmed: 0,
      file: null,
      filename: null,
    };
  }

  return result;
}

/**
 * Replaces the distribution of an AutoGiro agreement. The current distribution is preserved
 * under a newly generated KID (keeping donation history), and the new distribution takes over
 * the agreement's original KID.
 * @param KID The agreement KID
 * @param validatedDistribution A distribution that has passed validateDistribution
 */
export async function replaceAutoGiroDistribution(
  KID: string,
  validatedDistribution: DistributionInput,
) {
  const originalDistribution = await DAO.distributions.getSplitByKID(KID);
  await assertDistributionOwnedBy(originalDistribution.donorId, validatedDistribution);
  const newKid = await donationHelpers.createKID();
  await DAO.autogiroagreements.replaceAgreementDistribution(
    originalDistribution,
    newKid,
    validatedDistribution,
  );
}

export type DraftedPaymentDateResult =
  { ok: true } | { ok: false; status: 400 | 404; message: string };

/**
 * Sets the payment date of an AutoGiro agreement the widget drafted and the donor hasn't signed
 * yet (REST PUT /autogiro/:KID/drafted/paymentdate and tRPC widget.setAutoGiroDraftPaymentDate).
 * An active agreement is left alone. The caller checks that paymentDate is a number from 0 to 28.
 */
export async function setDraftedAutoGiroPaymentDate(
  KID: string,
  paymentDate: number,
): Promise<DraftedPaymentDateResult> {
  const agreement = await DAO.autogiroagreements.getAgreementByKID(KID);

  if (!agreement) {
    return { ok: false, status: 404, message: "Agreement not found" };
  }

  if (agreement.active !== false) {
    return { ok: false, status: 400, message: "Agreement is not in drafted state" };
  }

  await DAO.autogiroagreements.setAgreementPaymentDateByKID(KID, paymentDate);
  return { ok: true };
}
