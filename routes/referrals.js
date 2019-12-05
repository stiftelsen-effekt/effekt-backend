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

router.post("/", urlEncodeParser, async(req,res,next) => {
    try {
        let parsedData = JSON.parse(req.body.data)
        if (!parsedData.referralTypeID)
            throw new Error("Missing parameter referralTypeID")

        if (!parsedData.donorID)
            throw new Error("Missing parameter donorID")

        let types = await DAO.referrals.addRecord(parsedData.referralTypeID, parsedData.donorID)
    
        res.json({
            status: 200,
            content: types
        })
      }
      catch(ex) {
        next(ex)
      }
})

module.exports = router