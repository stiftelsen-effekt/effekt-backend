const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')
const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const nets = require('../custom_modules/nets')
const ocrParser = require('../custom_modules/parsers/OCR')
const ocr = require('../custom_modules/ocr')

const META_OWNER_ID = 3

router.post("/nets", authMiddleware(authRoles.write_all_donations), async (req,res, next) => {
  try {
    const latestOcrFile = await nets.getLatestOCRFile()

    const parsed = ocrParser.parse(latestOcrFile.toString())

    const result = await ocr.addDonations(parsed, META_OWNER_ID)

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

router.post("/vipps", authMiddleware(authRoles.write_all_donations), async (req,res, next) => {
  try {
    const daysInAdvance = 3
    const timeNow = new Date().getTime()
    const dueDateTime = new Date(timeNow + (1000 * 60 * 60 * 24 * daysInAdvance))
    const dueDate = new Date(dueDateTime)

    // Find agreements with due dates that are 3 days from now
    const activeAgreements = await DAO.vipps.getActiveAgreementsByChargeDay(dueDateTime.getDate())

    if (activeAgreements) {
        for (let i = 0; i < activeAgreements.length; i++) {
            const agreement = activeAgreements[i]

            // Check if agreement exists and is active in Vipps database
            const vippsAgreement = await vipps.getAgreement(agreement.ID)
            if (vippsAgreement.status === "ACTIVE") {
                await vipps.createCharge(
                    vippsAgreement.ID, 
                    vippsAgreement.price, 
                    dueDate
            )}
        }
    }
    else {
        console.log("No active Vipps agreements with due date " + moment(dueDate).format('DD/MM/YYYY'))
    }

    res.json("Ran vipps schedule for recurring agreements")
  } catch(ex) {
    next({ex})
  }
})

module.exports = router