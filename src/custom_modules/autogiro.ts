import { DateTime } from "luxon";

import writer from "./autogiro/filewriterutil";
import workdays from "norwegian-workdays";
import config from "../config";
import { AutoGiro_agreements } from "@prisma/client";
import { AutoGiroContent, AutoGiroParser } from "./parsers/autogiro";

/**
 * Generates a claims file to claim payments for AutoGiro agreements
 * @param {number} shipmentID A shipment ID from the database
 * @param {Array<import('./parsers/avtalegiro').AvtalegiroAgreement>} agreements Agreements that we should claim payment from
 * @param {DateTime} dueDate Due date
 * @returns {Buffer} The file buffer
 */
export async function generateAutogiroGiroFile(
  shipmentID: string,
  agreements: AutoGiro_agreements[],
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
  agreements.forEach((agreement) => {
    //fileContents += writer.getWithdrawalRecord(dueDate, agreement., config.autogiro_bankgiro_number, agreement.limit, agreement.KID);
  });

  const fileBuffer = Buffer.from(fileContents, "utf8");

  return fileBuffer;
}

export async function processAutogiroInputFile(fileContents: string) {
  const parsedFile = AutoGiroParser.parse(fileContents);

  if (parsedFile.openingRecord.fileContents === AutoGiroContent.PAYMENT_SPECIFICATION_AND_STOP) {
    if (!("deposits" in parsedFile))
      throw new Error("Missing deposits in payment specifications file");

    for (const deposit of parsedFile.deposits) {
    }
  }

  return parsedFile;
}
