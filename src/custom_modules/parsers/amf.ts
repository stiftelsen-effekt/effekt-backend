import { parse } from "csv-parse/sync";
import { DateTime } from "luxon";

const fieldMapping = {
  Month: 0,
  Number: 1,
  Name: 3,
  Date: 4,
  Place: 5,
  Amount: 7,
  AmountEUR: 8,
  AmountNOK: 9,
  Nets: 12,
  People: 13,
  Email: 14,
};

type Transaction = {
  month: string;
  number: string;
  name: string;
  date: DateTime;
  place: string;
  amount: string;
  amountEUR: string;
  amountNOK: number;
  nets: string;
  people: string;
  email: string;
};

export const parseDirectAmfDonationsReport = (report: Buffer): Transaction[] | false => {
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

  const transactions = data.reduce((acc, dataRow) => {
    let transaction = buildTransactionFromArray(dataRow);
    if (transaction == false) return acc;
    acc.push(transaction);
    return acc;
  }, []);

  return transactions;
};

const buildTransactionFromArray = (dataRow) => {
  let transaction = {
    month: dataRow[fieldMapping.Month],
    number: dataRow[fieldMapping.Number],
    name: dataRow[fieldMapping.Name],
    date: DateTime.fromFormat(dataRow[fieldMapping.Date].trim(), "dd.MM.yyyy"),
    place: dataRow[fieldMapping.Place],
    amount: dataRow[fieldMapping.Amount],
    amountEUR: dataRow[fieldMapping.AmountEUR],
    amountNOK: parseFloat(
      dataRow[fieldMapping.AmountNOK].replace(/\,/g, "").replace(/\ /g, "").replace(/kr/g, ""),
    ),
    nets: dataRow[fieldMapping.Nets],
    people: dataRow[fieldMapping.People],
    email: dataRow[fieldMapping.Email],
  };
  if (isNaN(transaction.amountNOK)) {
    console.error("Failed to parse amountNOK");
    console.error(transaction);
    return false;
  }
  return transaction;
};
