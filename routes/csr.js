const express = require('express')
const router = express.Router()

const csr = require('../custom_modules/DAO_modules/csr')
const GDLiveParser = require('../custom_modules/GDLive_parser')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.get("/donations/:id", urlEncodeParser, async (req, res, next) => {
    try {
        //var total = 20045 // kan bruke DAO.donations.getFullDonationByDonor() ??
        var total = csr.getAllDonationsByDonorID(req.params.id)

        res.json({
            status: 200,
            content: total
        })
    }
    catch (exception) {
        next({ exception: exception })
    }
})

router.get("/donations/gdlive", urlEncodeParser, async (req, res, next) => {
    try {
        var json = GDLiveParser.getJSON()

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