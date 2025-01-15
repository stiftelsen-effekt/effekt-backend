import { DateTime } from "luxon";
import {
  AutoGiroContent,
  AutoGiroOpeningRecord,
  AutoGiroParsedResult,
  AutoGiroTransactionCode,
  getTransactionCode,
} from "../autogiro";

/**
 * Parses a rejected payments file (see section 8.4.1 in technical specification)
 * This file contains information about rejected payments / charges
 * The opening record contains information about the file layout, which determines
 * how the rest of the file should be parsed.
 * @param lines All the lines in the file, except the opening record
 * @param openingRecord The parsed opening record
 * @returns An object containing the parsed information from the file
 */
export const parseRejectedCharges = (lines: string[], openingRecord: AutoGiroOpeningRecord) => {
  let result: AutoGiroParsedRejectedChargesResult = {
    reportContents: AutoGiroContent.REJECTED_CHARGES,
    openingRecord,
    rejectedCharges: [],
  };

  for (const line of lines) {
    const transactionCode = getTransactionCode(line);

    switch (transactionCode) {
      case AutoGiroTransactionCode.INCOMING_PAYMENT_RECORD:
        const rejectedIncomingPaymentRecord = parseAutoGiroRejectedChargeRecord(line);
        result.rejectedCharges.push(rejectedIncomingPaymentRecord);
        break;
      case AutoGiroTransactionCode.OUTGOING_PAYMENT_RECORD:
        const rejectedOutgoingPaymentRecord = parseAutoGiroRejectedChargeRecord(line);
        result.rejectedCharges.push(rejectedOutgoingPaymentRecord);
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

interface AutoGiroParsedRejectedChargesResult extends AutoGiroParsedResult {
  reportContents: AutoGiroContent.REJECTED_CHARGES;
  rejectedCharges: AutoGiroRejectedChargeRecord[];
}

/**
 * Section 8.4.2 in technical specification
 */
type AutoGiroRejectedChargeRecord = {
  paymentDate: DateTime;
  periodCode: string;
  numberOfRecurringPaymens: string;
  payerNumber: string;
  amount: number;
  /** Charge ID */
  paymentReference: number;
  commentaryCode: AutoGiroRejectedChargeCommentCode;
};
const parseAutoGiroRejectedChargeRecord = (line: string): AutoGiroRejectedChargeRecord => {
  return {
    paymentDate: DateTime.fromFormat(line.substring(2, 2 + 8), "yyyyMMdd"),
    periodCode: line.substring(10, 10 + 1),
    numberOfRecurringPaymens: line.substring(11, 11 + 3),
    payerNumber: line.substring(14, 14 + 16),
    amount: parseInt(line.substring(30, 30 + 12)),
    /** Charge ID */
    paymentReference: parseInt(line.substring(42, 42 + 16).trim()),
    commentaryCode: line.substring(58, 58 + 2) as AutoGiroRejectedChargeCommentCode,
  };
};

/**
 * Section 8.4.3 in technical specification
 */
export enum AutoGiroRejectedChargeCommentCode {
  MANDATE_NOT_FOUND = "01",
  ACCOUNT_NOT_APPROVED_OR_CLOSED = "02",
  INCORRECT_PAYER_NUMBER = "04",
  INCORRECT_PERIOD_CODE = "06",
  INCORRECT_NUMBER_OF_PAYMENTS = "07",
  AMOUNT_NON_NUMERIC = "08",
  BAN_ON_OUTGOING_PAYMENTS = "09",
  BANKGIRO_NUMBER_NOT_FOUND = "10",
  INCORRECT_PAYMENT_DATE = "12",
  PAYMENT_DATE_PASSED = "13",
  BANKGIRO_NUMBER_PAYEE_DIFFERENT_BETWEEN_OPENING_AND_TRANSACTION_RECORDS = "15",
  AMOUNT_EXCEEDS_MAX_AMOUNT = "24",
}
