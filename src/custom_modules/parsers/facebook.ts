import fetch from "node-fetch";
import { parse } from "csv-parse/sync";

const parseUtil = require("./util");

module.exports = {
  /**
   * Parses a csv file from vipps reports
   * @param {Buffer} report A file buffer, from a csv comma seperated file
   * @return {Object} An object with a min- and maxDate field, representing the minimum and maximum date from the provided transactions, and an array of transactions in the field transaction
   */
  parseReport: async function (report) {
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

      data.forEach((donation) => {
        firstDate =
          firstDate < donation[chargeDateIndex]
            ? firstDate
            : donation[chargeDateIndex];
        lastDate =
          lastDate > donation[chargeDateIndex]
            ? lastDate
            : donation[chargeDateIndex];
      });

      lastDate = incrementISODate(lastDate);
      firstDate = incrementISODate(firstDate, -10);

      const params = new URLSearchParams({
        startPeriod: firstDate,
        endPeriod: lastDate,
      });
      const query = params.toString();
      const exchangeRateURL = `https://data.norges-bank.no/api/data/EXR/B.EUR.NOK.SP?format=sdmx-json&locale=no${query}`;
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

      let transactions = data.reduce((acc, dataRow) => {
        let firstName = dataRow[columns.indexOf("First name")];
        let surname = dataRow[columns.indexOf("Last name")];
        let email = dataRow[columns.indexOf("Email address")];

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
          exchangeRate = exchangeDateRateDict[exchangeDate];
          exchangeDate = incrementISODate(exchangeDate, -1);
          if (exchangeRate !== undefined) break;
        }
        let sumNOK =
          parseFloat(transaction["Net payout amount"].replace(",", "")) *
          exchangeRate;

        if ((transaction["Sender currency"] = "NOK")) {
          const sumNOKOneSignFig = roundToSignificantFigures(sumNOK, 1);

          if (String(sumNOK).length > 1) {
            if (sumNOK / sumNOKOneSignFig - 1 <= 0.03) {
              // Round with only the first digit if the percentage diff is less than treshold
              sumNOK = sumNOKOneSignFig;
            } else {
              sumNOK = roundToSignificantFigures(sumNOK, 2);
            }
          }
        }
        transaction["sumNOK"] = sumNOK;

        acc.push(transaction);
        return acc;
      }, []);

      return transactions;
    } catch (ex) {
      console.error("Parsing facebook failed.");
      console.error(ex);
      return false;
    }
  },
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

function roundToSignificantFigures(number: number, signFig: number) {
  let sumLog = number.toFixed().length - 1;
  let roundingConst = 10 ** (sumLog + 1 - signFig);
  if (roundingConst < 1) roundingConst = 1;
  const res = Math.round(number / roundingConst) * roundingConst;
  return res;
}
