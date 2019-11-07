const OCRparser = require('../../custom_modules/parsers/OCR.js')
const DAO = require('../../custom_modules/DAO.js')
const config = require('../../config')

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
    try {
        for (let i = 0; i < transactions.length; i++) {
            let transaction = transactions[i]
            let donationID = await DAO.donations.add(transaction.KID, BANK_ID, transaction.amount, transaction.date, transaction.externalReference, metaOwnerID)
            valid++
            if (config.env === 'production') await mail.sendDonationReciept(donationID)
        }
    } catch (ex) {
        //If the donation already existed, ignore and keep moving
        if (ex.message.indexOf("EXISTING_DONATION") === -1) {
            next(ex)
            return false
        }  
    }
    

    res.json({
        status: 200,
        content: {
            valid: valid,
            //Not used
            invalid: 0,
            invalidTransactions: []
        }
    })
}