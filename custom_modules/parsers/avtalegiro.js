const serviceCodeEnum = require('../enums/serviceCode')
const transactionCodeEnum = require('../enums/transactionCode')
const recordTypeEnum = require('../enums/recordType')
const transactionCode = require('../../enums/transactionCode')

module.exports = {
    /**
     * @typedef AvtalegiroTransaction
     * @property {number} fboNumber
     * @property {string} KID
     * @property {boolean} isAltered
     * @property {boolean} isTerminated
     */

    /**
     * Takes in an OCR file in string form and returns valid transations
     * @param {string} data A string from an OCR file
     * @returns {Array<AvtalegiroTransaction>} An array of transactions
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
    this.fboNumber = parseInt(element.substr(8,7));
    this.KID = parseInt(element.substr(16,26));
    this.notice = element.substr(41,1);
    let registrationType = element.substr(15,1);

    //slik jeg forstår det vil vi sjelden få 0 her? Hva betyr i så fall 0?
    if(registrationType == 1){
      this.isTerminated = true;
    } else if(registrationType){
      this.isAltered = true;
    }
  }
}
   

