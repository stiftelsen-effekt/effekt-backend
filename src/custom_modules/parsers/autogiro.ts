/**
 * AutoGiro payment specification parser
 * Based on the technical specification found here:
 * https://www.bankgirot.se/globalassets/dokument/tekniska-manualer/directdebit_autogiro_technicalmanual_en.pdf
 * See section 8
 * "Record and file descriptions – files from Bankgirot with new file layout"
 */

import { DateTime } from "luxon";
import { parseMandates } from "./autogiro/mandates";
import { parsePaymentSpecification } from "./autogiro/transactions";
import { parseEMandates } from "./autogiro/emandates";
import { parseCancellationAndAmendment } from "./autogiro/changes";

export interface AutoGiroParsedResult {
  reportContents: AutoGiroContent;
  openingRecord: AutoGiroOpeningRecord;
}

export const AutoGiroParser = {
  parse: (data: string) => {
    const lines = data.split("\n");

    if (lines.length === 0) throw new Error("Not a valid autogiro file, no lines found");

    const openingRecordTransactionCode = getTransactionCode(lines[0]);
    let openingRecord: AutoGiroOpeningRecord;
    if (openingRecordTransactionCode === AutoGiroTransactionCode.OPENING_RECORD)
      openingRecord = parseOpeningRecord(lines[0]);
    else if (openingRecordTransactionCode === AutoGiroTransactionCode.E_MANDATE_OPENING_RECORD)
      openingRecord = parseEMandateOpeningRecord(lines[0]);
    else
      throw new Error(
        `Not a valid autogiro file, unknown transaction code (${openingRecordTransactionCode}) in opening record`,
      );

    const remainingLines = lines.slice(1, lines.length);

    if (openingRecord.fileContents === AutoGiroContent.PAYMENT_SPECIFICATION_AND_STOP)
      return parsePaymentSpecification(remainingLines, openingRecord);
    else if (openingRecord.fileContents === AutoGiroContent.MANDATES)
      return parseMandates(remainingLines, openingRecord);
    else if (openingRecord.fileContents === AutoGiroContent.E_MANDATES)
      return parseEMandates(remainingLines, openingRecord);
    else if (openingRecord.fileContents === AutoGiroContent.CANCELLATION_AND_AMENDMENT)
      return parseCancellationAndAmendment(remainingLines, openingRecord);
    else
      throw new Error(
        `Not a valid autogiro file, unknown layout (${openingRecord.fileContents}) in opening record`,
      );
  },
};

export const getTransactionCode = (line: string) => {
  return line.substring(0, 2);
};

/**
 * Section 8.2.2 in technical specification
 */
export type AutoGiroOpeningRecord = {
  dateWritten: DateTime;
  payeeCustomerNumber?: string;
  clearingNumber?: string;
  payeeBankGiroNumber: string;
  fileContents: AutoGiroContent;
};
const parseOpeningRecord = (line: string): AutoGiroOpeningRecord => {
  const expectedLayoutName = "AUTOGIRO".padEnd(20, " ");
  const actualLayoutName = line.substring(2, 2 + 20);
  if (expectedLayoutName !== actualLayoutName)
    throw new Error("Not a valid autogiro file, missing AutoGiro layout name");

  const fileContents = line.substring(44, 44 + 20).trim();
  const validContentTypes = [
    AutoGiroContent.PAYMENT_SPECIFICATION_AND_STOP,
    AutoGiroContent.MANDATES,
    AutoGiroContent.CANCELLATION_AND_AMENDMENT,
  ];
  if (!validContentTypes.includes(fileContents as AutoGiroContent))
    throw new Error(
      `Not a valid autogiro file, unknown file contents (${fileContents}) in opening record`,
    );

  return {
    dateWritten: DateTime.fromFormat(line.substring(26, 26 + 20), "yyyyMMdd"),
    payeeCustomerNumber: line.substring(64, 64 + 6),
    payeeBankGiroNumber: line.substring(70, 70 + 10),
    fileContents: fileContents as AutoGiroContent,
  };
};
const parseEMandateOpeningRecord = (line: string): AutoGiroOpeningRecord => {
  const expectedFileContents = "AG-EMEDGIV";
  const actualFileContents = line.substring(24, 24 + 10);
  console.log(expectedFileContents, actualFileContents);
  if (expectedFileContents !== actualFileContents)
    throw new Error("Not a valid autogiro file, missing e-mandate content type");

  return {
    dateWritten: DateTime.fromFormat(line.substring(2, 2 + 8), "yyyyMMdd"),
    clearingNumber: line.substring(10, 10 + 4),
    payeeBankGiroNumber: line.substring(14, 14 + 10),
    fileContents: AutoGiroContent.E_MANDATES,
  };
};

export enum AutoGiroContent {
  PAYMENT_SPECIFICATION_AND_STOP = "BET. SPEC & STOPP TK",
  MANDATES = "AG-MEDAVI",
  E_MANDATES = "AG-EMEDGIV",
  CANCELLATION_AND_AMENDMENT = "MAKULERING/ÄNDRING",
}

/**
 * Section 8 in technical specification
 */
export enum AutoGiroTransactionCode {
  OPENING_RECORD = "01",

  // 8.2 Payments specification and Rejected payments in balance check inquiry
  DEPOSIT_RECORD = "15",
  INCOMING_PAYMENT_RECORD = "82",
  WITHDRAWAL_RECORD = "16",
  OUTGOING_PAYMENT_RECORD = "32",
  WITHDRAWAL_REFUND_RECORD = "17",
  // 8.5 Cancellations and amendments
  CANCELLED_CANCELLED_MANDATE = "03",
  CANCELLED_BY_PAYER = "11",
  CANCELLED_PAYEE_AGREEMENT_TERMINATED = "21",
  CANCEL_ALL_PAYMENTS_BY_PAYER_NUMBER = "23",
  CANCEL_ALL_PAYMENTS_BY_PAYER_NUMBER_AND_DATE = "24",
  CANCEL_ONE_PAYMENT_BY_PAYER_NUMBER_AND_DATE_AND_REFERENCE = "25",
  ALL_PAYMENTS_NEW_DATE = "26",
  ALL_PAYMENTS_NEW_DATE_BY_PAYMENT_DATE = "27",
  ALL_PAYMENTS_NEW_DATE_BY_PAYMENT_DATE_AND_PAYER_NUMBER = "28",
  SPECIFIC_PAYMENT_NEW_DATE_BY_REFERENCE = "29",
  // 8.6 Mandates by form
  E_MANDATE_OPENING_RECORD = "51",
  E_MANDATE_INFORMATION_RECORD = "52",
  E_MANDATE_SPECIAL_INFORMATION_RECORD = "53",
  E_MANDATE_NAME_AND_ADDRESS_FIRST_RECORD = "54",
  E_MANDATE_NAME_AND_ADDRESS_SECOND_RECORD = "55",
  E_MANDATE_POST_NUMBER_RECORD = "56",
  E_MANDATE_END_RECORD = "59",
  // 8.3.2
  MANDATE_ADD_OR_DELETE_RECORD = "73",
  PAYMENT_REFUND_RECORD = "77",
  END_RECORD = "09",
}
