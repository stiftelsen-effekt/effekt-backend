const moment = require('moment')
const parseUtil = require('./util')
const parse = require('csv-parse/lib/sync')

module.exports = {
  /**
   * @typedef TaxDeductionRecord
   * @property {string} fullname
   * @property {string} firstname
   * @property {string} email
   * @property {string} ssn
   * @property {string} amount 
   */

  /**
   * Parses a csv file with tax deduction data
   * @param {Buffer} report A file buffer, from a csv comma seperated file
   * @return {Array<TaxDeductionRecord>} 
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
        console.error("Parsing tax deductions failed.")
        console.error(ex)
        return false
      }
    }

    return data.map((row) => {
      console.log(row)

      /** @type {TaxDeductionRecord} */
      let record = {
        fullname: row[0],
        firstname: row[1].trim(),
        email: row[2],
        ssn: row[3],
        amount: row[4]
      }

      return record
    });
  },
}