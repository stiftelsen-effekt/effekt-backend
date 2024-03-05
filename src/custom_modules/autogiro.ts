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
      agreementClaim.agreement.amount,
      chargeId.toString(),
    );
    fileContents += "\n";
  }

  /**
   * Mandates that need confirmation
   */
  for (const mandate of mandatesToBeConfirmed) {
    const taxUnit = await DAO.tax.getByKID(mandate.KID, RequestLocale.SE);

    fileContents += writer.getMandateConfirmationRecord(
      mandate,
      taxUnit,
      config.autogiro_bankgiro_number,
    );
    fileContents += "\n";

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
    for (const emandate of parsedFile.emandates) {
      try {
        const taxUnit = await DAO.tax.getByKID(emandate.payerNumber, RequestLocale.SE);
        if (emandate.payerSsn && !taxUnit) {
          try {
            const donor = await DAO.donors.getByKID(emandate.payerNumber);
            const taxUnitId = await DAO.tax.addTaxUnit(donor.id, emandate.payerSsn, donor.name);
            await DAO.distributions.setTaxUnit(emandate.payerNumber, taxUnitId);
          } catch (ex) {
            console.log(ex);
            console.error(
              `Failed to add tax unit for donor with KID ${emandate.payerNumber} based on e-mandate`,
            );
            // If we can't add the tax unit, we won't be able to send a confirmation file for the mandate
            // Therefore we fail fast here
            continue;
          }
        }

        const existingMandage = await DAO.autogiroagreements.getMandateByKID(emandate.payerNumber);

        if (!existingMandage) {
          await DAO.autogiroagreements.addMandate({
            KID: emandate.payerNumber,
            name_and_address: emandate.information.payerNameAndAddress,
            postal_code: emandate.information.postNumber,
            postal_label: emandate.information.postAddress,
            special_information: emandate.information.specialInformation,
            status: "NEW",
            bank_account: emandate.payerBankAccountNumber,
          });
        } else if (existingMandage.status === "DRAFTED") {
          await DAO.autogiroagreements.updateMandate({
            ID: existingMandage.ID,
            KID: emandate.payerNumber,
            name_and_address: emandate.information.payerNameAndAddress,
            postal_code: emandate.information.postNumber,
            postal_label: emandate.information.postAddress,
            special_information: emandate.information.specialInformation,
            status: "NEW",
            bank_account: emandate.payerBankAccountNumber,
          });
        } else {
          console.log(
            `Mandate with KID ${emandate.payerNumber} already exists with status ${existingMandage.status}, skipping`,
          );
        }
      } catch (ex) {
        console.error(ex);
        console.log(`Failed to add mandate with KID ${emandate.payerNumber}`);
      }
    }
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
 * A function that returns a list of due dates for payment claims
 * We are required to send claims four banking days in advance of the due date
 * Holidays and weekends are not counted as banking days
 * Takes in a date to calculate the due date from
 * @returns
 */
export function getAutogiroDueDates(date: DateTime) {
  // Start iterating backwards 30 days from the date given
  // Keep going until 4 days after the date given
  // Add all the dates that have 4 banking days in between
  // Return the list of dates

  // We only send claims on banking days
  // Thus, we start by checking if the date given is a banking day
  if (!isSwedishWorkingDay(date.toJSDate())) {
    return [];
  }

  let dueDates: DateTime[] = [];
  let iterationDate = date.plus({ days: 30 });
  while (iterationDate >= date.plus({ days: 4 })) {
    let bankingDays = 0;
    let innerIterationDate = iterationDate.minus({ days: 1 });
    while (innerIterationDate >= date) {
      if (isSwedishWorkingDay(innerIterationDate.toJSDate())) {
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
 * Debugging helper for due date calculation
 * @param date
 * @param dueDates
 */
function printDueDatesTable(date: DateTime, dueDates: DateTime[]) {
  console.log("");
  console.log("");

  let tableWidth = dueDates[0].diff(date, "days").days + 1;

  console.log("-".repeat(tableWidth * 8));

  // Bold text
  console.log(`Due dates for claims on \x1b[1m${date.toFormat("dd.MM.yyyy")}\x1b[0m`);
  console.log("");

  // Letter for the day, e.g. Mon for Monday

  console.log(
    Array.from({ length: tableWidth }, (_, i) => date.plus({ day: i }).toFormat("ccc")).join("\t"),
  );
  console.log(Array.from({ length: tableWidth }, (_, i) => date.plus({ day: i }).day).join("\t"));
  // Green square is a banking day, yellow is not
  console.log(
    Array.from({ length: tableWidth }, (_, i) =>
      workdays.isWorkingDay(date.plus({ day: i }).toJSDate()) ? "🟢" : "🟡",
    ).join("\t"),
  );
  // Checkmark if the date is a due date
  console.log(
    Array.from({ length: tableWidth }, (_, i) =>
      dueDates.map((d) => d.toISO()).includes(date.plus({ day: i }).toISO()) ? "✅" : "",
    ).join("\t"),
  );
  console.log("-".repeat(tableWidth * 8));

  console.log("");
  console.log("");
}
