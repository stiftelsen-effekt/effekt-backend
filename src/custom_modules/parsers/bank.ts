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
};
