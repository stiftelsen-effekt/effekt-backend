const express = require('express')
const router = express.Router()
const DAO = require(global.appRoot + '/custom_modules/DAO.js')
const crypto = require(global.appRoot + '/custom_modules/authorization/crypto.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.get("/login", urlEncodeParser, async (req, res, next) => {
    if (!req.query.response_type || !req.query.client_id || !req.query.redirect_uri || !req.query.scope || !req.query.state) {
        res.send("Buhuu")
    } else {
        try {
            var application = await DAO.auth.getApplicationByClientID(req.query.client_id)
        } catch (ex) {
            throw ex
        }

        let permissions = req.query.scope.split(" ")



        res.render(global.appRoot + '/views/auth/dialog', {
            title: "GiEffektivt.no - Logg inn",
            applicationName: application.name
        })
    }
    
})

router.get("/password/change/:token", urlEncodeParser, async (req,res, next) => {
    try {
        var donor = await DAO.auth.getDonorByChangePassToken(req.params.token)
    } catch(ex) {
        next({ex:ex})
    }

    if (donor) {
        res.render(global.appRoot + '/views/auth/changePassword', {
            title: "GiEffektivt.no - Endre passord",
            firstName: donor.fullName.split(' ')[0]
        })
    }
    else {
        res.render(global.appRoot + '/views/auth/error', {
            title: "GiEffektivt.no - Feilmelding",
            errorCode: "INVALID_TOKEN",
            errorMessage: "Det ser ut som linken du har fått tilsendt for å endre passord ikke er gyldig.",
            "nextStep?": {
                directions: "Du kan få tilsendt en ny link",
                link: "#"
            }
        })
    }
})

router.post("/password/change/:token", urlEncodeParser, async (req,res, next) => {
    try {
        var donor = await DAO.auth.getDonorByChangePassToken(req.params.token)
    } catch(ex) { next({ex:ex}) }

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