const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')
const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const nets = require('../custom_modules/nets')
const ocrParser = require('../custom_modules/parsers/OCR')
const ocr = require('../custom_modules/ocr')
const avtalegiroParser = require('../custom_modules/parsers/avtalegiro')
const avtalegiro = require('../custom_modules/avtalegiro')
const DAO = require('../custom_modules/DAO')
const luxon = require('luxon')

//TODO: Remove after testing
const fs = require('fs')

const META_OWNER_ID = 3

//TODO: Turn on access control
router.post("/nets", /* authMiddleware(authRoles.write_all_donations), */ async (req,res, next) => {
  try {
    let today = luxon.DateTime.fromJSDate(new Date())
    let inThreeDays = today.plus(luxon.Duration.fromObject({ days: 3 }))

    /**
     * Fetch the latest OCR file
     * This file contains transactions to our account with KID, both with normal
     * giro and avtalegiro.
     * It also contains information about created, updated and deleted avtalegiro
     * agreements.
     */
    // const latestOcrFile = await nets.getLatestOCRFile()
    const latestOcrFile = fs.readFileSync('/Users/hakonharnes/Documents/OcrInFile.dat')

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
    const shipmentID = await DAO.avtalegiroagreements.addShipment(agreementsToCharge.length)
    const avtaleGiroClaimsFile = await avtalegiro.generateAvtaleGiroFile(shipmentID, agreementsToCharge)

    /**
     * Send file to nets
     */
    //TODO: Decide filename
    //await nets.sendOCRFile(avtaleGiroFile)

    res.json({
      addedDonations,
      updatedAgreements,
      notifiedAgreements,
      claimsFile: avtaleGiroClaimsFile,
      latestOcrFile: latestOcrFile.toString()
    })
  } catch(ex) {
    next({ex})
  }
})

module.exports = router