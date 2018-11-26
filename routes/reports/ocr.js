const OCRparser = require('../../custom_modules/parsers/OCR.js')
const DAO = require('../../custom_modules/DAO.js')

module.exports = async (req, res, next) => {
    var data = req.files.report.data.toString('UTF-8')

    var OCRRecords = OCRparser.parse(data)

    res.json({
        status: 501,
        content: "Not implemented"
    })
}