const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')
const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const nets = require('../custom_modules/nets')
const avtalegiroParser = require('../custom_modules/parsers/avtalegiro')
const avtalegiro = require('../custom_modules/avtalegiro')
const DAO = require('../custom_modules/DAO')
const mail = require('../custom_modules/mail')
const luxon = require('luxon')

const META_OWNER_ID = 3

router.post("/nets", authMiddleware(authRoles.write_all_donations), async (req,res, next) => {
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
    const latestOcrFile = await nets.getLatestOCRFile()

    /**
     * Parse incomming transactions and add them to the database
     */
    const parsedTransactions = ocrParser.parse(latestOcrFile.toString())
    const result = await ocr.addDonations(parsedTransactions, META_OWNER_ID)

    /**
     * Parse changes in avtalegiro agreements and update database
     */
    const parsedAgreements = avtalegiroParser.parse(latestOcrFile.toString())
    await avtalegiro.updateAgreements(parsedAgreements)

    /**
     * Notify all with agreements that are to be charged in three days
     */
    const comingAgreements = await DAO.avtalegiroagreements.getByPaymentDate(inThreeDays.day)
    const agreementsToBeNotified = comingAgreements.filter(agreement => agreement.notice == true)
    for (let i = 0; i < agreementsToBeNotified.length; i++) {
      const tasks = agreementsToBeNotified.map((agreement) => mail.sendAvtalegiroNotification(agreement.KID))
      //Send mails in paralell
      await Promise.all(tasks)
    }

    /**
     * Create file to charge agreements for current day
     */
    const agreementsToCharge = await DAO.avtalegiroagreements.getByPaymentDate(today.day)
    const shipmentID = await DAO.avtalegiroagreements.addShipment(agreementsToCharge.length)
    const avtaleGiroFile = await avtalegiro.generateAvtaleGiroFile(shipmentID, agreementsToCharge)

    /**
     * Send file to nets
     */
    await nets.sendOCRFile(avtaleGiroFile)    

    res.json(result)
  } catch(ex) {
    next({ex})
  }
})

module.exports = router