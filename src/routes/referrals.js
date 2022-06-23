const express = require('express')
const router = express.Router()
const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

const DAO = require('../custom_modules/DAO.js')

router.get("/types", async (req,res, next) => {
  try {
    let types = await DAO.referrals.getTypes()

    res.json({
      status: 200,
      content: types
    })
  }
  catch(ex) {
    next(ex)
  }
})

router.get("/aggregate", async (req,res, next) => {
    try {
        let aggregate = await DAO.referrals.getAggregate()

        res.json({
        status: 200,
        content: aggregate
        })
    }
    catch(ex) {
        next(ex)
    }
})

router.post("/", async(req,res,next) => {
    try {
        let parsedData = req.body
        const donorID = parsedData.donorID
        
        if (!parsedData.referralID)
            throw new Error("Missing parameter referralID")

        if (!donorID)
            throw new Error("Missing parameter donorID")

        if (!parsedData.websiteSession)
          throw new Error("Missing parameter websiteSession")

        if (parsedData.comment === undefined)
            parsedData.comment = null

        const isAnonymous = (donorID == 1464)
        const donorAnswered = await DAO.referrals.getDonorAnswered(donorID)
        const websiteSessionReferralExists = await DAO.referrals.getWebsiteSessionReferral(parsedData.websiteSession)

        if ((isAnonymous && !websiteSessionReferralExists) || (!isAnonymous && !donorAnswered)) {
          await DAO.referrals.addRecord(
            parsedData.referralID, 
            parsedData.donorID, 
            parsedData.comment, 
            parsedData.websiteSession
          )
        }

        if ((!isAnonymous && donorAnswered) || (isAnonymous && websiteSessionReferralExists)) {
          await DAO.referrals.updateRecord(
            parsedData.referralID, 
            donorID, 
            parsedData.comment,
            parsedData.websiteSession
          )
        }
        
        res.json({
            status: 200
        })
      }
      catch(ex) {
        next(ex)
      }
})

module.exports = router