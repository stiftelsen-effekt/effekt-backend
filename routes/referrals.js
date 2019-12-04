const express = require('express')
const router = express.Router()

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
        if (!req.body.referralTypeID)
            throw new Error("Missing parameter referralTypeID")

        if (!req.body.donorID)
            throw new Error("Missing parameter donorID")

        let types = await DAO.referrals.addRecord(req.body.referralTypeID, req.body.donorID)
    
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