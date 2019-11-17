const parse = require('csv-parse/lib/sync')
const parseUtil = require('./util')
const moment = require('moment')

const fieldMapping = {
    date: 0,
    message: 1,
    sum: 3,
    externalRef: 5,
    KID: 6
}

module.exports = {
    /**
     * @typedef BankCustomTransactions
     * @property {string} message
     * @property {number} amount
     * @property {string} KID
     * @property {moment.Moment} date
     * @property {string} externalRef
     */

    /**
     * Parses a the custom bank format for donations without KID
     * @param {Buffer} report A file buffer, from a csv comma seperated file
     * @return {Array<BankCustomTransactions>} 
     */
    parseReport: function(report) {
        let reportText = report.toString();
        try {
            var data = parse(reportText, { delimiter: ';', bom: true, skip_empty_lines: true })
        }
        catch(ex) {
            console.error("Using semicolon delimiter failed, trying comma.")

            try {
                var data = parse(reportText, { delimiter: ',', bom: true, skip_empty_lines: true })
            }
            catch(ex) {
                console.error("Using comma delimiter failed.")
                console.error("Parsing vipps failed.")
                console.error(ex)
                return false
            }
        }

        let transactions = data.reduce((acc, row, i) => {
            if (i !== 0) acc.push(this.parseRow(row))
            return acc
        }, [])

        return transactions
    },

    /**
     * Parses a row from the 
     * @param {Array<string>} row 
     * @returns {BankCustomTransactions}
     */
    parseRow: function(row) {
        return {
            date: moment(row[fieldMapping.date], "DD.MM.YYYY"),
            message: row[fieldMapping.message].replace(/(\r\n|\r|\n)/g, ""),
            amount: Number(row[fieldMapping.sum].replace(/\./g, "").replace(/\,/g, ".")),
            KID: parseUtil.extractKID(row[fieldMapping.KID]),
            transactionID: row[fieldMapping.externalRef]
        }
    }
}