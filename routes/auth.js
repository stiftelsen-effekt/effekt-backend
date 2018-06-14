const express = require('express')
const router = express.Router()
const DAO = require(global.appRoot + '/custom_modules/DAO.js')
const crypto = require(global.appRoot + '/custom_modules/crypto.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.get("/password/change/:key", urlEncodeParser, async (req,res, next) => {
    let donor = await DAO.auth.getDonorByChangePassKey(req.params.key)

    if (donor) {
        res.render(global.appRoot + '/views/auth/changePassword', {
            title: "GiEffektivt.no - Endre passord",
            firstName: donor.fullName.split(' ')[0]
        })
    }
    else {
        res.render(global.appRoot + '/views/auth/error', {
            title: "GiEffektivt.no - Feilmelding",
            errorCode: "INVALID_LINK",
            errorMessage: "Det ser ut som linken du har fått tilsendt for å endre passord ikke er gyldig.",
            "nextStep?": {
                directions: "Du kan få tilsendt en ny link",
                link: "#"
            }
        })
    }
})

router.post("/password/change/:key", urlEncodeParser, async (req,res, next) => {
    let donor = await DAO.auth.getDonorByChangePassKey(req.params.key)

    if (donor) {
        await DAO.auth.updateDonorPassword(donor.id, req.body.password)

        res.render(global.appRoot + '/views/auth/changedPassword', {
            title: "GiEffektivt.no - Passord oppdatert"
        })
    }
    else {
        res.render(global.appRoot + '/views/auth/error', {
            title: "GiEffektivt.no - Feilmelding",
            errorCode: "INVALID_LINK",
            errorMessage: "Det ser ut som linken du har fått tilsendt for å endre passord ikke er gyldig.",
            "nextStep?": {
                directions: "Du kan få tilsendt en ny link",
                link: "#"
            }
        })
    }
})

module.exports = router