interface OpeningRecord {
  recordType: RecordType.OpeningRecord;
  totalInId: string;
  timestamp: string;
  deliveryNumber: string;
  fileType: string;
}

interface AccountAndCurrencyStartRecord {
  recordType: RecordType.AccountAndCurrencyStartRecord;
  receivingAccount: string;
  currency: string;
  postingDate: string;
}

interface PaymentRecord {
  recordType: RecordType.PaymentRecord | RecordType.DeductionRecord;
  customerReference: string;
  amount: string;
  transactionSerialNumber: string;
  bankgiroNumber: string;
}

interface DeductionRecord extends PaymentRecord {
  deductionAmount: string;
  deductionCode: string;
}

interface ExtraReferenceNumberRecord {
  recordType: RecordType.ExtraReferenceNumberRecord;
  extraCustomerReferences: string[];
}

interface MessageRecord {
  recordType: RecordType.MessageRecord;
  messages: string[];
}

interface PaymentSenderRecord {
  recordType: RecordType.PaymentSenderRecord;
  name1: string;
  name2?: string;
}

interface AddressRecord {
  recordType: RecordType.AddressRecord;
  address1: string;
  address2?: string;
}

interface PostalCodeCityCountryRecord {
  recordType: RecordType.PostalCodeCityCountryRecord;
  postalCode: string;
  city: string;
  country: string;
}

interface EndRecordAccountAndCurrency {
  recordType: RecordType.EndRecordAccountAndCurrency;
  numberOfTransactions: string;
  totalAmount: string;
  accountStatementReference: string;
}

interface ClosingRecordFile {
  recordType: RecordType.ClosingRecordFile;
  numberOfLines: string;
}

type ReportRecord =
  | OpeningRecord
  | AccountAndCurrencyStartRecord
  | PaymentRecord
  | DeductionRecord
  | ExtraReferenceNumberRecord
  | MessageRecord
  | PaymentSenderRecord
  | AddressRecord
  | PostalCodeCityCountryRecord
  | EndRecordAccountAndCurrency
  | ClosingRecordFile;

export enum RecordType {
  OpeningRecord = "00",
  AccountAndCurrencyStartRecord = "10",
  PaymentRecord = "20",
  DeductionRecord = "25",
  ExtraReferenceNumberRecord = "30",
  MessageRecord = "40",
  PaymentSenderRecord = "50",
  AddressRecord = "51",
  PostalCodeCityCountryRecord = "52",
  EndRecordAccountAndCurrency = "90",
  ClosingRecordFile = "99",
}

export const parseTotalInFile = (fileContent: string): ReportRecord[] => {
  const lines = fileContent.split("\n");
  const records: ReportRecord[] = [];

  lines.forEach((line) => {
    const recordType = line.substring(0, 2);
    switch (recordType) {
      case RecordType.OpeningRecord:
        records.push({
          recordType,
          totalInId: line.substring(2, 14).trim(),
          timestamp: line.substring(14, 34).trim(),
          deliveryNumber: line.substring(34, 36).trim(),
          fileType: line.substring(37, 39).trim(),
        });
        break;
      case RecordType.AccountAndCurrencyStartRecord:
        records.push({
          recordType,
          receivingAccount: line.substring(2, 38).trim(),
          currency: line.substring(38, 41).trim(),
          postingDate: line.substring(41, 49).trim(),
        });
        break;
      case RecordType.PaymentRecord:
        records.push({
          recordType,
          customerReference: line.substring(2, 37).trim(),
          amount: line.substring(37, 52).trim(),
          transactionSerialNumber: line.substring(52, 69).trim(),
          bankgiroNumber: line.substring(69, 77).trim(),
        });
        break;
      case RecordType.DeductionRecord:
        records.push({
          recordType,
          customerReference: line.substring(2, 37).trim(),
          amount: line.substring(37, 52).trim(),
          transactionSerialNumber: line.substring(52, 69).trim(),
          bankgiroNumber: line.substring(69, 77).trim(),
        });
        break;
      case RecordType.ExtraReferenceNumberRecord:
        records.push({
          recordType,
          extraCustomerReferences: [line.substring(2, 37).trim(), line.substring(37, 72).trim()],
        });
        break;
      case RecordType.MessageRecord:
        records.push({
          recordType,
          messages: [line.substring(2, 37).trim(), line.substring(37, 72).trim()],
        });
        break;
      case RecordType.PaymentSenderRecord:
        records.push({
          recordType,
          name1: line.substring(2, 37).trim(),
          name2: line.substring(37, 72).trim(),
        });
        break;
      case RecordType.AddressRecord:
        records.push({
          recordType,
          address1: line.substring(2, 37).trim(),
          address2: line.substring(37, 72).trim(),
        });
        break;
      case RecordType.PostalCodeCityCountryRecord:
        records.push({
          recordType,
          postalCode: line.substring(3, 11).trim(),
          city: line.substring(12, 46).trim(),
          country: line.substring(47, 49).trim(),
        });
        break;
      case RecordType.EndRecordAccountAndCurrency:
        records.push({
          recordType,
          numberOfTransactions: line.substring(2, 7).trim(),
          totalAmount: line.substring(7, 22).trim(),
          accountStatementReference: line.substring(22, 37).trim(),
        });
        break;
      case RecordType.ClosingRecordFile:
        records.push({
          recordType,
          numberOfLines: line.substring(2, 17).trim(),
        });
        break;
    }
  });

  return records;
};
