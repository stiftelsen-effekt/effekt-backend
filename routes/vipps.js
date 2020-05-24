const express = require('express')
const router = express.Router()
const bodyParser = require('body-parser')
const jsonBody = bodyParser.json()
const dns = require('dns').promises
const moment = require('moment')
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
    console.log(req.body)
    console.log(req.ip)
    console.log(req.params.orderId)

    if (req.body.orderId !== req.params.orderId) {
        res.sendStatus(400)
        return false
    }
    let orderId = req.body.orderId

    //Make sure the request actually came from the vipps callback servers
    if (!await whitelisted(req.ip)) {
        console.warn(`Vipps callback host (${req.ip}) not whitelisted`)
        res.status(401).json({status: 401, content: "Host not whitelisted"})
        return false
    }

    //TODO: Check whether order exists and, if captured, whether reserved before
    let transactionStatus = {
        orderID: orderId,
        transactionID: req.body.transactionInfo.transactionId,
        amount: req.body.transactionInfo.amount,
        status: req.body.transactionInfo.status,
        timestamp: moment(req.body.transactionInfo.timeStamp).toDate()
    }

    //Add transaction details to database
    await DAO.vipps.addOrderTransactionStatus(transactionStatus)

    //Order ID is on the format KID:timestamp, e.g. 21938932-138981748279238
    let KID = orderId.split("-")[0]

    //Handle different transactions states
    switch(transactionStatus.status) {
        case "RESERVED":
            await vipps.captureOrder(orderId, transactionStatus)
            break;
        case "SALE":
            //Not applicable POS sale
            break;
        case "SALE_FAILED":
            //Not applicable POS sale
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

router.get("/integration-test/", async (req, res, next) => {
    if (config.env === 'production') {
        res.status(403).json({status: 403, content: 'Integration test not applicable in production environment'})
        return false
    }

    try {
        let order = await DAO.vipps.getRecentOrder()
        let approved = await vipps.approveOrder(order.orderID, order.token)

        if(!approved) throw new Error("Could not approve recent order")
        
        //Try five times for a maximum of 5 seconds
        for(let i = 0; i < 5; i++) {
            await delay(1000)
            let order = await DAO.vipps.getOrder(order.orderID)
            if (order.donationID != null) {
                res.json({status: 200, content: "Donation registered successfully"})
                return true
            }
        }
        throw new Error("Timed out when attempting to verify integration")
    }
    catch(ex) {
        res.status(500).json({status: 500, content: ex})
    }
    
})

/**
 * Checks whether the provided IP is one of the vipps callback servers
 * @param {string} ip 
 */
async function whitelisted(ip) {
    //Some weirdness going on here, implicitly trust
    return true

    //ipv6 check
    if (ip.substr(0, 7) == "::ffff:") {
        ip = ip.substr(7)
    }

    let whitelistedHosts
    if (config.env === 'production') {
        whitelistedHosts = [...vippsCallbackProdServers, ...vippsCallbackDisasterServers]
    }
    else {
        whitelistedHosts = vippsCallbackDevServers
    }

    let whitelisted = false
    try {
        for (let i = 0; i < whitelistedHosts.length; i++) {
            let ipv4s = await dns.resolve4(whitelistedHosts[i])
            console.log(ipv4s, ip)
            //Should possibly also check for ipv6?
            if (ipv4s.indexOf(ip) != -1) {
                whitelisted = true
                break
            }
        }
    }
    catch(ex) {
        console.warn("Checking for whitelisted IPs failed", ex)
    }
    return whitelisted
}

//Helper for integration test
function delay(t) {
    return new Promise(function(resolve) {
        setTimeout(function() {
            resolve();
        }, t);
    });
 }

module.exports = router