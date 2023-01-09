import fetch from "node-fetch";
import { parse } from "csv-parse/sync";
import { DAO } from "../DAO";

const parseUtil = require("./util");

/**
 * Parses a csv file from vipps reports
 * @param {Buffer} report A file buffer, from a csv comma seperated file
 * @return {Object} An object with a min- and maxDate field, representing the minimum and maximum date from the provided transactions, and an array of transactions in the field transaction
 */
export const parseReport = async (report) => {
  let reportText = report.toString();
  try {
    var data = parse(reportText, {
      delimiter: ",",
      bom: true,
      skip_empty_lines: true,
    });

    const columns = data.shift();
    const chargeDateIndex = columns.indexOf("Charge date");

    let firstDate = data[0][chargeDateIndex];
    let lastDate = firstDate;
    let payoutCurrencies = [];

    data.forEach((donation) => {
      firstDate =
        firstDate < donation[chargeDateIndex]
          ? firstDate
          : donation[chargeDateIndex];
      lastDate =
        lastDate > donation[chargeDateIndex]
          ? lastDate
          : donation[chargeDateIndex];
      const payoutCurrencyIndex = columns.indexOf("Payout currency");
      const payoutCurrency = donation[payoutCurrencyIndex];
      if (!payoutCurrencies.includes(payoutCurrency))
        payoutCurrencies.push(payoutCurrency);
    });

    lastDate = incrementISODate(lastDate);
    firstDate = incrementISODate(firstDate, -10);

    const params = new URLSearchParams({
      startPeriod: firstDate,
      endPeriod: lastDate,
    });
    const query = params.toString();

    const allExchangeRates = {};

    for (let i = 0; i < payoutCurrencies.length; i++) {
      const exchangeRateURL = `https://data.norges-bank.no/api/data/EXR/B.${payoutCurrencies[i]}.NOK.SP?format=sdmx-json&locale=no${query}`;
      const exchangeRatesData = await fetch(exchangeRateURL).then((res) =>
        res.json()
      );

      const exchangeDates =
        exchangeRatesData.data.structure.dimensions.observation[0].values;
      const exchangeRates =
        exchangeRatesData.data.dataSets[0].series["0:0:0:0"].observations;

      // Create dict { date: (exchange rate EUR to NOK) }
      let exchangeDateRateDict: { [date: string]: number } = {};
      for (let i = 0; i < exchangeDates.length; i++) {
        exchangeDateRateDict[exchangeDates[String(i)].name] = parseFloat(
          exchangeRates[i][0]
        );
      }
      allExchangeRates[payoutCurrencies[i]] = exchangeDateRateDict;
    }

    let transactions = [];
    let updateStatements = [];
    for (let i = 0; i < data.length; i++) {
      const dataRow = data[i];
      let firstName = dataRow[columns.indexOf("First name")];
      let surname = dataRow[columns.indexOf("Last name")];
      let email = dataRow[columns.indexOf("Email address")];
      let currency = dataRow[columns.indexOf("Payout currency")];

      if (typeof email !== "string") email = "";
      if (typeof firstName !== "string") firstName = "";
      if (typeof surname !== "string") surname = "";

      let fullName = titleCase((firstName + " " + surname).trim());
      if (fullName === "") {
        fullName = "Missing name FB";
      }

      let transaction = {
        FullName: fullName,
        Email: email,
      };

      for (let i = 0; i < columns.length; i++) {
        transaction[columns[i]] = dataRow[i];
      }

      let exchangeDate = transaction["Charge date"];

      let exchangeRate: number = undefined;
      for (let i = 0; i < 10; i++) {
        exchangeRate = allExchangeRates[currency][exchangeDate];
        exchangeDate = incrementISODate(exchangeDate, -1);
        if (exchangeRate !== undefined) break;
      }

      if (exchangeRate === undefined) {
        console.error(
          `No exchange rate found for ${currency} on ${transaction["Charge date"]}`
        );
        throw new Error(`No exchange rate found for ${currency}`);
      }

      let sumNOK =
        parseFloat(transaction["Net payout amount"].replace(",", "")) *
        exchangeRate;

      console.log(
        `Payout amount ${transaction["Net payout amount"]} times exchange rate ${exchangeRate} = ${sumNOK}`
      );
      if (transaction["Sender currency"] == "NOK") {
        sumNOK = roundSum(sumNOK);
      } else {
        sumNOK = Math.round(sumNOK);
      }
      // Prints the rounded sum in green in the console using unix color codes
      console.log(
        `Rounded sumNOK: \x1b[32m${sumNOK}\x1b[0m (${transaction["Sender currency"]})`
      );
      transaction["sumNOK"] = sumNOK;

      const registeredDonation = await DAO.donations.getByExternalPaymentID(
        transaction["Payment ID"],
        9
      );
      if (registeredDonation) {
        if (sumNOK != registeredDonation.sum_confirmed) {
          // Print the difference in red in the console using unix color codes
          console.log(
            `Registered: ${
              registeredDonation.sum_confirmed
            } New: ${sumNOK} \x1b[31m${
              sumNOK - registeredDonation.sum_confirmed
            }\x1b[0m for donation with ID ${registeredDonation.ID}`
          );
          updateStatements.push(
            `UPDATE Donations SET sum_confirmed = ${sumNOK} WHERE ID = ${registeredDonation.ID};`
          );
        }
      }

      transactions.push(transaction);
    }

    console.log(updateStatements.join("\n"));
    return transactions;
  } catch (ex) {
    console.error("Parsing facebook failed.");
    console.error(ex);
    return false;
  }
};

function titleCase(str: string) {
  return str
    .toLowerCase()
    .split(" ")
    .map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function incrementISODate(date: string, NumOfDays = 1) {
  var nextDay = new Date(date);
  var dateValue = nextDay.getDate() + NumOfDays;
  nextDay.setDate(dateValue);
  return nextDay.toISOString().slice(0, 10);
}

export const roundSum = (sumNOK: number): number => {
  let significant = 1;

  let rounded = roundToSignificantFigures(sumNOK, significant);
  while (
    Math.abs(sumNOK / rounded - 1) > 0.051 &&
    String(Math.round(sumNOK)).length > significant
  ) {
    significant += 1;
    rounded = roundToSignificantFigures(sumNOK, significant);
  }
  return rounded;
};

function roundToSignificantFigures(number: number, signFig: number) {
  let sumLog = number.toFixed().length - 1;
  let roundingConst = 10 ** (sumLog + 1 - signFig);
  if (roundingConst < 1) roundingConst = 1;
  const res = Math.round(number / roundingConst) * roundingConst;
  return res;
}

module.exports = {
  parseReport,
  roundSum,
};
