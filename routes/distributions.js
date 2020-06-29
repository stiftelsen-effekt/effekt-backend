const express = require('express')
const router = express.Router()
const authMiddleware = require('../custom_modules/authorization/authMiddleware')
const authRoles = require('../enums/authorizationRoles')

const DAO = require('../custom_modules/DAO.js')

const rounding = require("../custom_modules/rounding")
const donationHelpers = require("../custom_modules/donationHelpers")
const distributions = require('../custom_modules/DAO_modules/distributions')

router.post("/", 
  authMiddleware(authRoles.write_all_donations),
  async (req, res, next) => {
  try {
    let split = req.body.distribution.map(distribution => {return { organizationID: distribution.organizationId, share: distribution.share }}),
      donorId = req.body.donor.id,
      metaOwnerID = req.body.metaOwnerID

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
      await DAO.distributions.add(split, KID, donorId, metaOwnerID)
    }
    
    res.json({
      status: 200,
      content: KID
    })
  } catch(ex) {
    next(ex)
  }
})

router.post("/search",
    authMiddleware(authRoles.read_all_donations),
    async (req, res, next) => {
    try {
      let limit = req.body.limit, 
          page = req.body.page, 
          filter = req.body.filter,
          sort = req.body.sort

      let distributions = await DAO.distributions.getAll(page, limit, sort, filter)

      res.json({
        status: 200,
        content: distributions
      })
    } catch(ex) {
        next(ex)
    }
})

router.get("/:KID", 
  //authMiddleware(authRoles.read_all_donations), 
  async (req,res,next) => {
  try {
    if (!req.params.KID) res.status(400).json({ status: 400, content: "No KID provided" })
    let distribution = await DAO.distributions.getSplitByKID(req.params.KID)
    let donor = await DAO.donors.getByKID(req.params.KID)
    return res.json({
      status: 200,
      content: {
        donor,
        distribution
      }
    })
  } catch(ex) {
    if (ex.message.indexOf("NOT FOUND") !== -1) res.status(404).send({
      status: 404,
      content: ex.message
    })
    else {
      next(ex)
    }
  }
})

router.get("/all/:donorID", 
  //authMiddleware(authRoles.read_all_donations), 
  async (req,res,next) => {
  try {
    if (!req.params.donorID) res.status(400).json({ status: 400, content: "No KID provided" })
    let distributions = await DAO.distributions.getAllByDonor(req.params.donorID)
    return res.json({
      status: 200,
      content: distributions
    })
  } catch(ex) {
    if (ex.message.indexOf("NOT FOUND") !== -1) res.status(404).send({
      status: 404,
      content: ex.message
    })
    else {
      next(ex)
    }
  }
})

module.exports = router