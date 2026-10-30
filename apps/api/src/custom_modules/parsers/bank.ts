import moment from "moment";
import { parse } from "csv-parse/sync";

const parseUtil = require("./util");

const fieldMapping = {
  date: 0,
  message: 1,
  sum: 3,
  externalRef: 5,
  KID: 6,
};

/**
 * @typedef BankCustomTransactions
 * @property {string} message
 * @property {number} amount
 * @property {string} KID
 * @property {moment.Moment} date
 * @property {string} externalRef
 */

/**
 * Parses a the custom bank format for donations without KID
 * @param {Buffer} report A file buffer, from a csv comma seperated file
 * @return {Array<BankCustomTransactions>}
 */
export const parseReport = (report) => {
  let reportText = report.toString();
  try {
    var data = parse(reportText, {
      delimiter: ";",
      bom: true,
      skip_empty_lines: true,
    });
  } catch (ex) {
    try {
      var data = parse(reportText, {
        delimiter: ",",
        bom: true,
        skip_empty_lines: true,
      });
    } catch (ex) {
      console.error("Using comma delimiter failed.");
      console.error("Parsing bank custom transactions failed.");
      console.error(ex);
      return false;
    }
  }

  let transactions = data.reduce((acc, row, i) => {
    if (i !== 0) acc.push(parseRow(row));
    return acc;
  }, []);

  return transactions;
};

const REQUIRED_COLUMNS = Math.max(...Object.values(fieldMapping)) + 1;

/**
 * Checks that a file is the Norwegian bank account export parseReport expects (header plus rows
 * of date DD.MM.YYYY, text, -, sum, -, reference, KID). Returns why it isn't, or null.
 */
export const validateReport = (report): string | null => {
  const reportText = report.toString();
  let data: string[][] | undefined;
  // Like parseReport, semicolon first, then comma; keep the first with enough columns
  for (const delimiter of [";", ","]) {
    try {
      const parsed: string[][] = parse(reportText, {
        delimiter,
        bom: true,
        skip_empty_lines: true,
      });
      if (!data || (parsed[0]?.length ?? 0) > (data[0]?.length ?? 0)) data = parsed;
      if ((data[0]?.length ?? 0) >= REQUIRED_COLUMNS) break;
    } catch {
      // try the next delimiter
    }
  }
  if (!data) return "the file is not a CSV file";
  if (data.length < 2) return "the file has no transactions";
  if (data[0].length < REQUIRED_COLUMNS) {
    return `expected at least ${REQUIRED_COLUMNS} columns, found ${data[0].length}`;
  }
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const line = `row ${i + 1}`;
    if (row.length < REQUIRED_COLUMNS) return `${line} has ${row.length} columns`;
    if (!moment.utc(row[fieldMapping.date], "DD.MM.YYYY", true).isValid()) {
      return `${line} has no date in the first column (DD.MM.YYYY)`;
    }
    const amount = Number(row[fieldMapping.sum].replace(/\./g, "").replace(/\,/g, "."));
    if (row[fieldMapping.sum].trim() === "" || !Number.isFinite(amount)) {
      return `${line} has no amount in the fourth column`;
    }
  }
  return null;
};

/**
 * Parses a row from the
 * @param {Array<string>} row
 * @returns {BankCustomTransactions}
 */
const parseRow = (row: Array<string>) => {
  return {
    date: moment.utc(row[fieldMapping.date], "DD.MM.YYYY"),
    message: row[fieldMapping.message].replace(/(\r\n|\r|\n)/g, ""),
    amount: Number(row[fieldMapping.sum].replace(/\./g, "").replace(/\,/g, ".")),
    KID: parseUtil.extractKID(row[fieldMapping.KID]),
    transactionID: row[fieldMapping.externalRef],
    paymentID: 5,
  };
};

module.exports = {
  parseReport,
  parseRow,
  validateReport,
};
