const e = require('express')
const express = require('express')
const router = express.Router()
const DAO = require('../custom_modules/DAO.js')
const mail = require('../custom_modules/mail')
const authMiddleware = require('../custom_modules/authorization/authMiddleware')
const authRoles = require('../enums/authorizationRoles')

function throwError(message) {
    let error = new Error(message)
    error.status = 400
    throw error
}

router.post("/donation/registered", authMiddleware(authRoles.read_all_donations), async (req, res, next) => {
    try {
        const KID = req.body.KID
        const sum = req.body.sum
        
        await mail.sendDonationRegistered(KID, sum)

        res.json({
            status: 200,
            content: "OK"
        })
    }
    catch (ex) {
        next(ex)
    }
})

router.post("/donation/receipt/effekt", authMiddleware(authRoles.read_all_donations), async (req, res, next) => {
    try {
        const donationID = req.body.donationID
        const recipient = req.body.recipient
        
        await mail.sendEffektDonationReciept(donationID, recipient)

        res.json({
            status: 200,
            content: "OK"
        })
    }
    catch (ex) {
        next(ex)
    }
})

router.post("/avtalegiro/notice", authMiddleware(authRoles.read_all_donations), async (req, res, next) => {
    try {
        const KID = req.body.KID
        const agreement = await DAO.avtalegiroagreements.getByKID(KID)
        
        await mail.sendAvtalegiroNotification(agreement)

        res.json({
            status: 200,
            content: "OK"
        })
    }
    catch (ex) {
        next(ex)
    }
})

router.post("/facebook/tax/confirmation", authMiddleware(authRoles.read_all_donations), async (req, res, next) => {
    try {
        const recipient = req.body.recipient
        const name = req.body.name
        const paymentID = req.body.paymentID
        
        await mail.sendFacebookTaxConfirmation(recipient, name, paymentID)

        res.json({
            status: 200,
            content: "OK"
        })
    }
    catch (ex) {
        next(ex)
    }
})

module.exports = router