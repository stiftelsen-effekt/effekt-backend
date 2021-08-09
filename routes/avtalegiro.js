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
    const dueDay = parsedData.dueDay

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

module.exports = router