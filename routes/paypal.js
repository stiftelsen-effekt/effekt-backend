const express = require('express')
const router = express.Router()

const DAO = require('../custom_modules/DAO.js')
const mail = require('../custom_modules/mail.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })
const request = require('request-promise-native')

const config = require('../config')

var websocketsHandler

require('request').debug = true

router.post("/ipn", urlEncodeParser, async (req,res, next) => {
    res.status(200).send()

    let responseBody = req.body
    responseBody = Object.assign({cmd: "_notify-validate"}, responseBody)

    //Paypal custom data comes in the form KID|websocketClientID
    var paypalCustomData = req.body.custom.split("|")
    let KID = paypalCustomData[0]
    let wsClientID = paypalCustomData[1]
    let sum = parseFloat(req.body.mc_gross)
    let transactionID = req.body.txn_id

    let paymentStatus = req.body.payment_status

    //Fee gets sent form paypal, but is also stored in our DB
    //Maybe update fee in DB if it's different from our stored fees?
    //Possible that paypal changes fees and we forget to update them

    try {
        //"https://ipnpb.sandbox.paypal.com/cgi-bin/webscr/"
        var verification = await request.post("https://ipnpb.paypal.com/cgi-bin/webscr", {
            encoding: "UTF-8",
            headers: {
                'User-Agent': 'Stiftelsen Effekt IPN Script - Node'
            },
            form: responseBody
        })
    }  catch(ex) {
        console.error("Failed to send paypal verification postback for KID: " + KID)
    }

    if (sum < 0) return false; //Refunded donation. Might want to automate this aswell.
    if (verification == "VERIFIED" && paymentStatus === "Completed") {
        try {
            //Add donation
            var donationID = await DAO.donations.add(KID, 3,sum, null, transactionID)
        } catch (ex) {
            console.error("Failed to update DB for paypal donation with KID: " + KID)
            console.error(ex)
        }

        if (config.env === 'production') mail.sendDonationReciept(donationID)
        websocketsHandler.send(wsClientID, "PAYPAL_VERIFIED")
    } else {
        websocketsHandler.send(wsClientID, "PAYPAL_ERROR")
    }
})

module.exports = (wsHandler) => {
    websocketsHandler = wsHandler

    return router
}