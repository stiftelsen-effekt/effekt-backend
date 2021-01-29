const OCRparser = require('../../custom_modules/parsers/OCR.js')
const DAO = require('../../custom_modules/DAO.js')
const config = require('../../config')
const mail = require('../../custom_modules/mail')

const BANK_ID = 2

module.exports = async (req, res, next) => {
    let metaOwnerID = parseInt(req.body.metaOwnerID)

    var data = req.files.report.data.toString('UTF-8')

    try {
        var transactions = OCRparser.parse(data)
    }   catch(ex) {
        return next(ex)
    }

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
    

    res.json({
        status: 200,
        content: {
            valid: valid,
            //Not used
            invalid: invalid,
            invalidTransactions: invalidTransactions
        }
    })
}