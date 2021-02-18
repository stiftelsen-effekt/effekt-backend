const DAO = require('./DAO.js')
const config = require('../config')
const mail = require('./mail.js')

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
   * Adds transactions parced from OCR to the database
   * @param {Transaction} transactions 
   * @param {number} metaOwnerID 
   * @returns {{ valid: number, invalid: number: invalidTransactions: Array<{ reason: string, transaction: Transaction }> }}
   */
  async addDonations(transactions, metaOwnerID) {
    let valid = 0
    let invalid = 0
    let invalidTransactions = []
    
    for (let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i]
        try {
            let donationID = await DAO.donations.add(transaction.KID, BANK_ID, transaction.amount, transaction.date, transaction.transactionID, metaOwnerID)
            valid++
            if (config.env === 'production') await mail.sendDonationReciept(donationID)
        }
        catch (ex) {
            //If the donation already existed, ignore and keep moving
            if (ex.message.indexOf("EXISTING_DONATION") !== -1) {
                invalid++
            }  
            else {
                invalidTransactions.push({
                    reason: ex.message,
                    transaction
                })
                invalid++
            }
        }
    }

    return {
      valid,
      invalid,
      invalidTransactions
    }
  }
}