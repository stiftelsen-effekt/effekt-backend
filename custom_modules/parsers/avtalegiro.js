const serviceCodeEnum = require('../../enums/serviceCode')
const transactionCodeEnum = require('../../enums/transactionCode')
const recordTypeEnum = require('../../enums/recordType')
const transactionCode = require('../../enums/transactionCode')

module.exports = {
    /**
     * @typedef AvtalegiroAgreement
     * @property {number} fboNumber
     * @property {string} KID
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
    this.notice = element.substr(41,1);
    let registrationType = element.substr(15,1);

    //slik jeg forstår det vil vi sjelden få 0 her? Hva betyr i så fall 0?
    if(registrationType == 1){
      this.isTerminated = true;
    } else if(registrationType == 2){
      this.isAltered = true;
    }
  }
}
   

