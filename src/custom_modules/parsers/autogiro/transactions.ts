import {
  AutoGiroOpeningRecord,
  AutoGiroParsedResult,
  AutoGiroTransactionCode,
  getTransactionCode,
} from "../autogiro";

/**
 * Parses a payment specification file (see section 8.2 in technical specification)
 * This file contains information about deposits, withdrawals and refunds
 * The opening record contains information about the file layout, which determines
 * how the rest of the file should be parsed.
 * @param lines All the lines in the file, except the opening record
 * @param openingRecord The parsed opening record
 * @returns An object containing the parsed information from the file
 */
export const parsePaymentSpecification = (
  lines: string[],
  openingRecord: AutoGiroOpeningRecord,
) => {
  let result: AutoGiroParsedTransactionsResult = {
    openingRecord,
    deposits: [],
    withdrawals: [],
    refunds: [],
  };

  for (const line of lines) {
    const transactionCode = getTransactionCode(line);

    switch (transactionCode) {
      case AutoGiroTransactionCode.DEPOSIT_RECORD:
        const depositRecord = parseDepositRecord(line);
        result.deposits.push({ ...depositRecord, payments: [] });
        break;
      case AutoGiroTransactionCode.INCOMING_PAYMENT_RECORD:
        const incomingPaymentRecord = parseIncomingPaymentRecord(line);
        result.deposits[result.deposits.length - 1].payments.push(incomingPaymentRecord);
        break;
      case AutoGiroTransactionCode.WITHDRAWAL_RECORD:
        const withdrawalRecord = parseWithdrawalRecord(line);
        result.withdrawals.push(withdrawalRecord);
        break;
      case AutoGiroTransactionCode.OUTGOING_PAYMENT_RECORD:
        const outgoingPaymentRecord = parseOutgoingPaymentRecord(line);
        result.withdrawals[result.withdrawals.length - 1].payments.push(outgoingPaymentRecord);
        break;
      case AutoGiroTransactionCode.WITHDRAWAL_REFUND_RECORD:
        const withdrawalRefundRecord = parseWithdrawalRefundRecord(line);
        result.refunds.push(withdrawalRefundRecord);
        break;
      case AutoGiroTransactionCode.PAYMENT_REFUND_RECORD:
        const paymentRefundRecord = parsePaymentRefundRecord(line);
        result.refunds[result.refunds.length - 1].refunds.push(paymentRefundRecord);
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

interface AutoGiroParsedTransactionsResult extends AutoGiroParsedResult {
  deposits: AutoGiroDepositRecord[];
  withdrawals: AutoGiroWithdrawalRecord[];
  refunds: AutoGiroWithdrawalRefundRecord[];
}

/**
 * Section 8.2.2 in technical specification
 */
type AutoGiroDepositRecord = {
  payeeBankAccount: string;
  paymentDate: string;
  depositSerialNumber: string;
  approvedAmount: number;
  numberOfApprovedPayments: number;
  payments: AutoGiroIncomingPaymentRecord[];
};
const parseDepositRecord = (line: string): AutoGiroDepositRecord => {
  return {
    payeeBankAccount: line.substring(2, 2 + 35),
    paymentDate: line.substring(37, 37 + 8),
    depositSerialNumber: line.substring(45, 45 + 5),
    approvedAmount: parseInt(line.substring(50, 50 + 18)),
    numberOfApprovedPayments: parseInt(line.substring(71, 71 + 8)),
    payments: [],
  };
};

/**
 * Section 8.2.2 in technical specification
 */
type AutoGiroIncomingPaymentRecord = {
  paymentDate: string;
  periodCode: string;
  numberOfRecurringPaymens: string;
  payerNumber: string;
  amount: number;
  payeeBankGiroNumber: string;
  paymentReference: string;
  paymentStatusCode: AutoGiroPaymentStatusCode;
};
const parseIncomingPaymentRecord = (line: string): AutoGiroIncomingPaymentRecord => {
  return {
    paymentDate: line.substring(2, 2 + 8),
    periodCode: line.substring(10, 10 + 1),
    numberOfRecurringPaymens: line.substring(11, 11 + 3),
    payerNumber: line.substring(15, 15 + 16),
    amount: parseInt(line.substring(31, 31 + 12)),
    payeeBankGiroNumber: line.substring(43, 43 + 10),
    paymentReference: line.substring(53, 53 + 16),
    paymentStatusCode: parseInt(line.substring(79, 79 + 1)),
  };
};

/**
 * Section 8.2.2 in technical specification
 */
type AutoGiroWithdrawalRecord = {
  payeeBankAccount: string;
  paymentDate: string;
  withdrawalSerialNumber: string;
  approvedAmount: number;
  numberOfApprovedPayments: number;
  payments: AutoGiroOutgoingPaymentRecord[];
};
const parseWithdrawalRecord = (line: string): AutoGiroWithdrawalRecord => {
  return {
    payeeBankAccount: line.substring(2, 2 + 35),
    paymentDate: line.substring(37, 37 + 8),
    withdrawalSerialNumber: line.substring(45, 45 + 5),
    approvedAmount: parseInt(line.substring(50, 50 + 18)),
    numberOfApprovedPayments: parseInt(line.substring(71, 71 + 8)),
    payments: [],
  };
};

/**
 * Section 8.2.2 in technical specification
 */
type AutoGiroOutgoingPaymentRecord = {
  paymentDate: string;
  periodCode: string;
  numberOfRecurringPaymens: string;
  payerNumber: string;
  amount: number;
  payeeBankGiroNumber: string;
  paymentReference: string;
  paymentStatusCode: AutoGiroPaymentStatusCode;
};
const parseOutgoingPaymentRecord = (line: string): AutoGiroOutgoingPaymentRecord => {
  return {
    paymentDate: line.substring(2, 2 + 8),
    periodCode: line.substring(10, 10 + 1),
    numberOfRecurringPaymens: line.substring(11, 11 + 3),
    payerNumber: line.substring(15, 15 + 16),
    amount: parseInt(line.substring(31, 31 + 12)),
    payeeBankGiroNumber: line.substring(43, 43 + 10),
    paymentReference: line.substring(53, 53 + 16),
    paymentStatusCode: parseInt(line.substring(79, 79 + 1)),
  };
};

/**
 * Section 8.2.2 in technical specification
 */
type AutoGiroWithdrawalRefundRecord = {
  payeeBankAccount: string;
  paymentDate: string;
  withdrawalSerialNumber: string;
  approvedAmount: number;
  numberOfApprovedPayments: number;
  refunds: AutoGiroPaymentRefundRecord[];
};
const parseWithdrawalRefundRecord = (line: string): AutoGiroWithdrawalRefundRecord => {
  return {
    payeeBankAccount: line.substring(2, 2 + 35),
    paymentDate: line.substring(37, 37 + 8),
    withdrawalSerialNumber: line.substring(45, 45 + 5),
    approvedAmount: parseInt(line.substring(50, 50 + 18)),
    numberOfApprovedPayments: parseInt(line.substring(71, 71 + 8)),
    refunds: [],
  };
};

/**
 * Section 8.2.2 in technical specification
 */
type AutoGiroPaymentRefundRecord = {
  originalPaymentDate: string;
  originalPeriodCode: string;
  originalNumberOfRenewals: number;
  originalPayerNumber: string;
  originalAmount: number;
  payeeBankGiroNumber: string;
  originalPaymentReference: string;
  paymentRefundDate: string;
  paymentRefundCode: AutoGiroPaymentStatusCode;
};
const parsePaymentRefundRecord = (line: string): AutoGiroPaymentRefundRecord => {
  return {
    originalPaymentDate: line.substring(2, 2 + 8),
    originalPeriodCode: line.substring(10, 10 + 1),
    originalNumberOfRenewals: parseInt(line.substring(11, 11 + 3)),
    originalPayerNumber: line.substring(15, 15 + 16),
    originalAmount: parseInt(line.substring(31, 31 + 12)),
    payeeBankGiroNumber: line.substring(43, 43 + 10),
    originalPaymentReference: line.substring(53, 53 + 16),
    paymentRefundDate: line.substring(69, 69 + 8),
    paymentRefundCode: parseInt(line.substring(77, 77 + 2)),
  };
};

/**
 * Section 8.2.3 in technical specification
 */
export enum AutoGiroPaymentStatusCode {
  APPROVED = 0,
  INSUFFICIENT_FUNDS = 1,
  ACCOUNT_CLOSED = 2,
  RENEWED_FUNDS = 9,
}

/**
 * Section 8.2.3 in technical specification
 */
export enum AutoGiroPaymentRefundCodes {
  NO_MANDATE_SUBMITTED = 1,
  MANDATE_WITHDRAWN = 2,
  UNREASONABLE_AMOUNT = 3,
}
