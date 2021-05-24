const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')
const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const nets = require('../custom_modules/nets')
const avtalegiroParser = require('../custom_modules/parsers/avtalegiro')
const avtalegiro = require('../custom_modules/avtalegiro')
const DAO = require('../custom_modules/DAO')
const luxon = require('luxon')

const META_OWNER_ID = 3
var fs = require('fs');

router.post("/nets", authMiddleware(authRoles.write_all_donations), async (req,res, next) => {
  try {
    const latestOcrFile = await nets.getLatestOCRFile()

    const parsedTransactions = ocrParser.parse(latestOcrFile.toString())
    const result = await ocr.addDonations(parsedTransactions, META_OWNER_ID)

    const parsedAgreements = avtalegiroParser.parse(latestOcrFile.toString())
    await avtalegiro.updateAgreements(parsedAgreements)

    res.json(result)
  } catch(ex) {
    next({ex})
  }
})

router.post("/nets/complete", authMiddleware(authRoles.write_all_donations), async (req,res, next) => {
  try {
    const files = await nets.getOCRFiles()

    /**
     * This function is very suboptimal, as each file get creates a new SFTP connection
     * and disposes of it after fetching the file
     */

    let results = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fileBuffer = await nets.getOCRFile(file.name)
      const parsed = ocrParser.parse(fileBuffer.toString())
      const result = await ocr.addDonations(parsed, META_OWNER_ID)
      results.push(result)
    }

    res.json(results)
  } catch(ex) {
    next({ex})
  }
})

router.post("/nets/avtalegiro", /* authMiddleware(authRoles.write_all_donations) ,*/ async (req,res, next) => {
  try {
    
    let today = luxon.DateTime.fromJSDate(new Date())
    /*
    let inThreeDays = today.plus(luxon.Duration.fromObject({ days: 3 }))

    const agreementsToBeNotified = await DAO.avtalegiroagreements.getByPaymentDate(inThreeDays.day)
    
    for (let i = 0; i < agreementsToBeNotified.length; i++) {
      // Anta at mail finnes
    }
    */
    
    const agreementsToCharge = await DAO.avtalegiroagreements.getByPaymentDate(today.day)
    const shipmentID = await DAO.avtalegiroagreements.addShipment(agreementsToCharge.length)
    
    const avtaleGiroFile = await avtalegiro.generateAvtaleGiroFile(shipmentID, agreementsToCharge)

    /*
    await nets.sendOCRFile(avtaleGiroFile);
    */
    
    res.send(avtaleGiroFile)
  } catch(ex) {
    next({ex})
  }
})

module.exports = router