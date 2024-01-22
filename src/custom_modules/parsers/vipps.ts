import moment from "moment";
import { parse } from "csv-parse/sync";
const parseUtil = require("./util");

const fieldMapping = {
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
 * Parses a csv file from vipps reports
 * @param {Buffer} report A file buffer, from a csv comma seperated file
 * @return {Object} An object with a min- and maxDate field, representing the minimum and maximum date from the provided transactions, and an array of transactions in the field transaction
 */
export const parseReport = (report) => {
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
      return false;
    }
  }

  let currentMinDate = null;
  let currentMaxDate = null;
  let transactions = data.reduce((acc, dataRow) => {
    let transaction = buildTransactionFromArray(dataRow);
    if (transaction == false) return acc;
    if (transaction.date.toDate() < currentMinDate || currentMinDate == null)
      currentMinDate = transaction.date.toDate();
    if (transaction.date.toDate() > currentMaxDate || currentMaxDate == null)
      currentMaxDate = transaction.date.toDate();
    acc.push(transaction);
    return acc;
  }, []);

  return {
    minDate: currentMinDate,
    maxDate: currentMaxDate,
    transactions: transactions,
  };
};

const buildTransactionFromArray = (inputArray) => {
  if (inputArray[fieldMapping.TransactionType] !== "Salg") return false;
  let transaction = {
    date: moment.utc(inputArray[fieldMapping.SalesDate], "DD.MM.YYYY"),
    location: inputArray[fieldMapping.SalesLocation],
    transactionID: inputArray[fieldMapping.TransactionID],
    amount: Number(inputArray[fieldMapping.GrossAmount].replace(/,/g, ".").replace(/\s/g, "")),
    name: inputArray[fieldMapping.FirstName] + " " + inputArray[fieldMapping.LastName],
    message: inputArray[fieldMapping.Message],
    KID: parseUtil.extractKID(inputArray[fieldMapping.Message]),
  };

  return transaction;
};

module.exports = {
  parseReport,
};
