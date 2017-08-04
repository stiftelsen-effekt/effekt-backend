const express = require('express')
const router = express.Router()
const OCR = require('../custom_modules/OCR.js')
const DAO = require('../custom_modules/DAO.js')

const fileUpload = require('express-fileupload')

router.post('/', async (req, res) => {
    var data = req.files.ocr.data.toString('UTF-8')

    var OCRRecords = OCR.parse(data)

    try {
        var donations = await DAO.donations.getNonRegisteredByDonors(OCRRecords.map((record) => record.KID))
    }
    catch(ex) {
        console.log(ex)

        return res.status(500).json({
            status: 500,
            content: "Internal server error"
        })
    }
    

    var markAsAccepted = []
    var recordsWithoutDonation = []

    //Optimize? Nasty double loop, could get ugly fast
    for (var i = 0; i < OCRRecords.length; i++) {
        var record = OCRRecords[i]
        for (var j = 0; j < donations.length; j++) {
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
        console.log(ex)

        return res.status(500).json({
            status: 500,
            content: "Internal server error"
        })
    }

    res.json({
        status: 200,
        content: "OK"
    })
})

module.exports = router