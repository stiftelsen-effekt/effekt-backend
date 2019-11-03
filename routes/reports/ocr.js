const OCRparser = require('../../custom_modules/parsers/OCR.js')
const DAO = require('../../custom_modules/DAO.js')

const BANK_ID = 2

module.exports = async (req, res, next) => {
    let metaOwnerID = parseInt(req.body.metaOwnerID)

    var data = req.files.report.data.toString('UTF-8')

    var transactions = OCRparser.parse(data)

    for (let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i]
        await DAO.donations.add(transaction.KID, BANK_ID, transaction.amount, transaction.date, null, metaOwnerID)
    }

    res.json({
        status: 200,
        content: "Woho"
    })
}