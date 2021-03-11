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
        if (!parsedData.referralID)
            throw new Error("Missing parameter referralID")

        if (!parsedData.donorID)
            throw new Error("Missing parameter donorID")

        if (parsedData.comment === undefined)
            parsedData.comment = null

        let status = await DAO.referrals.addRecord(parsedData.referralID, parsedData.donorID, parsedData.comment)
    
        res.json({
            status: 200,
            content: status
        })
      }
      catch(ex) {
        next(ex)
      }
})

module.exports = router