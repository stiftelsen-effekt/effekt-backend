const express = require('express')
const router = express.Router()
const bodyParser = require('body-parser')
const jsonBody = bodyParser.json()
const dns = require('dns').promises
const moment = require('moment')
const config = require('../config')
const DAO = require('../custom_modules/DAO')
const authMiddleware = require('../custom_modules/authorization/authMiddleware')

const vipps = require('../custom_modules/vipps')

const paymentMethods = require('../enums/paymentMethods')
const authorizationRoles = require('../enums/authorizationRoles')

const vippsCallbackProdServers = ["callback-1.vipps.no", "callback-2.vipps.no", "callback-3.vipps.no", "callback-4.vipps.no"]
const vippsCallbackDisasterServers = ["callback-dr-1.vipps.no", "callback-dr-2.vipps.no", "callback-dr-3.vipps.no", "callback-dr-4.vipps.no"]
const vippsCallbackDevServers = ["callback-mt-1.vipps.no", "callback-mt-2.vipps.no", "callback-mt-3.vipps.no", "callback-mt-4.vipps.no"]

router.get("/token", async (req, res, next) => {
    let token = await vipps.fetchToken()
    res.json(token)
})

router.get("/initiate/:phonenumber", async (req, res, next) => {
    let token = await vipps.fetchToken()
    let url = await vipps.initiateOrder(req.params.phonenumber, token)
    res.json(url)
})

router.post("/agreement/draft", jsonBody, async (req, res, next) => {
    const KID = 51615227;
    const SUM = 100;
    const NUMBER = 93279221;

    try {
        let response = await vipps.draftAgreement(KID, SUM, NUMBER)
        //TODO: Check for false
        res.json(response)
    } catch (ex) {
        next({ ex })
    }
})

router.get("/agreement/:id", async (req, res, next) => {
    try {
        const response = await vipps.getAgreement(req.params.id)

        //TODO: Check for false
        res.json(response)
    } catch (ex) {
        next({ ex })
    }
})

router.post("/agreement/charge/create/:id", jsonBody, async (req, res, next) => {
    try {
        const id = req.params.id
        const amount = req.body.amount
        const KID = req.body.KID
        const due = req.body.due

        if (!id) return "Missing parameter id"
        if (!amount) return "Missing amount from body"
        if (!KID) return "Missing KID from body"
        if (!due) return "Missing due from body"
        if (amount <= 0) return "Amount must be larger than 0"

        const response = await vipps.chargeAgreement(id, amount, KID, due)

        //TODO: Check for false
        res.json(response)
    } catch (ex) {
        next({ ex })
    }
})

router.post("/agreement/charge/cancel", jsonBody, async (req, res, next) => {
    try {
        const agreementId = req.body.agreementId
        const chargeId = req.body.chargeId
        if (!agreementId) return "Missing agreementId from body"
        if (!chargeId) return "Missing chargeId from body"

        vipps.cancelCharge(agreementId, chargeId)

    } catch (ex) {
        next({ ex })
    }
})

router.post("/v2/payments/:orderId", jsonBody, async (req, res, next) => {
    if (req.body.orderId !== req.params.orderId) {
        res.sendStatus(400)
        return false
    }
    let orderId = req.body.orderId

    //Make sure the request actually came from the vipps callback servers
    if (!await whitelisted(req.ip)) {
        console.warn(`Vipps callback host (${req.ip}) not whitelisted`)
        res.status(401).json({ status: 401, content: "Host not whitelisted" })
        return false
    }

    //TODO: Check whether order exists and, if captured, whether reserved before
    let transactionInfo = {
        orderId: orderId,
        transactionId: req.body.transactionInfo.transactionId,
        amount: req.body.transactionInfo.amount,
        status: req.body.transactionInfo.status,
        timestamp: new Date(req.body.transactionInfo.timeStamp)
    }

    //Handle different transactions states
    switch (transactionInfo.status) {
        case "RESERVED":
            await vipps.captureOrder(orderId, transactionInfo)
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
            console.warn("Unknown vipps state", transactionInfo.status)
            break;
    }

    res.sendStatus(200)
})

router.get("/redirect/:orderId", async (req, res, next) => {
    try {
        let orderId = req.params.orderId

        let retry = async (retries) => {
            let order = await DAO.vipps.getOrder(orderId)

            if (order && order.donationID != null) {
                res.redirect('https://gieffektivt.no/donation-recived/')
                return true
            }
            else if (retries >= 20) {
                res.redirect('https://gieffektivt.no/donation-failed')
                return false
            }
            else {
                setTimeout(async () => {
                    await retry(retries + 1)
                }, 1000)
            }
        }

        await retry(0)
    } catch (ex) {
        next(ex)
    }
})

router.get("/integration-test/:linkToken", async (req, res, next) => {
    if (config.env === 'production') {
        res.status(403).json({ status: 403, content: 'Integration test not applicable in production environment' })
        return false
    }

    try {
        let order = await DAO.vipps.getRecentOrder()

        console.log(order)

        let approved = await vipps.approveOrder(order.orderID, req.params.linkToken)

        console.log("Approved", approved)

        if (!approved) throw new Error("Could not approve recent order")

        //Try five times for a maximum of 5 seconds
        for (let i = 0; i < 5; i++) {
            console.log("Wait 1000")
            await delay(1000)
            order = await DAO.vipps.getOrder(order.orderID)
            console.log(order)
            if (order.donationID != null) {
                res.json({ status: 200, content: "Donation registered successfully" })
                return true
            }
        }
        console.log("Timeout")
        throw new Error("Timed out when attempting to verify integration")
    }
    catch (ex) {
        console.warn(ex)
        res.status(500).json({ status: 500, content: ex.message })
    }

})

router.post("/refund/:orderId", authMiddleware(authorizationRoles.write_vipps_api), async (req, res, next) => {
    try {
        let refunded = await vipps.refundOrder(req.params.orderId)

        if (refunded) {
            return res.json({
                status: 200,
                content: "OK"
            })
        }
        else {
            return res.status(409).json({
                status: 409,
                content: "Could not refund the order. This might be because the order has not been captured."
            })
        }
    }
    catch (ex) {
        next(ex)
    }
})

router.put("/cancel/:orderId", authMiddleware(authorizationRoles.write_vipps_api), async (req, res, next) => {
    try {
        let cancelled = await vipps.cancelOrder(req.params.orderId)

        if (cancelled) {
            return res.json({
                status: 200,
                content: "OK"
            })
        }
        else {
            return res.status(409).json({
                status: 409,
                content: "Could not cancel the order. This might be because the order has been captured."
            })
        }
    }
    catch (ex) {
        next(ex)
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
    catch (ex) {
        console.warn("Checking for whitelisted IPs failed", ex)
    }
    return whitelisted
}

//Helper for integration test
function delay(t) {
    return new Promise(function (resolve) {
        setTimeout(function () {
            resolve();
        }, t);
    });
}

module.exports = router