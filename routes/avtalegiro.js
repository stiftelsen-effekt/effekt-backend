const express = require('express')
const router = express.Router()
const DAO = require('../custom_modules/DAO.js')
const rounding = require("../custom_modules/rounding")
const donationHelpers = require('../custom_modules/donationHelpers')
const authMiddleware = require('../custom_modules/authorization/authMiddleware')
const authorizationRoles = require('../enums/authorizationRoles')


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

router.post("/agreements", authMiddleware(authorizationRoles.read_all_donations), async(req, res, next) => {
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

router.get("/agreement/:id", authMiddleware(authorizationRoles.read_all_donations), async(req, res, next) => {
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

router.get("/report", authMiddleware(authorizationRoles.read_all_donations), async (req,res,next) => {
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

router.post("/:KID/distribution", authMiddleware(authRoles.write_all_donations), async (req, res, next) => {
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
      await DAO.avtalegiroagreements.replaceDistribution(replacementKID, originalKID) 

      // Add new distribution using the original KID
      const response = await DAO.distributions.add(split, originalKID, donorId, metaOwnerID)

      //await mail.sendAvtaleGiroChange() // Add later
      res.send(response)
  } catch (ex) {
      next({ ex })
  }
})

router.post("/:KID/amount", authMiddleware(authRoles.write_all_donations), async (req, res, next) => {
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

router.post("/:KID/status", authMiddleware(authRoles.write_all_donations), async (req, res, next) => {
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

router.post("/:KID/amount", authMiddleware(authRoles.write_all_donations), async (req, res, next) => {
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

router.post("/:KID/paymentdate", authMiddleware(authRoles.write_all_donations), async (req, res, next) => {
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