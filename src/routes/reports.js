const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')

const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post('/ocr',
            authMiddleware.auth(authRoles.admin),
            require('./reports/ocr'))
router.post('/bank',
            authMiddleware.auth(authRoles.admin),
            require('./reports/bank'))
router.post("/vipps",
            authMiddleware.auth(authRoles.admin),
            require('./reports/vipps'))
router.post("/paypal",
            authMiddleware.auth(authRoles.admin),
            require('./reports/paypal'))
router.post('/range',
            urlEncodeParser,
            authMiddleware.auth(authRoles.admin),
            require('./reports/range'))
router.post('/taxdeductions',
            urlEncodeParser,
            authMiddleware.auth(authRoles.admin),
            require('./reports/tax'))

module.exports = router