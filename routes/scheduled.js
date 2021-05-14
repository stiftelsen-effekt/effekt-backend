const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')
const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const nets = require('../custom_modules/nets')
const ocrParser = require('../custom_modules/parsers/OCR')
const ocr = require('../custom_modules/ocr')
const vipps = require('../custom_modules/vipps')

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
    await vipps.createFutureDueCharges()

    res.json("Ran vipps schedule for recurring agreements")
  } catch(ex) {
    next({ex})
  }
})

module.exports = router