module.exports = {
    /**
     * @typedef Transaction
     * @property {number} transactionCode
     * @property {number} recordType
     * @property {number} serviceCode
     * @property {number} amount
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
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].length > 0) {
                var transaction = this.parseLine(lines[i])

                if (transaction.transactionCode == 13 && transaction.recordType == 30) transactions.push(transaction)
            }
        }

        return transactions
    },

    parseLine: function(line) {
        /**
         * @type Transaction
         * */
        var transaction = {}

        transaction.serviceCode = parseInt(line.substr(2,2))
        transaction.transactionCode = parseInt(line.substr(4,2))
        transaction.recordType = parseInt(line.substr(6,2))

        if (transaction.serviceCode == 9 && 
            transaction.transactionCode == 13 && 
            transaction.recordType == 30) {
            const number = parseInt(8,7)

            transaction.number = number

            const date = new Date(
                parseInt("20" + line.substr(19,2)),
                parseInt(line.substr(17,2)),
                parseInt(line.substr(15,2)))

            transaction.date = date

            const amount = parseInt(line.substr(32, 17)) / 100

            transaction.amount = amount

            const KID = parseInt(line.substr(49, 25))

            transaction.KID = KID
        }

        return transaction
    }
}