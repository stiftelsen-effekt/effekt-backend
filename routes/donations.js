const express = require('express')
const router = express.Router()

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

const moment = require('moment')
const KID = require('../custom_modules/KID.js')

const Donation = require('../models/donation.js')
const DonationSplit = require('../models/donationSplit.js')

router.post("/", urlEncodeParser, (req,res) => {
  if (!req.body) return res.sendStatus(400)

  var donationOrganizations = JSON.parse(req.body.organizations)

  Organization.find(
    { name: 
      { $in: donationOrganizations.map((org) => { return org.name }) 
    }
  }, (err, orgs) => {
    if (err) return (console.log(err), res.sendStatus(500))

    if (orgs.length != donationOrganizations.length) return res.json({ status: 400, content: "Could not find all organizations passed" })

    var donationSplits = []

    var donationObject = {
      amount: req.body.amount,
      verified: true,
      split: []
    }

    for (var i = 0; i < orgs.length; i++) {
      for (var j = 0; j < donationOrganizations.length; j++) {
        if (donationOrganizations[j].name == orgs[i].name) {
          donationObject.split.push({
            organizationID: orgs[i]._id,
            share: donationOrganizations[j].split
          })

          donationOrganizations.splice(j,1)
          orgs.splice(i,1)
          i--

          break
        }
      }
    }

    generateKID((kid) => {
      donationObject.KID = kid

      Donation.create(donationObject, (err) => {
        if (err) {
          var returnErrors = [];
          for (error in err.errors) {
            let errorElem = err.errors[error]
            if (errorElem.name == "ValidatorError") returnErrors.push(errorElem.message)
          }

          if (returnErrors.length > 0)  return res.json({ status: 400, content: returnErrors })
          else return res.sendStatus(500)
        }
        else {
          return res.json({ status: 200, content: 'ok' })
        }
      })
    })
  })
})

router.get("/", urlEncodeParser, (req, res) => {
  Donation.find({}, (err, obj) => {
    if (err) return res.json({ status: 400, content: "Malformed request" })

    return res.json(obj)
  })
})

router.get('/total', urlEncodeParser, (req, res) => {
  if (!req.query) return res.json({ status: 400, content: "Malformed request" })

  if (!moment(req.query.fromDate, moment.ISO_8601, true).isValid() || !moment(req.query.toDate, moment.ISO_8601, true).isValid()) return res.json({ status: 400, content: "date must be in ISO 8601 format" })

  let fromDate = new Date(req.query.fromDate)
  let toDate = new Date(req.query.toDate)

  Donation.aggregate([
    {
      $match: {
        verified: true,
        registered: { 
          $gte: fromDate,
          $lt: toDate
        }
      }
    },
    {
      $project: {
        split: 1,
        amount: 1
      }
    },
    {
      $unwind: "$split"
    },
    {
      $project: {
        result: {
          $multiply: ["$amount", "$split.share", 0.01]
        },
        organizationID: "$split.organizationID"
      }
    },
    {
      $group: {
        _id: "$organizationID",
        sum: {
          $sum: "$result"
        }
      }
    }
  ], (err, donations) => {
    if (err) return res.json({ status: 400, content: err })
    return res.json({ status: 200, content: donations })
  })
})

function generateKID(cb) {
  var donationKID = new KID().generate()

  var duplicates = Donation.count({ KID: donationKID }, (err, count) => {
    if (count > 0) {
      donationKID = generateKID(cb)
    } else {
      cb(donationKID)
    }
  })
}

module.exports = router