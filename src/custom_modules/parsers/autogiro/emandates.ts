import { DateTime } from "luxon";
import {
  AutoGiroContent,
  AutoGiroOpeningRecord,
  AutoGiroParsedResult,
  AutoGiroTransactionCode,
  getTransactionCode,
} from "../autogiro";

/**
 * Parses a e-mandate file (see section 8.6 in technical specification)
 * This file contains information about mandates from internet banks
 * The opening record contains information about the file layout, which determines
 * how the rest of the file should be parsed.
 * It's our responsibility to verify the contents of the mandates before we approve
 * them with Bankgirot.
 * @param lines All the lines in the file, except the opening record
 * @param openingRecord The parsed opening record
 * @returns An object containing the parsed information from the file
 */
export const parseEMandates = (lines: string[], openingRecord: AutoGiroOpeningRecord) => {
  let result: AutoGiroParsedEMandatesResult = {
    reportContents: AutoGiroContent.E_MANDATES,
    openingRecord,
    emandates: [],
  };

  for (const line of lines) {
    const transactionCode = getTransactionCode(line);

    switch (transactionCode) {
      case AutoGiroTransactionCode.E_MANDATE_INFORMATION_RECORD:
        const eMandateInformation = parseEMandateInformationRecord(line);
        result.emandates.push({
          ...eMandateInformation,
          information: {
            specialInformation: "",
            payerNameAndAddress: "",
            postNumber: "",
            postAddress: "",
          },
        });
        break;
      case AutoGiroTransactionCode.E_MANDATE_SPECIAL_INFORMATION_RECORD:
        const eMandateSpecialInformation = parseEMandateSpecialInformationRecord(line);
        result.emandates[result.emandates.length - 1].information.specialInformation =
          eMandateSpecialInformation.specialInformation;
        break;
      case AutoGiroTransactionCode.E_MANDATE_NAME_AND_ADDRESS_FIRST_RECORD:
        const eMandateNameAndAddressFirst = parseEMandatePayerNameAndAddressRecord(line);
        result.emandates[
          result.emandates.length - 1
        ].information.payerNameAndAddress = `${eMandateNameAndAddressFirst.firstLine} ${eMandateNameAndAddressFirst.secondLine}`;
        break;
      case AutoGiroTransactionCode.E_MANDATE_NAME_AND_ADDRESS_SECOND_RECORD:
        const eMandateNameAndAddressSecond = parseEMandatePayerNameAndAddressRecord(line);
        result.emandates[
          result.emandates.length - 1
        ].information.payerNameAndAddress += ` ${eMandateNameAndAddressSecond.firstLine} ${eMandateNameAndAddressSecond.secondLine}`;
        break;
      case AutoGiroTransactionCode.E_MANDATE_POST_NUMBER_RECORD:
        const eMandatePostNumber = parseEMandatePostNumberRecord(line);
        result.emandates[result.emandates.length - 1].information.postNumber =
          eMandatePostNumber.postNumber;
        result.emandates[result.emandates.length - 1].information.postAddress =
          eMandatePostNumber.postAddress;
        break;
      case AutoGiroTransactionCode.E_MANDATE_END_RECORD:
        break;
      default:
        throw new Error(
          `Not a valid autogiro file, unknown transaction code (${transactionCode}) for file contents ${openingRecord.fileContents}`,
        );
    }

    if (transactionCode === AutoGiroTransactionCode.E_MANDATE_END_RECORD) break;
  }

  return result;
};

interface AutoGiroParsedEMandatesResult extends AutoGiroParsedResult {
  reportContents: AutoGiroContent.E_MANDATES;
  emandates: AutoGiroParsedEMandate[];
}

export type AutoGiroParsedEMandate = {
  payeeBankGiroNumber: string;
  payerNumber: string;
  payerBankAccountNumber: string;
  payerSsn: string;
  informationCode: AutoGiroEMandateInformationCodes;
  information: {
    specialInformation: string;
    payerNameAndAddress: string;
    postNumber: string;
    postAddress: string;
  };
};

enum AutoGiroEMandateInformationCodes {
  NEW = 0,
  FIRST_REMINDER = 1,
  SECOND_REMINDER = 2,
}

type AutoGiroEMandateInformationRecord = Omit<AutoGiroParsedEMandate, "information">;
const parseEMandateInformationRecord = (line: string): AutoGiroEMandateInformationRecord => {
  return {
    payeeBankGiroNumber: line.substring(2, 2 + 10),
    payerNumber: line.substring(13, 13 + 15),
    payerBankAccountNumber: line.substring(28, 28 + 16),
    payerSsn: line.substring(44, 44 + 12),
    informationCode: parseInt(line.substring(61, 61 + 1)) as AutoGiroEMandateInformationCodes,
  };
};

type AutoGiroEMandateSpecialInformationRecord = {
  specialInformation: string;
};
const parseEMandateSpecialInformationRecord = (
  line: string,
): AutoGiroEMandateSpecialInformationRecord => {
  return {
    specialInformation: line.substring(2, 2 + 36),
  };
};

type AutoGiroEMandatePayerNameAndAddressRecord = {
  firstLine: string;
  secondLine: string;
};
const parseEMandatePayerNameAndAddressRecord = (
  line: string,
): AutoGiroEMandatePayerNameAndAddressRecord => {
  return {
    firstLine: line.substring(2, 2 + 36).trim(),
    secondLine: line.substring(38, 38 + 36).trim(),
  };
};

type AutoGiroEMandatePostNumberRecord = {
  postNumber: string;
  postAddress: string;
};
const parseEMandatePostNumberRecord = (line: string): AutoGiroEMandatePostNumberRecord => {
  return {
    postNumber: line.substring(2, 2 + 5),
    postAddress: line.substring(7, 7 + 31).trim(),
  };
};
