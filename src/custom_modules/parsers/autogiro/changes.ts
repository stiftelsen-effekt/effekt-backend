import { DateTime } from "luxon";
import {
  AutoGiroOpeningRecord,
  AutoGiroParsedResult,
  AutoGiroTransactionCode,
  getTransactionCode,
} from "../autogiro";

/**
 * Parses a payment amendment file (see section 8.5 in technical specification)
 * This file contains information about changed or cancelled payments
 * The opening record contains information about the file layout, which determines
 * how the rest of the file should be parsed.
 * @param lines All the lines in the file, except the opening record
 * @param openingRecord The parsed opening record
 * @returns An object containing the parsed information from the file
 */
export const parseCancellationAndAmendment = (
  lines: string[],
  openingRecord: AutoGiroOpeningRecord,
) => {
  let result: AutoGiroParsedCancellationsAmendmentsResult = {
    openingRecord,
    cancellations: [],
    amendments: [],
  };

  for (const line of lines) {
    const transactionCode = getTransactionCode(line);

    switch (transactionCode) {
      case AutoGiroTransactionCode.CANCELLED_BY_PAYER:
        result.cancellations.push(parseCancellationRecord(line));
        break;
      case AutoGiroTransactionCode.CANCELLED_CANCELLED_MANDATE:
        result.cancellations.push(parseCancellationRecord(line));
        break;
      case AutoGiroTransactionCode.CANCELLED_PAYEE_AGREEMENT_TERMINATED:
        result.cancellations.push(parseCancellationRecord(line));
        break;
      case AutoGiroTransactionCode.CANCEL_ALL_PAYMENTS_BY_PAYER_NUMBER:
        result.cancellations.push(parseCancellationRecord(line));
        break;
      case AutoGiroTransactionCode.CANCEL_ONE_PAYMENT_BY_PAYER_NUMBER_AND_DATE_AND_REFERENCE:
        result.cancellations.push(parseCancellationRecord(line));
        break;
      case AutoGiroTransactionCode.CANCEL_ALL_PAYMENTS_BY_PAYER_NUMBER_AND_DATE:
        result.cancellations.push(parseCancellationRecord(line));
        break;
      case AutoGiroTransactionCode.ALL_PAYMENTS_NEW_DATE:
        throw new Error("Parsing of amendment records not supported");
        break;
      case AutoGiroTransactionCode.ALL_PAYMENTS_NEW_DATE_BY_PAYMENT_DATE:
        throw new Error("Parsing of amendment records not supported");
        break;
      case AutoGiroTransactionCode.ALL_PAYMENTS_NEW_DATE_BY_PAYMENT_DATE_AND_PAYER_NUMBER:
        throw new Error("Parsing of amendment records not supported");
        break;
      case AutoGiroTransactionCode.SPECIFIC_PAYMENT_NEW_DATE_BY_REFERENCE:
        throw new Error("Parsing of amendment records not supported");
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

interface AutoGiroParsedCancellationsAmendmentsResult extends AutoGiroParsedResult {
  cancellations: AutoGiroCancellationRecord[];
  amendments: unknown[];
}

/**
 * Section 8.5.2 in technical specification
 */
type AutoGiroCancellationRecord = {
  paymentDate: DateTime;
  payerNumber: string;
  paymentCode: AutoGiroPaymentCodes;
  amount: number;
  reference: string;
  commentCode: string;
};
const parseCancellationRecord = (line: string): AutoGiroCancellationRecord => {
  const paymentCodeSubstr = line.substring(26, 26 + 2);
  if (paymentCodeSubstr !== "82" && paymentCodeSubstr !== "32")
    throw new Error(`Unknown payment code ${paymentCodeSubstr}`);

  const paymentCode = paymentCodeSubstr as AutoGiroPaymentCodes;

  return {
    paymentDate: DateTime.fromFormat(line.substring(2, 2 + 8), "YYYYLLdd"),
    payerNumber: line.substring(10, 10 + 16),
    paymentCode: paymentCode,
    amount: parseInt(line.substring(28, 28 + 12)),
    reference: line.substring(56, 56 + 16),
    commentCode: line.substring(72, 72 + 2),
  };
};

enum AutoGiroPaymentCodes {
  INCOMMING = "82",
  OUTGOING = "32",
}
