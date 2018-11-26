const express = require('express')
const router = express.Router()

const authMiddleware = require("../custom_modules/authorization/authMiddleware.js")

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post('/ocr', require('./reports/ocr'))
router.post("/vipps", require('./reports/vipps'))
router.post("/paypal", require('./reports/paypal'))
router.get('/range', 
            urlEncodeParser, 
            /*authMiddleware('read_all_donations', true),*/
            require('./reports/range'))

module.exports = router