const express = require('express')
const router = express.Router()
const DAO = require('../custom_modules/DAO.js')

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

module.exports = router