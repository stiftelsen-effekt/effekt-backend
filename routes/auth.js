const express = require('express')
const router = express.Router()
const template = require('./../custom_modules/template')
const fs = require('fs-extra')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.get("/dialog", urlEncodeParser, async (req,res, next) => {

})

router.get("/password/change", urlEncodeParser, async (req,res, next) => {
    if (false) {
        res.render('./../views/auth/changePassword', {
            title: "GiEffektivt.no - Endre passord",
            firstName: "Håkon"
        })
    }
    else {
        res.render('./../views/auth/error', {
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