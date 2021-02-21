const serviceCodeEnum = require('../enums/serviceCode')
const transactionCodeEnum = require('../enums/transactionCode')
const recordTypeEnum = require('../enums/recordType')
const transactionCode = require('../../enums/transactionCode')

const BANK_ID = 2

module.exports = {
    /**
     * @typedef Transaction
     * @property {number} transactionCode
     * @property {number} recordType
     * @property {number} serviceCode
     * @property {number} amount
     * @property {string} transactionID
     * @property {Date} date
     * @property {number} KID
     */

    /**
     * Takes in an OCR file in string form and returns valid transations
     * @param {string} data A string from an OCR file
     * @returns {Array<Transaction>} An array of transactions
     */
    parse: function(data) {
        var lines = data.split('\r\n')

        var transactions = {
            ocrTransactions = [],
            avtalegiroTransactions = []
        }
        for (var i = 0; i < lines.length-1; i++) {
            if (lines[i].length > 0) {
                let currLine = lines[i]; 
                let nextLine = lines[i+1]; 

                const serviceCode = currLine.substr(2,2);
                const transactionCode = currLine.substr(4,2);
                const recordType = currLine.substr(6,2);

                if(serviceCode == serviceCodeEnum.ocr && transactionCode == transactionCodeEnum.btg && recordType == recordTypeEnum.post1){ 
                    this.transactions.ocrTransactions.push(new OCRTransaction(element, nextLine));
                } else if(serviceCode == serviceCodeEnum.avtalegiro && transactionCode == transactionCodeEnum.egneKundersFasteBetalingsoppdrag){
                    this.transactions.avtalegiroTransactions.push(new AvtalegiroTransaction(element));
                }
            }
        }

        return transactions
    }
}

class AvtalegiroTransaction{
    constructor(element) {
      this.fboNumber = element.substr(8,7);
      this.registrationType = element.substr(15,1);
      this.kid = element.substr(16,26);
      this.notice = element.substr(41,1);
    }
  }
  
  class OCRTransaction{
    constructor(element, nextline) {
      this.number = element.substr(8,7);
  
      let year = element.substr(19,2);
      let month = element.substr(17,2);
      let day = element.substr(15,2);
      const date = new Date(
        parseInt("20" + year),
        parseInt(month)-1,
        parseInt(day)
      );
  
      this.date = date;
      this.amount = parseInt(element.substr(32, 17)) / 100;
      this.kid = parseInt(element.substr(49, 25));
  
      const archivalReference = nextline.substr(25, 9);
      const transactionRunningNumber = parseInt(nextline.substr(9,6));
      const transactionID = day + month + year + "." + archivalReference + transactionRunningNumber;
    
      this.transactionID = transactionID;
      this.paymentID = "2"
    }
  }
   

