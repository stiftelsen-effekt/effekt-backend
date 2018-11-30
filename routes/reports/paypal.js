const DAO = require('../../custom_modules/DAO.js')
const paypal = require('../../custom_modules/parsers/paypal.js')

const PAYPAL_ID = 3

module.exports = async (req,res,next) => {
    if (!req.files || !req.files.report) return res.sendStatus(400)
  
    var transactions = paypal.parse(req.files.report.data)

    try {
      let referenceIDs = transactions.map((transaction) => transaction.referenceTransactionID)
      var referenceTransactionID_To_KID = await DAO.donations.getHistoricPaypalSubscriptionKIDS(referenceIDs)
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

    try {
      //Add paypal donations
      for(let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i]
        await DAO.donations.add(transaction.KID, PAYPAL_ID, transaction.amount, transaction.date.toDate(), transaction.transactionID)
      }
    } catch(ex) {
      next(ex)
      return false
    }

    res.json({
      status: 200,
      content: "A OK"
    })
}