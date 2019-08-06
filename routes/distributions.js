const express = require('express')
const router = express.Router()
const authMiddleware = require('../custom_modules/authorization/authMiddleware')
const authRoles = require('../enums/authorizationRoles')

const DAO = require('../custom_modules/DAO.js')

const rounding = require("../custom_modules/rounding")
const donationHelpers = require("../custom_modules/donationHelpers")

router.post("/", 
  authMiddleware(authRoles.write_all_donations),
  async (req, res, next) => {
  try {
    let split = req.body.distribution.map(distribution => {return { organizationID: distribution.organizationId, share: distribution.share }}),
      donorId = req.body.donor.id

    if (split.length === 0) {
      let err = new Error("Empty distribution array provided")
      err.status = 400
      return next(err)
    }

    if (rounding.sumWithPrecision(split.map(split => split.share)) !== "100") {
      let err = new Error("Distribution does not sum to 100")
      err.status = 400
      return next(err)
    }
    
    //Check for existing distribution with that KID
    let KID = await DAO.distributions.getKIDbySplit(split, donorId)

    if (!KID) {
      KID = await donationHelpers.createKID()
      await DAO.distributions.add(split, KID, donorId)
    }
    
    res.json({
      status: 200,
      content: KID
    })
  } catch(ex) {
    next(ex)
  }
})

router.get("/",
    authMiddleware(authRoles.read_all_donations),
    async (req, res, next) => {
    try {

    } catch(ex) {
        next(ex)
    }
})

module.exports = router