const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')
const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const nets = require('../custom_modules/nets')
const ocrParser = require('../custom_modules/parsers/OCR')
const ocr = require('../custom_modules/ocr')
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
      res.send("No file")
      return true
    }

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
      latestOcrFile: latestOcrFile.toString()
    }

    await mail.sendOcrBackup(JSON.stringify(result, null, 2))
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
    let today = luxon.DateTime.fromJSDate(new Date())
    let inThreeDays = today.plus(luxon.Duration.fromObject({ days: 3 }))

    /**
    * Notify all with agreements that are to be charged in three days
    */
    const comingAgreements = await DAO.avtalegiroagreements.getByPaymentDate(inThreeDays.day)
    const agreementsToBeNotified = comingAgreements.filter(agreement => agreement.notice == true)
    const notifiedAgreements = await avtalegiro.notifyAgreements(agreementsToBeNotified)

    /**
    * Create file to charge agreements for current day
    */
    const agreementsToCharge = await DAO.avtalegiroagreements.getByPaymentDate(today.day)

    if (agreementsToCharge.length > 0) {
      const shipmentID = await DAO.avtalegiroagreements.addShipment(agreementsToCharge.length)
      const avtaleGiroClaimsFile = await avtalegiro.generateAvtaleGiroFile(shipmentID, agreementsToCharge)

      /**
      * Send file to nets
      */
      const filename = 'DIRREN' + today.toFormat("ddLLyy")
      await nets.sendFile(avtaleGiroClaimsFile, filename)

      result = {
        notifiedAgreements,
        claimsFile: avtaleGiroClaimsFile.toString()
      }
    } else {
      result = {
        notifiedAgreements,
        claimsFile: null
      }
    }

    await mail.sendOcrBackup(JSON.stringify(result, null, 2))
    res.json(result)
  } catch(ex) {
    next({ex})
  }
})

module.exports = router