const express = require('express')
const router = express.Router()

const DAO = require('../custom_modules/DAO.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })
const request = require('request-promise-native')
var websocketsHandler
require('request').debug = true

router.post("/ipn", urlEncodeParser, async (req,res, next) => {
    console.log(req.body)
    console.log(websocketsHandler)

    res.status(200).send()

    let responseBody = req.body
    responseBody = Object.assign({cmd: "_notify-validate"}, responseBody)
    console.log(responseBody)

    var paypalCustomData = req.body.custom.split("|");
    let KID = paypalCustomData[0];
    let wsClientID = paypalCustomData[1];
    let sum = parseFloat(req.body.mc_gross);
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

    if (verification == "VERIFIED") {
        console.log("Paypal donation verified for KID: " + KID)

        try {
            await DAO.donations.add(KID, 3,sum)
            websocketsHandler.send(wsClientID, "PAYPAL_VERIFIED")
        } catch (ex) {
            console.error("Failed to update DB for paypal donatoin with KID: " + KID)
            console.error(ex)
        }
    } else {
        websocketsHandler.send(wsClientID, "PAYPAL_ERROR")
    }
})

module.exports = function(wsHandler) {
    console.log(wsHandler)
    websocketsHandler = wsHandler

    return router
}