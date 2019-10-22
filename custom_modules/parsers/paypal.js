const moment = require('moment')
const parse = require('csv-parse/lib/sync')

module.exports = {
    /**
     * Parses a csv file from paypal reports
     * @param {Buffer} report A file buffer, from a csv comma seperated file
     * @return {Object} An array of transactions
     */
    parse: function(report) {
        let reportText = report.toString()
        try {
            var data = parse(reportText, { delimiter: ';', bom: true, skip_empty_lines: true })
        }
        catch (ex) {
            console.error("Using semicolon delimiter failed, trying comma.")

            try {
                var data = parse(reportText, { delimiter: ',', bom: true, skip_empty_lines: true })
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

function getTransactions(data) {
    return data.reduce((acc, row) => {
        if(row[fieldMapping.type] == "Abonnementsbetaling") {
            acc.push({
                date: moment(row[fieldMapping.date] + " " + row[fieldMapping.time], "DD.MM.YYYY hh:mm:ss"),
                transactionID: row[fieldMapping.transactionID],
                referenceTransactionID: row[fieldMapping.referenceTransactionID],
                amount: Number(row[fieldMapping.grossAmount].replace(/[,]/, ".").replace(/\s/g, '')),
                email: row[fieldMapping.email]
            })
        }
        return acc
    }, [])
}