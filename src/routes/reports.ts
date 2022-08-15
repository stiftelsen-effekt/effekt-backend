import { isAdmin } from '../custom_modules/authorization/authMiddleware'

const express = require('express')
const router = express.Router()

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post('/ocr',
            isAdmin,
            require('./reports/ocr'))
router.post('/bank',
            isAdmin,
            require('./reports/bank'))
router.post("/vipps",
            isAdmin,
            require('./reports/vipps'))
router.post("/facebook",
            isAdmin,
            require('./reports/facebook'))
router.post("/paypal",
            isAdmin,
            require('./reports/paypal'))
router.post('/range',
            urlEncodeParser,
            isAdmin,
            require('./reports/range'))
router.post('/taxdeductions',
            urlEncodeParser,
            isAdmin,
            require('./reports/tax'))

module.exports = router