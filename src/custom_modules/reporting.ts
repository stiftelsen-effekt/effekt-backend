import moment from "moment";

const xlsx = require("node-xlsx").default;

module.exports = {
  /**
   * Creates an excel file from individual donations
   * @param {Array<Donation>} donations An array containing individual donations
   * @param {Array<Organization>} organizations An array of all the organizations in the database
   * @param {Array<PaymentMethod>} paymentMethods An array of paymentmethods in the donation-list
   * @returns {Buffer} The output excel file, as a buffer
   */
  createExcelFromIndividualDonations: function (donations, organizations, paymentMethods) {
    let organizationMapping = new Map();
    const dataStartRow = 4 + paymentMethods.length;

    //A 2-dimensional array representing rows and columns
    let data = [];

    //Convenience variables defining commonly used excel ranges
    let sumifnameColumn = COLUMN_MAPPING[3]; //Metode header

    let sumifcomparisonrange = `${sumifnameColumn + dataStartRow}:${
      sumifnameColumn + (donations.length + dataStartRow)
    }`;
    let sumationGrossRange = `${COLUMN_MAPPING[4] + dataStartRow}:${
      COLUMN_MAPPING[4] + (donations.length + dataStartRow)
    }`;
    let sumationFeesRange = `${COLUMN_MAPPING[5] + dataStartRow}:${
      COLUMN_MAPPING[5] + (donations.length + dataStartRow)
    }`;
    let sumationNetRange = `${COLUMN_MAPPING[6] + dataStartRow}:${
      COLUMN_MAPPING[6] + (donations.length + dataStartRow)
    }`;
    let checkSumRange = `${COLUMN_MAPPING[7]}2:${COLUMN_MAPPING[7 + (organizations.length - 1)]}2`;

    //Generate headers for data
    let headerRow = [
      "Checksum",
      formula(`${COLUMN_MAPPING[4]}2-SUM(${checkSumRange})`),
      "",
      "Metode",
      "Brutto",
      "Avgifter",
      "Netto",
    ];
    let dataTopRow = ["ID", "Donasjon registrert", "Navn"];

    //Sumation-rows
    //Sumation for specific payment methods
    let methodSumationRows = [];
    paymentMethods.forEach((method) => {
      methodSumationRows.push([
        `Antall ${method.name}`,
        formula(`COUNTIF(D${dataStartRow}:D1000,"${method.name}")`),
        "",
        `Sum ${method.name}`,
        formula(`SUMIF(${sumifcomparisonrange}, "${method.name}", ${sumationGrossRange})`),
        formula(`SUMIF(${sumifcomparisonrange}, "${method.name}", ${sumationFeesRange})`),
        formula(`SUMIF(${sumifcomparisonrange}, "${method.name}", ${sumationNetRange})`),
      ]);
    });

    let currentColumn = headerRow.length;

    organizations.forEach((org) => {
      let organizationHeaders = [org.abbriv];
      headerRow.push(...organizationHeaders);

      let sumationColumn = COLUMN_MAPPING[headerRow.length - 1];
      let sumationRange = `${sumationColumn + dataStartRow}:${
        sumationColumn + (donations.length + dataStartRow)
      }`;

      let organizationSumColumns = [formula(`SUM(${sumationRange})`)];

      //Add sumation for each organization filtered on each payment method
      paymentMethods.forEach((method, i) => {
        let organizationSumMethodColumns = [
          formula(`SUMIF(${sumifcomparisonrange}, "${method.name}", ${sumationRange})`),
        ];
        methodSumationRows[i].push(...organizationSumMethodColumns);
      });

      organizationMapping.set(org.id, currentColumn);
      currentColumn += organizationHeaders.length;
    });

    //Generate the actual donation data
    let dataRows = [];

    donations.forEach((donation) => {
      let donationTime = moment(donation.time);
      let donationRow = [
        donation.ID,
        { v: donationTime.utc(true).toDate(), t: "d" }, // XXX this utc stuff, and moments, might not be needed
        donation.name,
        donation.paymentMethod,
        donation.sum,
        Number(donation.transactionCost),
        roundCurrency(donation.sum - Number(donation.transactionCost)),
      ];

      //For each organization in donation
      donation.split.forEach((split) => {
        let startIndex = organizationMapping.get(split.id);

        donationRow[startIndex] = roundCurrency(Number(split.amount));
      });

      dataRows.push(donationRow);
    });

    //Add all the generated data
    data.push(headerRow); //Overall sumation
    data.push(...methodSumationRows); //Sumation for all the payment methods
    data.push([]); //Spacing row
    data.push(dataTopRow); //Headers for individual donations
    data.push(...dataRows); //All the individual donations

    let buffer = xlsx.build([{ name: "Donations", data: data }]);

    return buffer;

    //Helper functions
    function formula(formula) {
      return { v: "", f: `=${formula}` };
    }

    function roundCurrency(num) {
      return Math.round(num * 100) / 100;
    }
  },
};

const COLUMN_MAPPING = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "AA",
  "AB",
  "AC",
  "AD",
  "AE",
  "AF",
  "AG",
  "AH",
  "AI",
  "AJ",
  "AK",
  "AL",
  "AM",
  "AN",
  "AO",
  "AP",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AV",
  "AW",
  "AX",
  "AY",
  "AZ",
  "BA",
  "BB",
  "BC",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BK",
  "BL",
  "BM",
  "BN",
  "BO",
  "BP",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BU",
  "BV",
  "BW",
  "BX",
  "BY",
  "BZ",
];
