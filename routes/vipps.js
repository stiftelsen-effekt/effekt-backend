const express = require('express')
const router = express.Router()
const bodyParser = require('body-parser')
const jsonBody = bodyParser.json()
const dns = require('dns').promises

const config = require('../config')
const DAO = require('../custom_modules/DAO')

const vipps = require('../custom_modules/vipps')

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

    //Make sure the request actually came from the vipps callback servers
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
    if (!whitelisted) {
        res.sendStatus(401).json({status: 401, content: "Host not whitelisted"})
        return false
    }

    //TODO: Check whether order exists and, if captured, whether reserved before
    
    //Add transaction details to database
    await DAO.vipps.addOrderTransactionStatus({
        orderID: req.body.orderId,
        transactionID: req.body.transactionInfo.transactionId,
        amount: req.body.transactionInfo.amount,
        status: req.body.transactionInfo.status,
        timestamp: req.body.transactionInfo.timestamp
    })

    //Handle different transactions states
    switch(req.body.transactionInfo.status) {
        case "RESERVED":
            //TODO: Capture
            break;
        case "CAPTURED":
            //TODO: Add new donation to DB
            break;
        case ""
    }

    res.sendStatus(200)
})

module.exports = router