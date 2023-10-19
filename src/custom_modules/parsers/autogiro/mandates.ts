import { DateTime } from "luxon";
import {
  AutoGiroContent,
  AutoGiroOpeningRecord,
  AutoGiroParsedResult,
  AutoGiroTransactionCode,
  getTransactionCode,
} from "../autogiro";

/**
 * Parses a mandate file (see section 8.3.1 in technical specification)
 * This file contains information about mandates
 * The opening record contains information about the file layout, which determines
 * how the rest of the file should be parsed.
 * @param lines All the lines in the file, except the opening record
 * @param openingRecord The parsed opening record
 * @returns An object containing the parsed information from the file
 */
export const parseMandates = (lines: string[], openingRecord: AutoGiroOpeningRecord) => {
  let result: AutoGiroParsedMandatesResult = {
    reportContents: AutoGiroContent.MANDATES,
    openingRecord,
    mandates: [],
  };

  for (const line of lines) {
    const transactionCode = getTransactionCode(line);

    switch (transactionCode) {
      case AutoGiroTransactionCode.MANDATE_ADD_OR_DELETE_RECORD:
        const mandateAddOrDeleteRecord = parseMandateAddOrDeleteRecord(line);
        result.mandates.push(mandateAddOrDeleteRecord);
        break;
      case AutoGiroTransactionCode.END_RECORD:
        break;
      default:
        throw new Error(
          `Not a valid autogiro file, unknown transaction code (${transactionCode}) for file contents ${openingRecord.fileContents}`,
        );
    }

    if (transactionCode === AutoGiroTransactionCode.END_RECORD) break;
  }

  return result;
};

interface AutoGiroParsedMandatesResult extends AutoGiroParsedResult {
  reportContents: AutoGiroContent.MANDATES;
  mandates: AutoGiroMandateAddOrDeleteRecord[];
}

/**
 * Section 8.3.2 in technical specification
 */
type AutoGiroMandateAddOrDeleteRecord = {
  payeeBankGiroNumber: string;
  payerNumber: string;
  payerBankAccountNumber: string;
  payerSsn: string;
  informationCode: AutoGiroMandateInformationCodes;
  commentaryCode: AutoGiroMandateCommentaryCodes;
  acceptedDate: DateTime;
};
const parseMandateAddOrDeleteRecord = (line: string): AutoGiroMandateAddOrDeleteRecord => {
  return {
    payeeBankGiroNumber: line.substring(2, 2 + 10),
    payerNumber: line.substring(12, 12 + 16),
    payerBankAccountNumber: line.substring(28, 28 + 16),
    payerSsn: line.substring(44, 44 + 12),
    informationCode: parseInt(line.substring(61, 61 + 2)),
    commentaryCode: parseInt(line.substring(63, 63 + 2)),
    acceptedDate: DateTime.fromFormat(line.substring(65, 65 + 8), "yyyyMMdd"),
  };
};

/**
 * Section 8.3.3 in technical specification
 */
export enum AutoGiroMandateInformationCodes {
  DELETION = 3,
  ADDITION = 4,
  CHANGE = 5,
  CANCELLATION = 10,
  BANK_RESPONSE_FOR_NEW_MANDATE = 42,
  DELETED_NO_BANK_RESPONSE = 43,
  DELETED_CUSTOMER_BANK_RESPONSE = 44,
  DELETED_BANK_RESPONSE = 46,
}

export const AutoGiroMandateCancelledInformationCodes = [
  AutoGiroMandateInformationCodes.DELETION,
  AutoGiroMandateInformationCodes.CANCELLATION,
  AutoGiroMandateInformationCodes.DELETED_NO_BANK_RESPONSE,
  AutoGiroMandateInformationCodes.DELETED_CUSTOMER_BANK_RESPONSE,
  AutoGiroMandateInformationCodes.DELETED_BANK_RESPONSE,
];

export enum AutoGiroMandateCommentaryCodes {
  DELETED_ON_REQUEST = 2,
  ACCOUNT_NOT_VALID_FOR_AUTOGIRO = 3,
  MISSING_MANDATE_IN_BANKGIRO = 4,
  INCORRECT_BANK_OR_PERSONAL_INFORMATION = 5,
  DELETED_BY_REQUEST = 7,
  MISING_PAYER_BANKGIRO_NUMBER = 9,
  MANDATE_ALREADY_EXISTS = 10,
  WRONG_PERSONAL_OR_ORGANIZATION_NUMBER = 20,
  WRONG_PAYER_NUMBER = 21,
  WRONG_PAYER_BANK_ACCOUNT_NUMBER = 23,
  WRONG_PAYER_BANKGIRO_NUMBER = 29,
  BANKGIRO_NUMBER_DELETED = 30,
  NEW_MANDATE = 32,
  DELETED = 33,
  MANDATE_DELETED_BECAUSE_BANKGIRO_NUMBER_DELETED = 98,
}
