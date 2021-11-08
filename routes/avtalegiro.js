const express = require('express')
const router = express.Router()
const DAO = require('../custom_modules/DAO.js')
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

router.post("/:KID/status", async (req, res, next) => {
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

router.post("/:KID/amount", async (req, res, next) => {
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

router.post("/:KID/paymentdate", async (req, res, next) => {
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