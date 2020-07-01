const express = require('express')
const router = express.Router()
const DAO = require('../custom_modules/DAO.js')
const mail = require('../custom_modules/mail')

router.get("/receipt", async (req, res, next) => {
    try {
        mail.sendDonationReciept(5, 'philip.h.andersen@gmail.com')
        res.json({
            status: 200,
            content: `Reciept sent`
        })
    } catch {
        next(ex)
    }
})


module.exports = router