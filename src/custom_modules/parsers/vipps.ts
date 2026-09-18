import moment from "moment";
import { parse } from "csv-parse/sync";
const parseUtil = require("./util");

const legacyFieldMapping = {
  SalesDate: 0,
  SalesLocation: 1,
  TransactionID: 4,
  GrossAmount: 6,
  Fee: 7,
  NetAmount: 8,
  TransactionType: 9,
  FirstName: 14,
  LastName: 15,
  Message: 16,
};

/**
 * New Vipps settlement CSV (Details sheet). Columns are identified by name
 * because Vipps documents that order may change.
 * https://developer.vippsmobilepay.com/docs/knowledge-base/settlements/
 */
const detailsColumnAliases = {
  location: ["Salgssted", "Sales unit"],
  time: ["Tidspunkt", "Time"],
  bookingDate: ["Bokføringsdato", "Booking date"],
  type: ["Type"],
  amount: ["Beløp", "Amount"],
  name: ["Kundens navn", "Customer name"],
  message: ["Melding", "Message"],
  transactionId: ["PSP-referanse", "PSP reference"],
};

const detailsHeaderMarkers = [
  "PSP-referanse",
  "PSP reference",
  "Tidspunkt",
  "Bokføringsdato",
  "Booking date",
];

const captureTypes = new Set(["Salg", "Belastning", "Capture"]);

export type ParsedVippsReport = {
  minDate: Date;
  maxDate: Date;
  transactions: VippsTransaction[];
};

/**
 * Parses a csv file from vipps reports
 * @param {Buffer} report A file buffer, from a csv comma seperated file
 * @return {Object} An object with a min- and maxDate field, representing the minimum and maximum date from the provided transactions, and an array of transactions in the field transaction
 */
export const parseReport = (report): ParsedVippsReport => {
  const data = parseCsvRows(report);

  let currentMinDate = null;
  let currentMaxDate = null;
  let transactions: VippsTransaction[] = [];

  if (isDetailsReport(data)) {
    const columns = resolveDetailsColumns(data[0]);
    transactions = data.slice(1).reduce<VippsTransaction[]>((acc, dataRow) => {
      const transaction = buildTransactionFromDetailsRow(dataRow, columns);
      if (transaction == false) return acc;
      ({ currentMinDate, currentMaxDate } = updateDateRange(
        transaction,
        currentMinDate,
        currentMaxDate,
      ));
      acc.push(transaction);
      return acc;
    }, []);
  } else {
    transactions = (data as any[]).reduce<VippsTransaction[]>((acc, dataRow: any) => {
      const transaction = buildTransactionFromLegacyArray(dataRow);
      if (transaction == false) return acc;
      ({ currentMinDate, currentMaxDate } = updateDateRange(
        transaction,
        currentMinDate,
        currentMaxDate,
      ));
      acc.push(transaction);
      return acc;
    }, []);
  }

  return {
    minDate: currentMinDate,
    maxDate: currentMaxDate,
    transactions: transactions,
  };
};

export type VippsTransaction = {
  date: moment.Moment;
  location: string;
  transactionID: string;
  amount: number;
  name: string;
  message: string;
  KID: string;
};

type DetailsColumns = {
  [K in keyof typeof detailsColumnAliases]: number;
};

const parseCsvRows = (report): string[][] => {
  let reportText = report.toString();
  try {
    var data = parse(reportText, {
      delimiter: ";",
      bom: true,
      skip_empty_lines: true,
    });
    if (data.length == 0 || data[0].length == 1) {
      throw new Error("Parsing failed, probably wrong delimiter.");
    }
  } catch (ex) {
    try {
      var data = parse(reportText, {
        delimiter: ",",
        bom: true,
        skip_empty_lines: true,
      });
    } catch (ex) {
      console.error("Using comma delimiter failed.");
      console.error("Parsing vipps failed.");
      console.error(ex);
      throw new Error("Parsing failed.");
    }
  }

  return data as string[][];
};

const isDetailsReport = (data: string[][]): boolean => {
  if (!data.length) return false;
  const header = data[0].map((cell) => String(cell).trim());
  return detailsHeaderMarkers.some((marker) => header.includes(marker));
};

const resolveDetailsColumns = (headerRow: string[]): DetailsColumns => {
  const header = headerRow.map((cell) => String(cell).trim());
  const columns = {} as DetailsColumns;

  for (const [field, aliases] of Object.entries(detailsColumnAliases)) {
    const index = aliases
      .map((alias) => header.indexOf(alias))
      .find((candidate) => candidate !== -1);
    if (index === undefined) {
      throw new Error(`Vipps details report is missing column: ${aliases.join(" / ")}`);
    }
    columns[field] = index;
  }

  return columns;
};

const updateDateRange = (transaction: VippsTransaction, currentMinDate, currentMaxDate) => {
  if (transaction.date.toDate() < currentMinDate || currentMinDate == null)
    currentMinDate = transaction.date.toDate();
  if (transaction.date.toDate() > currentMaxDate || currentMaxDate == null)
    currentMaxDate = transaction.date.toDate();
  return { currentMinDate, currentMaxDate };
};

const buildTransactionFromLegacyArray = (inputArray): VippsTransaction | false => {
  if (inputArray[legacyFieldMapping.TransactionType] !== "Salg") return false;
  let transaction = {
    date: moment.utc(inputArray[legacyFieldMapping.SalesDate], "DD.MM.YYYY"),
    location: inputArray[legacyFieldMapping.SalesLocation],
    transactionID: inputArray[legacyFieldMapping.TransactionID],
    amount: parseAmount(inputArray[legacyFieldMapping.GrossAmount]),
    name: inputArray[legacyFieldMapping.FirstName] + " " + inputArray[legacyFieldMapping.LastName],
    message: inputArray[legacyFieldMapping.Message],
    KID: parseUtil.extractKID(inputArray[legacyFieldMapping.Message]),
  };

  return transaction;
};

const buildTransactionFromDetailsRow = (
  inputArray: string[],
  columns: DetailsColumns,
): VippsTransaction | false => {
  if (!captureTypes.has(String(inputArray[columns.type] || "").trim())) return false;

  const message = String(inputArray[columns.message] ?? "");
  const date = parseDetailsDate(inputArray[columns.bookingDate], inputArray[columns.time]);
  if (!date || !date.isValid()) return false;

  const amount = parseAmount(inputArray[columns.amount]);
  if (!Number.isFinite(amount) || amount <= 0) return false;

  return {
    date,
    location: String(inputArray[columns.location] ?? "").trim(),
    transactionID: String(inputArray[columns.transactionId] ?? "").trim(),
    amount,
    name: String(inputArray[columns.name] ?? "").trim(),
    message,
    KID: parseUtil.extractKID(message),
  };
};

const parseDetailsDate = (bookingDate, time): moment.Moment | false => {
  if (bookingDate) {
    const parsedBookingDate = moment.utc(
      String(bookingDate).trim(),
      ["YYYY-MM-DD", "DD.MM.YYYY"],
      true,
    );
    if (parsedBookingDate.isValid()) return parsedBookingDate;
  }

  if (time) {
    const parsedTime = moment.utc(
      String(time).trim(),
      ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DDTHH:mm:ss"],
      true,
    );
    if (parsedTime.isValid()) return parsedTime.startOf("day");
  }

  return false;
};

const parseAmount = (value): number => {
  if (value == null) return NaN;
  return Number(String(value).replace(/,/g, ".").replace(/\s/g, ""));
};

module.exports = {
  parseReport,
};
