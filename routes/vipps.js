const express = require('express')
const router = express.Router()

const vipps = require('../custom_modules/vipps')

router.get("/token", async(req,res,next) => {
    let token = await vipps.fetchToken()
    res.json(token)
})

router.get("/initiate/:phonenumber", async(req, res, next) => {
    let token = await vipps.fetchToken()
    let url = await vipps.initiateOrder(req.params.phonenumber, token)
    res.json(url)
})

router.post("/v2/payments/:orderid", async(req,res,next) => {
    console.log(req)
})

module.exports = router