const config = require('../../config')
const luxon = require('luxon');
const { DateTime } = require('luxon');

module.exports = {
  startRecordTransmission: function(shipmentID) { 
    let customerId = config.nets_customer_id;

    var line = `NY000010${customerId.padStart(8,'0')}${shipmentID.toString().padStart(7,'0')}00008080`
    line = line.padEnd(80, '0')
    line += '\n'
    return line;
  },

  startRecordPaymentAssignment: function(currentDate) {
    var line =`NY210020`
    line = line.padEnd(17, '0')
    // Oppdragsnr.
    line += currentDate.toFormat("ddLLyy").padStart(7, '0')
    // Accountnr.
    line += '15062995960'
    line = line.padEnd(80, '0')

    line += '\n'
    return line
  },

  /**
   * 
   * @param {import('../parsers/avtalegiro').AvtalegiroAgreement} agreement 
   * @param {import('../DAO_modules/donors').Donor} donor 
   * @param {string} type 
   * @param {number} transactionNumber 
   * @param {DateTime} claimDate 
   * @returns {string}
   */
  firstAndSecondLine: function(agreement, donor, type, transactionNumber, claimDate) {
    /**
     * First line
     */
    var firstLine =`NY21${type}30${transactionNumber.toString().padStart(7,'0')}`
    firstLine += claimDate.toFormat("ddLLyy")
    firstLine = firstLine.padEnd(32, '0')

    var amount = agreement.amount
    amount = amount.toString().padStart(17, '0')
    firstLine += amount

    var KID = agreement.KID
    KID = KID.toString().padStart(25, ' ')
    firstLine += KID

    firstLine = firstLine.padEnd(80, '0')
    firstLine += '\n'

    /**
     * Second line
     */
    const shortname = donor.name.toUpperCase().substr(0,10).replace(/\s+/g, '').padStart(10, ' ')

    var secondLine =`NY210231${transactionNumber.toString().padStart(7,'0')}${shortname}`

    secondLine = secondLine.padEnd(75, ' ')
    secondLine = secondLine.padEnd(80, '0')

    /**
     * Combine lines
     */
    lines = `${firstLine}${secondLine}`
    lines += '\n'
    return lines
  },

  /**
   * 
   * @param {import('../parsers/avtalegiro').AvtalegiroAgreement} claims 
   * @param {DateTime} minDate Minimum claim date
   * @param {DateTime} maxDate Maximum claim date
   * @returns 
   */
  endRecordPaymentAssignment: function(claims, minDate, maxDate) {
    var line =`NY210088`

    //Number of transactions
    line += claims.length.toString().padStart(8,'0')

    //Number of records, including start and end record
    line += (claims.length*2+2).toString().padStart(8,'0')

    //Sum of payment claims
    line += claims.reduce((acc, claim) => acc += claim.amount, 0).toString().padStart(17, '0')

    //Min day
    line += minDate.toFormat("ddLLyy")

    //Max day
    line += maxDate.toFormat("ddLLyy")

    line = line.padEnd(80, '0')
    line += '\n'
    return line
  },

  startRecordDeletionRequest: function() {
    var line =`NY213620`
    line = line.padEnd(17, '0')
    // Oppdragsnr.
    line += '2'.padStart(7, '0')
    // Accountnr.
    line += '15062995960'
    line = line.padEnd(80, '0')

    line += '\n'
    return line
  },

  endRecordDeletionRequest: function(dueDate) {
    var line =`NY213688`

    //Number of transactions
    line += '0'.padStart(8,'0')

    //Number of records, including start and end record
    line += '2'.padStart(8,'0')

    //Sum of deletion requests amount
    line += '0'.padStart(17, '0')

    const minMaxDate = dueDate.toFormat("ddLLyy")

    //Min day
    line += minMaxDate

    //Max day
    line += minMaxDate

    line = line.padEnd(80, '0')
    line += '\n'
    return line
  },

  endRecordTransmission: function(claims, deletions, minDate) {
    var line =`NY000089`

    //Number of transactions
    line += (claims.length + deletions.length).toString().padStart(8,'0')

    //Number of records, including start and end record
    line += (claims.length*4 + deletions.length * 4 + 2).toString().padStart(8,'0')

    //Sum of payment claims
    let claimSum = claims.reduce((acc, claim) => acc += claim.amount, 0)
    let deletionsSum = deletions.reduce((acc, deletion) => acc += deletion.amount, 0)
    line += (claimSum + deletionsSum).toString().padStart(17, '0')

    //Min day
    line += minDate.toFormat("ddLLyy")

    line = line.padEnd(80, '0')
    line += '\n'
    return line
  }
}