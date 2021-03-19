const e = require('express')
const express = require('express')
const router = express.Router()
const DAO = require('../custom_modules/DAO.js')

function throwError(message) {
    let error = new Error(message)
    error.status = 400
    throw error
}

router.post("/register/payment", async (req, res, next) => {
    try {

        const paymentID = req.body.paymentID
        const email = req.body.email
        const full_name = req.body.full_name
        const ssn = req.body.ssn

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

        const ID = await DAO.donors.getIDbyEmail(email)

        // If donor does not exist, create new donor
        if (!ID) {
            const donorID = await DAO.donors.add(email, full_name, ssn)

            DAO.facebook.registerPaymentFB(donorID, paymentID)
        }
        // If donor already exists, update ssn if empty
        else if (ID) {
            const donorID = ID
            const donor = await DAO.donors.getByID(ID)

            if (!donor.ssn) await DAO.donors.updateSsn(donorID, ssn)

            DAO.facebook.registerPaymentFB(donorID, paymentID)
        }

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