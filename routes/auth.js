const express = require('express')
const router = express.Router()
const DAO = require(global.appRoot + '/custom_modules/DAO.js')
const crypto = require('../custom_modules/authorization/crypto.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

//http://localhost:3000/auth/login?client_id=clientID&response_type=code&redirect_uri=oko&scope=read_user_info%20read_user_donations&state=oksi
router.get("/login", async (req, res, next) => {
    //Check that all query parameters are present
    if (!req.query.response_type || !req.query.client_id || !req.query.scope || !req.query.state) {
        res.status(400).send("Some parameters in the URL is missing")
        return
    }
    
    //Check if response type is code
    if (req.query.response_type != "code") {
        res.status(400).send("Only response type code is supported")
        return
    }

    //Get the application provided based on client ID
    try {
        var application = await DAO.auth.getApplicationByClientID(req.query.client_id)

        if (!application) {
            res.status(400).send("No application with given clientID")
            return
        }
    } catch (ex) {
        next({ex: ex})
        return
    }

    //Check if application has access to requested permissions
    let permissions = req.query.scope.split(" ")
    try {
        let applicationHasPermissions = await DAO.auth.checkApplicationPermissions(application.ID, permissions)

        if (!applicationHasPermissions) {
            res.status(400).send("Application does not have access to requested permissions")
            return
        }
    } catch(ex) {
        next({ex: ex})
        return
    }

    //Get permission info from shortnames
    try {
        permissions = await DAO.auth.getPermissionsFromShortnames(permissions)
    } catch(ex) {
        next({ex: ex})
        return
    }


    res.render(global.appRoot + '/views/auth/dialog', {
        title: "GiEffektivt.no - Logg inn",
        applicationName: application.name,
        permissions: permissions,

        //Pass on to POST request
        state: req.query.state,
        clientid: req.query.client_id,
        scope: req.query.scope
    })
})

router.post("/login", urlEncodeParser, async(req, res, next) => {
    //First check user credentials
    try {
        var donor = await DAO.auth.getDonorByCredentials(req.body.email, req.body.password)

        if (!donor) {
            res.status(400).send("Invalid credentials")
            return
        }
    } catch(ex) {
        next({ex: ex}) 
        return
    }

    //Get the application provided based on client ID
    try {
        var application = await DAO.auth.getApplicationByClientID(req.body.clientid)

        if (!application) {
            res.status(400).send("No application with given clientID")
            return
        }
    } catch (ex) {
        next({ex: ex})
        return
    }

    //Check permissions on user and application
    var scope = req.body.scope.split(" ")
    try {
        var applicationHasPermissions = await DAO.auth.checkApplicationPermissions(application.ID, scope)

        if (!applicationHasPermissions) {
            res.status(401).send("Application does not have access to requested scopes")
            return
        }
    } catch(ex) { 
        next({ex: ex}) 
        return
    }

    try {
        var donorHasPermissions = await DAO.auth.checkDonorPermissions(donor.id, scope)

        if (!donorHasPermissions) {
            res.status(401).send("Donor does not have access to requested scope")
            return
        }
    } catch(ex) { 
        next({ex: ex}) 
        return
    }

    //OK, all good, create an access key
    let accessKey = crypto.
})

router.get("/password/change/:token", async (req,res, next) => {
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