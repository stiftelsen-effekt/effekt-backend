import { DateTime } from "luxon";

import writer from "./autogiro/filewriterutil";
import workdays from "norwegian-workdays";
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

/**
 * Generates a claims file to claim payments for AutoGiro agreements
 * @param shipmentID A shipment ID from the database
 * @param agreements Agreements that we should claim payment from
 * @param mandatesToBeConfirmed New mandates that need confirmation
 * @param dueDate Due date
 * @returns {Buffer} The file buffer
 */
export async function generateAutogiroGiroFile(
  shipmentID: number,
  agreementsToClaim: {
    agreement: AutoGiro_agreements;
    claimDate: DateTime;
  }[],
  chargesToBeAmended: AutogiroChargeToBeAmended[],
  mandatesToBeConfirmed: AutoGiro_mandates[],
) {
  const today = DateTime.fromJSDate(new Date());
  let fileContents = "";

  fileContents += writer.getOpeningRecord(
    today,
    config.autogiro_customer_number,
    config.autogiro_bankgiro_number,
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
    const chargeId = await DAO.autogiroagreements.addAgreementCharge({
      agreementID: agreementClaim.agreement.ID,
      shipmentID: shipmentID,
      status: "PENDING",
      claim_date: agreementClaim.claimDate.toJSDate(),
      amount: agreementClaim.agreement.amount.toString(),
      donationID: null,
    });

    fileContents += writer.getWithdrawalRecord(
      agreementClaim.claimDate,
      agreementClaim.agreement.KID,
      config.autogiro_bankgiro_number,
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
      await DAO.autogiroagreements.cancelAgreementCharge(charge.ID);
      // For cancelled agreements, we don't need to create a new charge
      continue;
    } else {
      // Set charge status to amended
      await DAO.autogiroagreements.setAgreementChargeAmended(charge.ID);
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

    const newChargeId = await DAO.autogiroagreements.addAgreementCharge({
      agreementID: chargeToBeAmended.agreementId,
      shipmentID: shipmentID,
      status: "PENDING",
      claim_date: newClaimDate.toJSDate(),
      amount: chargeToBeAmended.agreementAmount.toString(),
      donationID: null,
    });

    newChargesAfterAmendmentLines.push(
      writer.getWithdrawalRecord(
        newClaimDate,
        chargeToBeAmended.KID,
        config.autogiro_bankgiro_number,
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
        config.autogiro_bankgiro_number,
      );
      fileContents += "\n";
    } catch (ex) {
      console.error(ex);
      console.log(`Failed to add mandate confirmation record for mandate with KID ${mandate.KID}`);
      continue;
    }

    await DAO.autogiroagreements.setMandateStatus(mandate.ID, "PENDING");
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
    const invalidTransactions = [];
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

    await DAO.logging.add("Autogiro - Payments BAG", {
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
            const taxUnitId = await DAO.tax.addTaxUnit(donor.id, emandate.payerSsn, donor.name);
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
    const invalidMandates = [];
    for (const mandate of parsedFile.mandates) {
      try {
        const KID = await getValidatedKID(mandate.payerNumber);

        if (AutoGiroMandateCancelledInformationCodes.some((c) => c === mandate.informationCode)) {
          // Mandate cancellation or deletion
          try {
            const dbMandate = await DAO.autogiroagreements.getMandateByKID(KID);
            await DAO.autogiroagreements.cancelMandate(dbMandate.ID);
            console.log(
              `Cancelled mandate with KID ${KID} with information code ${mandate.informationCode} and comment code ${mandate.commentaryCode}`,
            );
            // Set agreement status to stopped
            await DAO.autogiroagreements.cancelAgreementByKID(dbMandate.KID);

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
              await DAO.autogiroagreements.activateMandate(dbMandate.ID);
              console.log(`Updated mandate with KID ${KID} and ID ${dbMandate.ID} to ACTIVE`);
              await DAO.autogiroagreements.activateAgreementByKID(dbMandate.KID);
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
              await DAO.autogiroagreements.setMandateStatus(dbMandate.ID, "REJECTED");
              console.log(
                `Updated mandate with KID ${KID} and ID ${dbMandate.ID} to REJECTED with commentary code ${mandate.commentaryCode}`,
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

        if (dbCharge.status === "FAILED") {
          // Ignore charges that are already marked as failed
          continue;
        }

        if (!dbCharge) {
          console.log(`Could not find charge with reference ${charge.paymentReference}`);
          rejectedCharges++;
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
const processAutogiroDeposit = async (
  payment,
  reportDate,
): Promise<ProcessAutogiroPaymentResult> => {
  const reference = `autogiro.${reportDate.toFormat(
    "yyyyMMdd",
  )}.${payment.paymentReference.trim()}`;
  try {
    const KID = await getValidatedKID(payment.payerNumber);

    let date = DateTime.fromFormat(payment.paymentDate, "yyyyMMdd").toJSDate();

    try {
      await DAO.donations.add(KID, paymentMethods.autoGiro, payment.amount / 100, date, reference);
      const chargeId = payment.paymentReference.trim();
      try {
        await DAO.autogiroagreements.setAgreementChargeCompleted(chargeId);
      } catch (ex) {
        console.error(ex);
        console.log(`Failed to update charge with ID ${chargeId} to COMPLETED`);
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
