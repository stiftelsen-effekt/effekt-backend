const bankParser = require('../../custom_modules/parsers/bank.js')
const DAO = require('../../custom_modules/DAO.js')
const config = require('../../config')
const mail = require('../../custom_modules/mail')

const BANK_NO_KID_ID = 5

module.exports = async (req, res, next) => {
    let metaOwnerID = parseInt(req.body.metaOwnerID)

    var data = req.files.report.data.toString('UTF-8')

    try {
        var transactions = bankParser.parseReport(data)
    }   catch(ex) {
        return next(ex)
    }

    let valid = 0
    let invalid = []
    for (let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i]
        transaction.paymentID = BANK_NO_KID_ID

        if (transaction.KID != null) {
            /**
             * Managed to grab a KID straight from the message field, go ahead and add to DB
             */
            let donationID;
            try {
                donationID = await DAO.donations.add(transaction.KID, BANK_NO_KID_ID, transaction.amount, transaction.date.toDate(), transaction.transactionID, metaOwnerID)
                valid++
            } catch (ex) {
                console.error("Failed to update DB for bank_custom donation with KID: " + transaction.KID)
                console.error(ex)

                invalid.push({
                    reason: ex.message,
                    transaction: transaction
                })
            }

            try {
                if (config.env === 'production') await mail.sendDonationReciept(donationID);
            } catch (ex) {
                console.error("Failed to send donation reciept")
                console.error(ex)
            }
        } else if (false) {
            /**
             * Transaction matched against a parsing rule
             * An example could be the rule that "if the message says vipps, we automaticly assume standard split"
             * The rules are defined in the database
             */
            
        } else  {
            invalid.push({
                reason: "Could not find valid KID or matching parsing rule",
                transaction: transaction
            })
        }
    }

    res.json({
        status: 200,
        content: {
            valid: valid,
            invalid: invalid.length,
            invalidTransactions: invalid
        }
    })
}