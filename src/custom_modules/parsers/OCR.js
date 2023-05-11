const serviceCodeEnum = require("../../enums/serviceCode");
const transactionCodeEnum = require("../../enums/transactionCode");
const recordTypeEnum = require("../../enums/recordType");
const paymentMethodsEnum = require("../../enums/paymentMethods");
const { utcDate } = require("../utcDate");

module.exports = {
  /**
   * @typedef OCRTransaction
   * @property {number} amount
   * @property {string} transactionID
   * @property {Date} date
   * @property {number} KID
   * @property {import('../../enums/paymentMethods')} paymentMethod
   */

  /**
   * Takes in an OCR file in string form and returns valid transations
   * @param {string} data A string from an OCR file
   * @returns {Array<OCRTransaction>} An array of transactions
   */
  parse: function (data) {
    var lines = data.split(/\r?\n/);

    var transactions = [];

    for (var i = 0; i < lines.length - 1; i++) {
      if (lines[i].length > 0) {
        let currLine = lines[i];
        let nextLine = lines[i + 1];

        const serviceCode = parseInt(currLine.substr(2, 2));
        const transactionCode = parseInt(currLine.substr(4, 2));
        const recordType = parseInt(currLine.substr(6, 2));

        if (
          serviceCode == serviceCodeEnum.ocr &&
          (transactionCode == transactionCodeEnum.btg ||
            transactionCode == transactionCodeEnum.avtalegiro) &&
          recordType == recordTypeEnum.post1
        ) {
          transactions.push(new OCRTransaction(currLine, nextLine, transactionCode));
        }
      }
    }

    return transactions;
  },
};

class OCRTransaction {
  constructor(currLine, nextline, transactionCode) {
    this.transactionCode = transactionCode;
    this.number = currLine.substr(8, 7);

    let year = currLine.substr(19, 2);
    let month = currLine.substr(17, 2);
    let day = currLine.substr(15, 2);
    const date = utcDate(parseInt("20" + year), parseInt(month), parseInt(day));

    this.date = date;
    this.amount = parseInt(currLine.substr(32, 17)) / 100;
    this.KID = currLine.substr(49, 25).trim();

    const archivalReference = nextline.substr(25, 9);
    const transactionRunningNumber = parseInt(nextline.substr(9, 6));
    const transactionID = day + month + year + "." + archivalReference + transactionRunningNumber;

    this.transactionID = transactionID;

    if (transactionCode == transactionCodeEnum.btg) this.paymentMethod = paymentMethodsEnum.bank;
    else if (transactionCode == transactionCodeEnum.avtalegiro)
      this.paymentMethod = paymentMethodsEnum.avtalegiro;
    else throw new Error(`Unknown transaction code ${transactionCode}`);
  }
}
