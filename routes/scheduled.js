const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')
const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const nets = require('../custom_modules/nets')
const avtalegiroParser = require('../custom_modules/parsers/avtalegiro')
const avtalegiro = require('../custom_modules/avtalegiro')
const DAO = require('../custom_modules/DAO')

const META_OWNER_ID = 3
var fs = require('fs');

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

router.post("/nets/avtalegiro", authMiddleware(authRoles.write_all_donations), async (req,res, next) => {
  try {
    const files = await nets.getOCRFiles(); 

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fileBuffer = await nets.getOCRFile(file.name)
      const parsed = avtalegiroParser.parse(fileBuffer.toString())
      const result = await ocr.addDonations(parsed, META_OWNER_ID)
      results.push(result)
    }

    const file = await avtalegiro.generateAvtaleGiroFile(files); 

    await nets.sendOCRFile(file);
    
    res.json(file)
  } catch(ex) {
    next({ex})
  }
})

module.exports = router