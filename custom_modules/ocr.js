const DAO = require('./DAO.js')
const config = require('../config')
const mail = require('./mail.js')

module.exports = {
  /**
   * @typedef InvalidTransaction
   * @property {string} reason 
   * @property {Transaction} transaction 
   */

  /**
   * @typedef AddDonationsResult
   * @property {number} valid 
   * @property {number} invalid
   * @property {number} ignored
   * @property {Array<InvalidTransaction>} invalidTransactions 
   */

  /**
   * Adds transactions parced from OCR to the database
   * @param {Array<import('./parsers/OCR.js').OCRTransaction>} transactions 
   * @param {number} metaOwnerID 
   * @returns {AddDonationsResult}
   */
  async addDonations(transactions, metaOwnerID) {
    /**
     * @type {Array<AddDonationResult>}
     */
    const results = []

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i]
      const result = await this.addDonation(transaction, metaOwnerID)
      results.push(result)
    }

    const addedIDs = results.filter(result => (typeof result !== 'object' && result > 0))
 
    await this.sendReciepts(addedIDs)

    const valid = addedIDs.length
    const ignored = results.filter(result => result === -1).length
    const invalidTransactions = results.filter(result => typeof result === 'object')

    return {
      valid,
      invalid: invalidTransactions.length,
      ignored,
      invalidTransactions
    }
  },
  
  /**
   * @typedef {number | -1 | InvalidTransaction} AddDonationResult
   */

  /**
   * Adds transactions parced from OCR to the database
   * @param {Array<import('./parsers/OCR.js').OCRTransaction>} transactions 
   * @param {number} metaOwnerID 
   * @returns {AddDonationResult} DonationID if added, -1 if ignored, object if failed
   */
  async addDonation(transaction, metaOwnerID) {
    try {
      let donationID = await DAO.donations.add(transaction.KID, transaction.paymentMethod, transaction.amount, transaction.date, transaction.transactionID, metaOwnerID)
      return donationID
    } catch (ex) {
      //Only return a failed if it failed because the donation exists
      if (ex.message.indexOf("EXISTING_DONATION") == -1) {
      return {
          reason: ex.message,
          transaction
        }
      } else {
        console.log(`Attempted to add existing donation with KID ${transaction.KID}`)
        return -1
      }
    }
  },

  /**
   * Sends donation reciepts in paralell
   * @param {Array<number>} donationIDs 
   */
  async sendReciepts(donationIDs) {
    //Send mail in paralell
    if (config.env === 'production') {
      const tasks = donationIDs.map(id => mail.sendDonationReciept(id))
      const results = await Promise.allSettled(tasks)
      const failed = results.filter(result => result.status === 'rejected')

      for (let i = 0; i < failed.length; i++) {
        console.error(`Failed to send donation reciept for donation`)
        console.errror(failed[i].reason)
      }
    }
  }
}