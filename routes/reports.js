const express = require('express')
const router = express.Router()
const OCR = require('../custom_modules/parsers/OCR.js')
const vipps = require('../custom_modules/parsers/vipps.js')
const DAO = require('../custom_modules/DAO.js')

const moment = require('moment')
const reporting = require('../custom_modules/reporting.js')
const dateRangeHelper = require('../custom_modules/dateRangeHelper.js')
const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

//const fileUpload = require('express-fileupload')

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
          var donationID = await DAO.donations.add(transaction.KID, VIPPS_ID, transaction.amount, transaction.dateObj.toDate(), transaction.transactionId)
  
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

router.get('/range', urlEncodeParser, /*authMiddleware('read_all_donations', true),*/ async (req, res, next) => {
  try {
    let dates = dateRangeHelper.createDateObjectsFromExpressRequest(req)

    let donationsFromRange = await DAO.donations.getFromRange(dates.fromDate, dates.toDate)

    if (req.query.filetype === "json") {
      res.json({
        status: 200,
        content: donationsFromRange
      })
    }
    else if (req.query.filetype === "excel") {
      let organizations = await DAO.organizations.getAll();
      let excelFile = reporting.createExcelFromIndividualDonations(donationsFromRange, organizations)

      res.writeHead(200, {
        'Content-Type': 'application/vnd.ms-excel',
        'Content-disposition': 'attachment;filename=Individual_Donations_' + moment(dates.fromDate).format('YYYY-MM-DD') + '_to_' + moment(dates.toDate).format('YYYY-MM-DD') + '.xlsx',
        'Content-Length': excelFile.length
      });
      res.end(excelFile);
    } else {
      res.status(400).json({
        code: 400,
        content: "Please provide a query parameter 'filetype' with either excel or json as value"
      })
    }
  }
  catch(ex) {
    next({ex: ex})
  }
})

module.exports = router