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
                var transaction = this.parseLine(lines[i], lines[i+1])

                if (transaction.transactionCode == 13 && transaction.recordType == 30) transactions.push(transaction)
            }
        }

        return transactions
    },

    parseLine: function(line, nextline) {
        /**
         * @type Transaction
         * */

        function Transaction(line) {
            this.serviceCode = parseInt(line.substr(2,2));
            this.transactionCode = parseInt(line.substr(4,2));
            this.recordType = parseInt(line.substr(6,2));
        }

        transaction = new Transaction(line)

        // enums 
        // lage et objekt 
        // is hva enn 9, 13 og 30 
        if (transaction.serviceCode == 9 && 
            transaction.transactionCode == 13 && 
            transaction.recordType == 30 &&
            nextline != null) {
            const number = parseInt(8,7)

            transaction.number = number

            let year = line.substr(19,2)
            let month = line.substr(17,2)
            let day = line.substr(15,2)

            const date = new Date(
                parseInt("20" + year),
                parseInt(month)-1,
                parseInt(day))

            transaction.date = date

            const amount = parseInt(line.substr(32, 17)) / 100

            transaction.amount = amount

            const KID = parseInt(line.substr(49, 25))

            transaction.KID = KID

            const archivalReference = nextline.substr(25, 9)
            const transactionRunningNumber = parseInt(nextline.substr(9,6))
            const transactionID = day + month + year + "." + archivalReference + transactionRunningNumber

            transaction.transactionID = transactionID
            transaction.paymentID = BANK_ID
        } else if(
            transaction.serviceCode == 00 
        ){

        }

        return transaction
    }
}