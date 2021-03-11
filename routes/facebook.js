const express = require('express')
const router = express.Router()
const DAO = require('../custom_modules/DAO.js')

router.post("/register/payment", async (req, res, next) => {
    try {
        let parsedData = req.body

        let isNewDonor = await (await DAO.facebook.registerPaymentFB(parsedData.paymentID, parsedData.email)).isNewDonor

        // Used in tax deduction form for Facebook
        res.json({
            status: 200,
            content: isNewDonor
        })
    }
    catch (ex) {
        next(ex)
    }
})

module.exports = router