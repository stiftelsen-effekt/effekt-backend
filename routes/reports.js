const express = require('express')
const router = express.Router()
const OCR = require('../custom_modules/parsers/OCR.js')
const vipps = require('../custom_modules/parsers/vipps.js')
const DAO = require('../custom_modules/DAO.js')

const fileUpload = require('express-fileupload')

const BANK_ID = 1
const VIPPS_ID = 4


router.post('/ocr', async (req, res, next) => {
    var data = req.files.report.data.toString('UTF-8')

    var OCRRecords = OCR.parse(data)

    res.json({
        status: 501,
        content: "Not implemented"
    })
})

router.post("/vipps", async (req,res,next) => {
    if (!req.files || !req.files.report) return res.sendStatus(400)

    try {
      transactions = vipps.parseReport(req.files.report.data)
    }
    catch(ex) {
      next(ex)
      return false
    }
  
    let invalid = [];
    let valid = 0;
    for (let i = 0; i < transactions.length; i++) {
      let transaction = transactions[i];
  
      if (transaction.valid) {
        try {
          //Add donation
          var donationID = await DAO.donations.add(transaction.KID, 4, transaction.amount, transaction.transactionId)
  
          valid++
        } catch (ex) {
            console.error("Failed to update DB for vipps donation with KID: " + transaction.KID)
            console.error(ex)
  
            invalid.push({
              reason: ex,
              transaction: transaction
            })
        }
      } else {
        invalid.push({
          reason: "Could not find valid KID",
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
  })

module.exports = router