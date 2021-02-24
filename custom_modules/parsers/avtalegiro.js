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

        var transactions = [];

        for (var i = 0; i < lines.length-1; i++) {
            if (lines[i].length > 0) {
                let currLine = lines[i]; 

                const serviceCode = currLine.substr(2,2);
                const transactionCode = currLine.substr(4,2);
                const recordType = currLine.substr(6,2);

                //translate these numeric values to enum values
                if(serviceCode == "21" && transactionCode == "94" && recordType == "70"){ 
                    this.transactions.push(new AvtalegiroTransaction(element));
                }
            }
        }

        return transactions
    }
}
class AvtalegiroTransaction{
  constructor(element) {
    this.fboNumber = element.substr(8,7);
    this.KID = element.substr(16,26);
    this.skriftligVarsel = element.substr(41,1);
    this.registrationType = element.substr(15,1);

    //slik jeg forstår det vil vi sjelden få 0 her? Hva betyr i så fall 0?
    if(this.registrationType == 1){
      //bedrevariabelnavn
      this.isTerminated = true;
    } else if(this.registrationType == 2){
      this.isAltered = true;
    }

    //this.amount = substr kid
    //this.date = substr kid
    //this.korholdernavn ? substr kid
  }
}
   

