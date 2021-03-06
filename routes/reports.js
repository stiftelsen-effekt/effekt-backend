const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')

const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post('/ocr',
            authMiddleware(authRoles.write_all_donations),
            require('./reports/ocr'))
router.post('/bank',
            authMiddleware(authRoles.write_all_donations),
            require('./reports/bank'))
router.post("/vipps",
            authMiddleware(authRoles.write_all_donations),
            require('./reports/vipps'))
router.post("/paypal",
            authMiddleware(authRoles.write_all_donations),
            require('./reports/paypal'))
router.post('/range',
            urlEncodeParser,
            authMiddleware(authRoles.read_all_donations),
            require('./reports/range'))
router.post('/taxdeductions',
            urlEncodeParser,
            authMiddleware(authRoles.write_all_donations),
            require('./reports/tax'))

module.exports = router