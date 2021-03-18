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
        let parsedData = req.body

        if (!parsedData.paymentID) {
            throwError("Missing param paymentID")
        }
        else if (!parsedData.email) {
            throwError("Missing param paymentID")
        }
        else if (!parsedData.full_name) {
            throwError("Missing param full_name")
        }
        else if (!parsedData.ssn) {
            throwError("Missing param ssn")
        }

        let ID = await DAO.donors.getIDbyEmail(email)

        // If donor does not exist, create new donor
        if (!ID) {
            let donorID = await DAO.donors.add(email, full_name, ssn)

            DAO.facebook.registerPaymentFB(donorID, parsedData.paymentID)
        }
        // If donor already exists, update ssn if empty
        else if (ID) {
            let donorID = ID
            let donor = await DAO.donors.getByID(ID)

            if (!donor.ssn) await DAO.donors.updateSsn(ssn)

            DAO.facebook.registerPaymentFB(donorID, parsedData.paymentID)
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