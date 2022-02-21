const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')
const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const nets = require('../custom_modules/nets')
const ocrParser = require('../custom_modules/parsers/OCR')
const ocr = require('../custom_modules/ocr')
const vipps = require('../custom_modules/vipps')
const avtalegiroParser = require('../custom_modules/parsers/avtalegiro')
const avtalegiro = require('../custom_modules/avtalegiro')
const mail = require('../custom_modules/mail')
const DAO = require('../custom_modules/DAO')
const luxon = require('luxon')

const META_OWNER_ID = 3

/**
 * Triggered every day by a google cloud scheduler webhook at 20:00
 */
router.post("/ocr", authMiddleware(authRoles.write_all_donations), async (req,res, next) => {
  try {
    /**
     * Fetch the latest OCR file
     * This file contains transactions to our account with KID, both with normal
     * giro and avtalegiro.
     * It also contains information about created, updated and deleted avtalegiro
     * agreements.
     */
    const latestOcrFile = await nets.getLatestOCRFile()

    if (latestOcrFile === null) {
      //No files found in SFTP folder
      //Most likely because it's a holiday or weekend
      await DAO.logging.add("OCR", { nofile: true })
      res.send("No file")
      return true
    }

    // Send the OCR file over mail for a backup
    await mail.sendOcrBackup(JSON.stringify(result, null, 2))

    /**
     * Parse incomming transactions and add them to the database
     */
    const parsedTransactions = ocrParser.parse(latestOcrFile.toString())

    // Results are added in paralell to the database
    // Alongside sending donation reciepts
    const addedDonations = await ocr.addDonations(parsedTransactions, META_OWNER_ID)

    /**
     * Parse avtalegiro agreement updates from file and update database
     */
    const parsedAgreements = avtalegiroParser.parse(latestOcrFile.toString())
    const updatedAgreements = await avtalegiro.updateAgreements(parsedAgreements)

    const result = {
      addedDonations,
      updatedAgreements,
      file: latestOcrFile.toString()
    }

    await DAO.logging.add("OCR", result)
    res.json(result)
  } catch(ex) {
    next({ex})
  }
})

/**
 * Triggered by a google cloud scheduler webhook every day at 10:00
 */
router.post("/avtalegiro", authMiddleware(authRoles.write_all_donations), async (req, res, next) => {
  let result
  try {
    const claimDaysInAdvance = 6
    let today
    if (req.query.date) {
      today = luxon.DateTime.fromJSDate(new Date(req.query.date))
    } else {
      today = luxon.DateTime.fromJSDate(new Date())
    }

    let claimDate = today.plus(luxon.Duration.fromObject({ days: claimDaysInAdvance }))

    // Check if dates are last day of month
    const isClaimDateLastDayOfMonth = claimDate.day == today.endOf('month').day
    
    /**
     * Get active agreements 
     */
    let agreements = []
    if (isClaimDateLastDayOfMonth) {
      agreements = await DAO.avtalegiroagreements.getByPaymentDate(0)
    }
    else {
      agreements = await DAO.avtalegiroagreements.getByPaymentDate(claimDate.day)
    }

    if (agreements.length > 0) {
      /**
      * Notify agreements to be charged
      */
      let notifiedAgreements = {
        success: 0,
        failed: 0
      }
      if (req.query.notify) {
        notifiedAgreements = await avtalegiro.notifyAgreements(agreements.filter(agreement => agreement.notice == true))
      }

      /**
      * Create file to charge agreements for current day
      */
      const shipmentID = await DAO.avtalegiroagreements.addShipment(agreements.length)
      const avtaleGiroClaimsFile = await avtalegiro.generateAvtaleGiroFile(shipmentID, agreements, claimDate)

      /**
      * Send file to nets
      */
      const filename = 'DIRREM' + today.toFormat("ddLLyy")
      await nets.sendFile(avtaleGiroClaimsFile, filename)

      result = {
        notifiedAgreements,
        file: avtaleGiroClaimsFile.toString()
      }
    } else {
      result = {
        notifiedAgreements: null,
        file: null
      }
    }

    await DAO.logging.add("AvtaleGiro", result)
    await mail.sendOcrBackup(JSON.stringify(result, null, 2))
    res.json(result)
  } catch(ex) {
    next({ex})
  }
})

/**
 * Triggered by a google cloud scheduler webhook every day at 11:00, 12:00 and 13:00
 */
 router.post("/avtalegiro/retry", authMiddleware(authRoles.write_all_donations), async (req, res, next) => {
  let result
  try {
    const claimDaysInAdvance = 6
    let today
    if (req.query.date) {
      today = luxon.DateTime.fromJSDate(new Date(req.query.date))
    } else {
      today = luxon.DateTime.fromJSDate(new Date())
    }

    /**
     * Check if we have recieved an "accepted" reciept from MasterCard (Nets)
     * If not, we should retry and send file again
     */
    let accepted = await nets.checkIfAcceptedReciept(today.toFormat("yyLLdd"))
    if (accepted) {
      return res.json({
        status: 200,
        content: "Reciept present"
      })
    }

    let claimDate = today.plus(luxon.Duration.fromObject({ days: claimDaysInAdvance }))

    // Check if dates are last day of month
    const isClaimDateLastDayOfMonth = claimDate.day == today.endOf('month').day
    
    /**
     * Get active agreements 
     */
    let agreements = []
    if (isClaimDateLastDayOfMonth) {
      agreements = await DAO.avtalegiroagreements.getByPaymentDate(0)
    }
    else {
      agreements = await DAO.avtalegiroagreements.getByPaymentDate(claimDate.day)
    }

    if (agreements.length > 0) {
      /**
      * Notify agreements to be charged
      */
      let notifiedAgreements = {
        success: 0,
        failed: 0
      }

      /**
      * Create file to charge agreements for current day
      */
      const shipmentID = await DAO.avtalegiroagreements.addShipment(agreements.length)
      const avtaleGiroClaimsFile = await avtalegiro.generateAvtaleGiroFile(shipmentID, agreements, claimDate)

      /**
      * Send file to nets
      */
      const filename = 'DIRREM' + today.toFormat("ddLLyy")
      await nets.sendFile(avtaleGiroClaimsFile, filename)

      result = {
        notifiedAgreements,
        file: avtaleGiroClaimsFile.toString()
      }
    } else {
      return res.json({
        status: 200,
        content: "No agreements"
      })
    }

    await DAO.logging.add("AvtaleGiro - Retry", result)
    await mail.sendOcrBackup(JSON.stringify(result, null, 2))
    res.json(result)
  } catch(ex) {
    next({ex})
  }
})

router.post("/vipps", authMiddleware(authRoles.write_all_donations), async (req,res, next) => {
  try {
    // Synchronize effektDB with Vipps database before creating daily charges
    await vipps.synchronizeVippsAgreementDatabase()

    // Creates charges for all Vipps recurring agreements that are due three days ahead
    const result = await vipps.createFutureDueCharges()
    await DAO.logging.add("VippsRecurring", result)

    res.json(result)
  } catch(ex) {
    next({ex})
  }
})

module.exports = router