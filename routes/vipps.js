const express = require('express')
const router = express.Router()
const bodyParser = require('body-parser')
const jsonBody = bodyParser.json()
const dns = require('dns').promises

const config = require('../config')
const DAO = require('../custom_modules/DAO')

const vipps = require('../custom_modules/vipps')

const paymentMethods = require('../enums/paymentMethods')

const vippsCallbackProdServers = ["callback-1.vipps.no","callback-2.vipps.no","callback-3.vipps.no","callback-4.vipps.no"]
const vippsCallbackDisasterServers = ["callback-dr-1.vipps.no","callback-dr-2.vipps.no","callback-dr-3.vipps.no","callback-dr-4.vipps.no"]
const vippsCallbackDevServers = ["callback-mt-1.vipps.no","callback-mt-2.vipps.no","callback-mt-3.vipps.no","callback-mt-4.vipps.no"]

router.get("/token", async(req,res,next) => {
    let token = await vipps.fetchToken()
    res.json(token)
})

router.get("/initiate/:phonenumber", async(req, res, next) => {
    let token = await vipps.fetchToken()
    let url = await vipps.initiateOrder(req.params.phonenumber, token)
    res.json(url)
})

router.post("/v2/payments/:orderId", jsonBody, async(req,res,next) => {
    if (req.body.orderId !== req.params.orderId) res.sendStatus(400)
    let orderId = req.body.orderId

    //Make sure the request actually came from the vipps callback servers
    if (!await whitelisted(req.ip)) {
        res.sendStatus(401).json({status: 401, content: "Host not whitelisted"})
        return false
    }

    //TODO: Check whether order exists and, if captured, whether reserved before
    let transactionStatus = {
        orderID: orderId,
        transactionID: req.body.transactionInfo.transactionId,
        amount: req.body.transactionInfo.amount,
        status: req.body.transactionInfo.status,
        timestamp: req.body.transactionInfo.timestamp
    }

    //Add transaction details to database
    await DAO.vipps.addOrderTransactionStatus(transactionStatus)

    //Order ID is on the format KID:timestamp, e.g. 21938932:138981748279238
    let KID = orderId.split(":")[0]

    //Handle different transactions states
    switch(transactionStatus.status) {
        case "RESERVED":
            await vipps.captureOrder(orderId, transactionStatus)
            break;
        case "SALE":
            //After capture
            await DAO.donations.add(KID, paymentMethods.vipps, (transactionStatus.amount/100), transactionStatus.timestamp, transactionStatus.transactionID)
            //TODO: Email
            break;
        case "SALE_FAILED":
            //Capture failed because of insufficent funds, card expired, etc.
            //Perhaps send a follow up email?
            break;
        case "CANCELLED":
            //User cancelled in Vipps
            //Perhaps send a follow up email?
            break;
        case "REJECTED":
            //User did not act on the payment (timeout etc.)
            //Perhaps send a follow-up email?
            break;
        default:
            console.warn("Unknown vipps state", transactionStatus.status)
            break;
    }

    res.sendStatus(200)
})

/**
 * Checks whether the provided IP is one of the vipps callback servers
 * @param {string} ip 
 */
async function whitelisted(ip) {
    let whitelistedHosts
    if (config.env === 'production') {
        whitelistedHosts = [...vippsCallbackProdServers, ...vippsCallbackDisasterServers]
    }
    else {
        whitelistedHosts = vippsCallbackDevServers
    }

    let whitelisted = false
    for (let i = 0; i < whitelistedHosts.length; i++) {
        let ipv4s = await dns.resolve4(whitelistedHosts[i])
        let ipv6s = await dns.resolve6(whitelistedHosts[i])
        if (ipv4s.indexOf(whitelistedHosts[i]) != -1 || ipv6s.indexOf(whitelistedHosts[i]) != -1) {
            whitelisted = true
            break
        }
    }
    return whitelisted
}

module.exports = router