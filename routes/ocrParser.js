const express = require('express')
const router = express.Router()
const OCR = require('../custom_modules/OCR.js')

const fileUpload = require('express-fileupload')

router.post('/', (req, res) => {
    console.log(req.files)

    var data = req.files.ocr.data.toString('UTF-8')

    var parsedData = OCR.parse(data)

    console.log(parsedData)

    res.json({
        status: 200,
        content: dataForDonationRegistration
    })
})

module.exports = router