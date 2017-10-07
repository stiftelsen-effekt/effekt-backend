const express = require('express')
const router = express.Router()
const OCR = require('../custom_modules/OCR.js')
const DAO = require('../custom_modules/DAO.js')

const fileUpload = require('express-fileupload')

router.post('/', async (req, res, next) => {
    var data = req.files.ocr.data.toString('UTF-8')

    var OCRRecords = OCR.parse(data)

    try {
        var donations = await DAO.donations.getNonRegisteredByDonors(OCRRecords.map((record) => record.KID))
    }
    catch(ex) {
        next({ ex: ex })
    }
    
    var markAsAccepted = []
    var recordsWithoutDonation = []

    //Optimize? Nasty double loop, could get ugly fast. Could this be done in a query?
    for (let i = 0; i < OCRRecords.length; i++) {
        var record = OCRRecords[i]
        for (let j = 0; j < donations.length; j++) {
            var donation = donations[j]
            if (donation.sum_notified == record.amount && donation.Donor_KID == record.KID) {
                markAsAccepted.push(donation.ID); 
                break;
            }

            if (j == donations.length-1) recordsWithoutDonation.push(record)
        }
    }

    try {
        var donations = await DAO.donations.registerConfirmedByIDs(markAsAccepted)
    }
    catch(ex) {
        next(ex)
    }

    res.json({
        status: 200,
        content: "OK"
    })
})

module.exports = router