const express = require('express')
const router = express.Router()
const authRoles = require('../enums/authorizationRoles')

const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post('/ocr',
            authMiddleware.isAdmin,
            require('./reports/ocr'))
router.post('/bank',
            authMiddleware.isAdmin,
            require('./reports/bank'))
router.post("/vipps",
            authMiddleware.isAdmin,
            require('./reports/vipps'))
router.post("/facebook",
            authMiddleware.isAdmin,
            require('./reports/facebook'))
router.post("/paypal",
            authMiddleware.isAdmin,
            require('./reports/paypal'))
router.post('/range',
            urlEncodeParser,
            authMiddleware.isAdmin,
            require('./reports/range'))
router.post('/taxdeductions',
            urlEncodeParser,
            authMiddleware.isAdmin,
            require('./reports/tax'))

module.exports = router