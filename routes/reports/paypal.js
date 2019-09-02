const DAO = require('../../custom_modules/DAO.js')
const paypal = require('../../custom_modules/parsers/paypal.js')
const mail = require('../../custom_modules/mail')

const config = require('../../config')

const PAYPAL_ID = 3

module.exports = async (req,res,next) => {
    if (!req.files || !req.files.report) return res.sendStatus(400)
  
    try {
      var transactions = paypal.parse(req.files.report.data)
    } catch(ex) {
      console.error(ex)
      next(new Error("Error in parsing report"))
    }
    

    try {
      let referenceIDs = transactions.map((transaction) => transaction.referenceTransactionID)
      var referenceTransactionID_To_KID = await DAO.distributions.getHistoricPaypalSubscriptionKIDS(referenceIDs)
    } catch(ex) {
      next(ex)
      return false
    }

    //Add KID to transactions, drop those that are not found in DB
    transactions = transactions.reduce((acc, transaction) => {
      if (referenceTransactionID_To_KID[transaction.referenceTransactionID] != null) {
        let newTransaction = transaction
        newTransaction.KID = referenceTransactionID_To_KID[transaction.referenceTransactionID]
        acc.push(newTransaction)
      }
      return acc
    }, [])

    var valid = 0;
    try {
      //Add paypal donations
      for(let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i]
        try {
          var donationID = await DAO.donations.add(transaction.KID, PAYPAL_ID, transaction.amount, transaction.date.toDate(), transaction.transactionID)
          valid++
          if (config.env === 'production') mail.sendDonationReciept(donationID)
        }
        catch(ex) {
          //If the donation already existed, ignore and keep moving
          if (ex.message.indexOf("EXISTING_DONATION") === -1) throw ex
        }
        
      }
    } catch(ex) {
      next(ex)
      return false
    }

    res.json({
      status: 200,
      content: {
        valid: valid,
        invalid: 0,
        invalidTransactions: []
      }
    })
}