const e = require('express')
const express = require('express')
const router = express.Router()
const DAO = require('../custom_modules/DAO.js')
const mail = require('../custom_modules/mail')
const auth = require('../custom_modules/authorization/authMiddleware')
const roles = require('../enums/authorizationRoles')

function throwError(message) {
    let error = new Error(message)
    error.status = 400
    throw error
}

router.get("/payments/all",
    auth(roles.read_all_donations),
    async (req, res, next) => {
    try {
        content = await DAO.facebook.getAllFacebookDonations()

        res.json({
            status: 200,
            content
        })
    }
    catch (ex) {
        next(ex)
    }
})

router.post("/register/payment", async (req, res, next) => {
    try {

        const paymentID = req.body.paymentID
        const email = req.body.email
        const full_name = req.body.full_name
        const ssn = req.body.ssn
        const newsletter = req.body.newsletter

        if (!paymentID) {
            throwError("Missing param paymentID")
        }
        else if (!email) {
            throwError("Missing param paymentID")
        }
        else if (!full_name) {
            throwError("Missing param full_name")
        }
        else if (!ssn) {
            throwError("Missing param ssn")
        }
        else if (!newsletter) {
            throwError("Missing param newsletter")
        }

        const ID = await DAO.donors.getIDbyEmail(email)

        // If donor does not exist, create new donor
        if (!ID) {
            const donorID = await DAO.donors.add(email, full_name, ssn, newsletter)

            await DAO.facebook.registerPaymentFB(donorID, paymentID)
        }
        // If donor already exists, update ssn if empty
        else if (ID) {
            const donorID = ID
            const donor = await DAO.donors.getByID(ID)

            if (!donor.ssn) await DAO.donors.updateSsn(donorID, ssn)
            await DAO.donors.updateNewsletter(donorID, newsletter)

            await DAO.facebook.registerPaymentFB(donorID, paymentID)
        }
        
        await mail.sendFacebookTaxConfirmation(email, full_name, paymentID)

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
