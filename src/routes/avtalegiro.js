const express = require('express')
const router = express.Router()
const DAO = require('../custom_modules/DAO.js')
const rounding = require("../custom_modules/rounding")
const donationHelpers = require('../custom_modules/donationHelpers')
const authMiddleware = require('../custom_modules/authorization/authMiddleware')
const authRoles = require('../enums/authorizationRoles')
const moment = require('moment')

router.post("/draft", async (req,res,next) => {
    if (!req.body) return res.sendStatus(400)

    const parsedData = req.body
    const KID = parsedData.KID
    const amount = parsedData.amount
    if (amount <= 0) return res.sendStatus(400)

    const dueDay = parsedData.dueDay <= 28 ? parsedData.dueDay : 0

    try {
        // Amount is given in NOK in Widget, but øre is used for agreements
        await DAO.avtalegiroagreements.add(KID, amount*100, dueDay, true)  
    }
    catch (ex) {
        return next(ex)
    }

    res.json({ status: 200 })
})

router.post("/agreements", authMiddleware.auth(authRoles.read_donations), async(req, res, next) => {
    try {
        var results = await DAO.avtalegiroagreements.getAgreements(req.body.sort, req.body.page, req.body.limit, req.body.filter)
        return res.json({ 
            status: 200, 
            content: {
                pages: results.pages,
                rows: results.rows
            }
        })
    } catch(ex) {
    next(ex)
    }
})

router.get("/agreement/:id", authMiddleware.auth(authRoles.read_donations), async(req, res, next) => {
  try {
      var result = await DAO.avtalegiroagreements.getAgreement(req.params.id)
      result["ID"] = result["ID"].toString()
      
      return res.json({ 
          status: 200,
          content: {
            ...result
          }
      })
  } catch(ex) {
  next(ex)
  }
})

router.get("/histogram", async (req,res,next) => {
    try {
      let buckets = await DAO.avtalegiroagreements.getAgreementSumHistogram()
  
      res.json({
        status: 200,
        content: buckets
      })
    } catch(ex) {
      next(ex)
    }
})

router.get("/report", async (req,res,next) => {
    try {
      let content = await DAO.avtalegiroagreements.getAgreementReport()
  
      res.json({
        status: 200,
        content
      })
    } catch(ex) {
      next(ex)
    }
})

router.get("/validation", authMiddleware.auth(authRoles.read_donations), async (req,res,next) => {
  try {
    let content = await DAO.avtalegiroagreements.getValidationTable()

    res.json({
      status: 200,
      content
    })
  } catch(ex) {
    next(ex)
  }
})

router.get("/missing/", authMiddleware.auth(authRoles.read_donations), async (req, res, next) => {
  try {
    let date = req.query.date

    if (!date)
      throw new Error("Date query missing")

    if (!moment(date, moment.ISO_8601, true).isValid())
      throw new Error("Date query must be in ISO 8601 format")

    date = new Date(date)

    const content = await DAO.avtalegiroagreements.getMissingForDate(date)

    res.json({
      status: 200,
      content
    })
  } catch (ex) {
    next(ex)
  }
})

router.get("/expected/", authMiddleware.auth(authRoles.read_donations), async (req, res, next) => {
  try {
    let date = req.query.date

    if (!date)
      throw new Error("Date query missing")

    if (!moment(date, moment.ISO_8601, true).isValid())
      throw new Error("Date query must be in ISO 8601 format")

    date = new Date(date)

    const content = await DAO.avtalegiroagreements.getExpectedDonationsForDate(date)

    res.json({
      status: 200,
      content
    })
  } catch (ex) {
    next(ex)
  }
})

router.get("/recieved/", authMiddleware.auth(authRoles.read_donations), async (req, res, next) => {
  try {
    let date = req.query.date

    if (!date)
      throw new Error("Date query missing")

    if (!moment(date, moment.ISO_8601, true).isValid())
      throw new Error("Date query must be in ISO 8601 format")

    date = new Date(date)

    const content = await DAO.avtalegiroagreements.getRecievedDonationsForDate(date)

    res.json({
      status: 200,
      content
    })
  } catch (ex) {
    next(ex)
  }
})

router.post("/:KID/distribution", authMiddleware.auth(authRoles.write_donations), async (req, res, next) => {
  try {
      if (!req.body) return res.sendStatus(400)
      const originalKID = req.params.KID
      const parsedData = req.body
      const distribution = parsedData.distribution
      const donor = await DAO.donors.getByKID(originalKID)
      const donorId = donor.id

      const split = distribution.map(org => {return { organizationID: org.organizationId, share: org.share }})
      const metaOwnerID = 3

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
      
      // Create new KID for the old replaced distribution
      const replacementKID = await donationHelpers.createKID(15, donorId)

      // Replace distribution
      const response = await DAO.avtalegiroagreements.replaceDistribution(replacementKID, originalKID, split, donorId, metaOwnerID) 

      //await mail.sendAvtaleGiroChange() // Add later
      res.send(response)
  } catch (ex) {
      next({ ex })
  }
})

router.post("/:KID/status", authMiddleware.auth(authRoles.write_donations), async (req, res, next) => {
  try {
      const KID = req.params.KID
      const active = req.body.active

      const response = await DAO.avtalegiroagreements.setActive(KID, active)
      
      //await mail.sendAvtaleGiroChange() // Add later
      res.send(response)
  } catch (ex) {
      next({ ex })
  }
})

router.post("/:KID/amount", authMiddleware.auth(authRoles.write_donations), async (req, res, next) => {
  try {
      const KID = req.params.KID
      const amount = req.body.amount

      const response = await DAO.avtalegiroagreements.updateAmount(KID, amount)
      
      //await mail.sendAvtaleGiroChange() // Add later
      res.send(response)
  } catch (ex) {
      next({ ex })
  }
})

router.post("/:KID/paymentdate", authMiddleware.auth(authRoles.write_donations), async (req, res, next) => {
  try {
      const KID = req.params.KID
      const paymentDate = req.body.paymentDate

      const response = await DAO.avtalegiroagreements.updatePaymentDate(KID, paymentDate)
      
      //await mail.sendAvtaleGiroChange() // Add later
      res.send(response)
  } catch (ex) {
      next({ ex })
  }
})

module.exports = router