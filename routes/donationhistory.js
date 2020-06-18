const express = require('express')
const router = express.Router()
const DAO = require('../custom_modules/DAO.js')

router.get("/summary/:donorID", async (req, res, next) => {
    try {
        var summary = await DAO.donationhistory.getSummary(req.params.donorID)

        res.json({
            status: 200,
            content: summary
        })
    }
    catch(ex) {
        next(ex)
    }
})

router.get("/:donorID", async (req, res, next) => {
    try {
        var history = await DAO.donationhistory.getHistory(req.params.donorID)

        res.json({
            status: 200,
            content: history
        })
    }
    catch(ex) {
        next(ex)
    }
})

router.get("/test", async (req, res, next) => {
    try {
        var history = await DAO.donationhistory.getMethods()

        res.json({
            status: 200,
            content: history
        })
    }
    catch(ex) {
        next(ex)
    }
})

module.exports = router