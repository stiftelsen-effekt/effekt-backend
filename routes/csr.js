const express = require('express')
const apicache = require('apicache')
const router = express.Router()
const cache = apicache.middleware

const DAO = require('../custom_modules/DAO.js')
const GDLiveParser = require('../custom_modules/GDLive_parser')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.get("/donations/:id", [urlEncodeParser, cache("10 minutes")], async (req, res, next) => {
    try {
        var total = await DAO.csr.getAllDonationsByDonorId(req.params.id)

        res.json({
            status: 200,
            content: total
        })
    }
    catch (exception) {
        next({ exception: exception })
    }
})

router.get("/gdlive/:number", [urlEncodeParser, cache("10 minutes")], async (req, res, next) => {
    try {
        var json = await GDLiveParser.getJSON(req.params.number)

        res.json({
            status: 200,
            content: json
        })
    }
    catch (exception) {
        next({exception: exception})
    }
})

module.exports = router