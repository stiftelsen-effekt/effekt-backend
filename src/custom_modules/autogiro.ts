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
} from "./parsers/autogiro/mandates";

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
  agreements: AutoGiro_agreements[],
  mandatesToBeConfirmed: AutoGiro_mandates[],
  dueDate: DateTime,
) {
  const today = DateTime.fromJSDate(new Date());
  let fileContents = "";

  fileContents += writer.getOpeningRecord(
    today,
    config.autogiro_customer_number,
    config.autogiro_bankgiro_number,
  );

  /**
   * Withdrawal requests
   */
  for (const agreement of agreements) {
    // Create a charge record for each agreement
    const chargeId = await DAO.autogiroagreements.addAgreementCharge({
      agreementID: agreement.ID,
      shipmentID: shipmentID,
      status: "PENDING",
      claim_date: dueDate.toJSDate(),
      amount: agreement.amount.toString(),
      donationID: null,
    });

    fileContents += writer.getWithdrawalRecord(
      today,
      agreement.KID,
      config.autogiro_bankgiro_number,
      agreement.amount,
      chargeId.toString(),
    );
  }

  /**
   * Mandates that need confirmation
   */
  for (const mandate of mandatesToBeConfirmed) {
    const taxUnit = await DAO.tax.getByKID(mandate.KID);

    fileContents += writer.getMandateConfirmationRecord(
      mandate,
      taxUnit,
      config.autogiro_bankgiro_number,
    );

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
    for (const deposit of parsedFile.deposits) {
      for (const payment of deposit.payments) {
        await DAO.donations.add(
          payment.payerNumber,
          paymentMethods.autoGiro,
          payment.amount,
          payment.paymentDate,
        );
      }
    }
  } else if (parsedFile.reportContents === AutoGiroContent.CANCELLATION_AND_AMENDMENT) {
    /**
     * Autogiro payment cancellation and amendments
     */

    for (const cancellation of parsedFile.cancellations) {
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
        const taxUnit = await DAO.tax.getByKID(emandate.payerNumber);
        if (emandate.payerSsn && !taxUnit) {
          try {
            const donor = await DAO.donors.getByKID(emandate.payerNumber);
            const taxUnitId = await DAO.tax.addTaxUnit(donor.id, emandate.payerSsn, donor.name);
            await DAO.distributions.setTaxUnit(emandate.payerNumber, taxUnitId);
          } catch (ex) {
            console.error(
              `Failed to add tax unit for donor with KID ${emandate.payerNumber} based on e-mandate`,
            );
            // If we can't add the tax unit, we won't be able to send a confirmation file for the mandate
            // Therefore we fail fast here
            continue;
          }
        }

        const mandateId = await DAO.autogiroagreements.addMandate({
          KID: emandate.payerNumber,
          name_and_address: emandate.information.payerNameAndAddress,
          postal_code: emandate.information.postNumber,
          postal_label: emandate.information.postAddress,
          special_information: emandate.information.specialInformation,
          status: "NEW",
          bank_account: emandate.payerBankAccountNumber,
        });
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

    for (const mandate of parsedFile.mandates) {
      if (AutoGiroMandateCancelledInformationCodes.some((c) => c === mandate.informationCode)) {
        // Mandate cancellation or deletion
        try {
          const dbMandate = await DAO.autogiroagreements.getMandateByKID(mandate.payerNumber);
          await DAO.autogiroagreements.cancelMandate(dbMandate.ID);
          console.log(
            `Cancelled mandate with KID ${mandate.payerNumber} with information code ${mandate.informationCode} and comment code ${mandate.commentaryCode}`,
          );
        } catch (ex) {
          console.error(ex);
          console.log(
            `Failed to cancel mandate with KID ${mandate.payerNumber} with information code ${mandate.informationCode} and comment code ${mandate.commentaryCode}`,
          );
        }
      } else if (
        mandate.informationCode === AutoGiroMandateInformationCodes.ADDITION ||
        mandate.informationCode === AutoGiroMandateInformationCodes.BANK_RESPONSE_FOR_NEW_MANDATE
      ) {
        if (mandate.commentaryCode === AutoGiroMandateCommentaryCodes.NEW_MANDATE) {
          // New mandate accepted, either the bank confirms a mandate or we've successfully added a mandate
          try {
            const dbMandate = await DAO.autogiroagreements.getMandateByKID(mandate.payerNumber);
            await DAO.autogiroagreements.activateMandate(dbMandate.ID);
            console.log(
              `Updated mandate with KID ${mandate.payerNumber} and ID ${dbMandate.ID} to ACTIVE`,
            );
          } catch (ex) {
            console.error(ex);
            console.log(`Failed to update mandate with KID ${mandate.payerNumber} to ACTIVE`);
          }
        }
      }
    }
  }

  return parsedFile;
}
