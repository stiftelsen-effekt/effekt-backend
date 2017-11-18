const express = require('express')
const router = express.Router()
const OCR = require('../custom_modules/OCR.js')
const DAO = require('../custom_modules/DAO.js')

const fileUpload = require('express-fileupload')

router.post('/', async (req, res, next) => {
    var data = req.files.ocr.data.toString('UTF-8')

    var OCRRecords = OCR.parse(data)

    console.log(OCRRecords)

    res.json({
        status: 200,
        content: "OK"
    })
})

module.exports = router