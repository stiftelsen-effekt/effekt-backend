const serviceCodeEnum = require('../enums/serviceCode')
const transactionCodeEnum = require('../enums/transactionCode')
const recordTypeEnum = require('../enums/recordType')

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

        var transactions = []
        for (var i = 0; i < lines.length-1; i++) {
            if (lines[i].length > 0) {
                transactions.push(new Transaction(lines[i], lines[i+1]));
            }
        }

        return transactions
    }
}

class Transaction{
    constructor(line, nextline) {
        this.serviceCode = parseInt(line.substr(2,2));
        this.transactionCode = parseInt(line.substr(4,2));
        this.recordType = parseInt(line.substr(6,2));

        if(this.isOCR || this.isAvtaleGiro){
            if(this.isBeløpsPost1){
                this.number = parseInt(8,7);
                                
                let day = line.substr(15,2);
                let month = line.substr(17,2);
                let year = line.substr(19,2);

                this.date = function() {        
                    return parseInt("20" + year), parseInt(month)-1, parseInt(day)
                };
        
                this.amount = function() {
                    return parseInt(line.substr(32, 17)) / 100;
                };
        
                this.KID = line.substr(49, 25);
                
                if(this.nextline){
                    const recordType = parseInt(line.substr(6,2));
                    if(recordType != recordTypeEnum.post2)
                        return;
                    this.transNr = nextline.substr(8,7)
                    // ??
                    // const transactionRunningNumber = parseInt(nextline.substr(9,6))
                    this.archivalReference = nextline.substr(25, 9)

                    this.transactionID = day + month + year + "." + this.archivalReference + this.transactionRunningNumber
                }
            }
        }
        
    }
    
    isOCR() {
        return this.serviceCode == serviceCodeEnum.ocr 
        // this.transactionCode == this.transactionCode.btg && 
        // this.recordType == this.recordType.post1 &&
        // nextline != null;
    };

    isAvtaleGiro(){
        return this.serviceCode == serviceCodeEnum.avtalegiro 
        // && this.recordType == this.recordType.post1
    }

    isBeløpsPost1() {
        return this.recordType == recordTypeEnum.post1
    }
    
    isBeløpsPost2() {
        return this.recordType == recordTypeEnum.post2
    }
    
}


