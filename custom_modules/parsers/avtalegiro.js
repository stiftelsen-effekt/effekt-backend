const serviceCodeEnum = require('../../enums/serviceCode')
const transactionCodeEnum = require('../../enums/transactionCode')
const recordTypeEnum = require('../../enums/recordType')

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

        var agreements = []

        for (var i = 0; i < lines.length-1; i++) {
            if (lines[i].length > 0) {
                let currLine = lines[i];

                const serviceCode = parseInt(currLine.substr(2,2))
                const transactionCode = parseInt(currLine.substr(4,2))
                const recordType = parseInt(currLine.substr(6,2))

                if(serviceCode == serviceCodeEnum.avtaleGiro && transactionCode == transactionCodeEnum.avtalegiroInfo && recordType == recordTypeEnum.avtaleGiroInfo) { 
                  agreements.push(new AvtalegiroAgreement(currLine))
                }
            }
        }
        
        return agreements
    }
}

class AvtalegiroAgreement {
  constructor(currLine) {
    this.fboNumber = parseInt(currLine.substr(8,7))
    this.KID = parseInt(currLine.substr(16,26))
    this.notice = (currLine.substr(41,1) == 1)
    let registrationType = currLine.substr(15,1)

    if (registrationType == 0) {
      /**
       * We can ask nets to list ALL of the active agreements on the account
       * They will then get 0 as their registration type
       */
      this.totalReadout = true
    }
    if(registrationType == 1) {
      this.isTerminated = true
    }
  }
}
   

