const { DateTime } = require("luxon");
const parse = require('csv-parse/lib/sync')

/**
 * @typedef PaypalTransaction 
 * @property {moment.Moment} date
 * @property {String} transactionID
 * @property {String} referenceTransactionID
 * @property {Number} amount
 * @property {String} email
 */

module.exports = {
    /**
     * Parses a csv file from paypal reports
     * @param {Buffer} report A file buffer, from a csv comma seperated file
     * @return {Array<PaypalTransaction>} An array of transactions
     */
    parse: function(report) {
        let reportTextWithQuotes = report.toString()
        //strip all ""
        reportTextNoQuotes = reportTextWithQuotes.replace(/\"/g, '')
        try {
            if (reportTextWithQuotes.indexOf(";") == -1) throw "No semicolon in file"
            var data = parse(reportTextNoQuotes, { delimiter: ';', bom: true, skip_empty_lines: true })
        }
        catch (ex) {
            console.error("Using semicolon delimiter failed, trying comma.")

            try {
                var data = parse(reportTextWithQuotes, { delimiter: ',', bom: true, skip_empty_lines: true })
            }
            catch(ex) {
                console.error("Using comma delimiter failed.")
                console.error("Parsing paypal failed.")
                console.error(ex)
                return false
            }
        }
        
        let transactions = getTransactions(data)

        return transactions
    }
}

/**
 * Gets transactions from parsed CSV data
 * @param {Array<Array<Object>>} data A two dimensional array representing the CSV data
 * @returns {Array<PaypalTransaction>} 
 */
function getTransactions(data) {
    return data.reduce((acc, row) => {
        if(row[fieldMapping.type] == "Abonnementsbetaling") {
            acc.push({
                date: DateTime.fromFormat(row[fieldMapping.date] + " " + row[fieldMapping.time] + " " + row[fieldMapping.timeZone], "DD.MM.YYYY hh:mm:ss z"),
                transactionID: row[fieldMapping.transactionID],
                referenceTransactionID: row[fieldMapping.referenceTransactionID],
                amount: Number(row[fieldMapping.grossAmount].replace(/[,]/, ".").replace(/\s/g, '')),
                email: row[fieldMapping.email]
            })
        }
        return acc
    }, [])
}

const fieldMapping = {
    date: 0,
    time: 1,
    timeZone: 2,
    type: 4,
    grossAmount: 7,
    email: 10,
    transactionID: 12,
    referenceTransactionID: 13
}
