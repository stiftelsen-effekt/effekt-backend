const serviceCodeEnum = require('../../enums/serviceCode')
const transactionCodeEnum = require('../../enums/transactionCode')
const recordTypeEnum = require('../../enums/recordType')
const transactionCode = require('../../enums/transactionCode')

module.exports = {
    /**
     * @typedef AvtalegiroAgreement
     * @property {number} fboNumber
     * @property {string} KID
     * @property {boolean} notice
     * @property {boolean} isAltered
     * @property {boolean} isTerminated
     */

    /**
     * Takes in an OCR file in string form and returns valid transations
     * @param {string} data A string from an OCR file
     * @returns {Array<AvtalegiroAgreement>} An array of transactions
     */
    parse: function(data) {
        var lines = data.split('\r\n')

        var agreements = [];

        for (var i = 0; i < lines.length-1; i++) {
            if (lines[i].length > 0) {
                let currLine = lines[i]; 

                const serviceCode = currLine.substr(2,2);
                const transactionCode = currLine.substr(4,2);
                const recordType = currLine.substr(6,2);

                //translate these numeric values to enum values
                if(serviceCode == "21" && transactionCode == "94" && recordType == "70"){ 
                    this.transactions.push(new AvtalegiroAgreement(element));
                }
            }
        }
        
        return agreements
    }
}
class AvtalegiroAgreement{
  constructor(element) {
    this.fboNumber = parseInt(element.substr(8,7));
    this.KID = parseInt(element.substr(16,26));
    this.notice = (element.substr(41,1) == 1);
    let registrationType = element.substr(15,1);

    if (registrationType == 0) {
      /**
       * We can ask nets to list ALL of the active agreements on the account
       * They will then get 0 as their registration type
       */
      this.totalReadout = true;
    }
    if(registrationType == 1) {
      this.isTerminated = true;
    }
  }
}
   

