const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')

const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post('/ocr',
            authMiddleware.auth(authRoles.write_donations),
            require('./reports/ocr'))
router.post('/bank',
            authMiddleware.auth(authRoles.write_donations),
            require('./reports/bank'))
router.post("/vipps",
            authMiddleware.auth(authRoles.write_donations),
            require('./reports/vipps'))
router.post("/paypal",
            authMiddleware.auth(authRoles.write_donations),
            require('./reports/paypal'))
router.post('/range',
            urlEncodeParser,
            authMiddleware.auth(authRoles.read_donations),
            require('./reports/range'))
router.post('/taxdeductions',
            urlEncodeParser,
            authMiddleware.auth(authRoles.write_donations),
            require('./reports/tax'))

module.exports = router