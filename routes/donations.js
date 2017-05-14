const express = require('express')
const router = express.Router()

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

const moment = require('moment')
const KID = require('../custom_modules/KID.js')
const Mail = require('../custom_modules/mail.js')

const Donation = require('../models/donation.js')
const DonationSplit = require('../models/donationSplit.js')

const Organization = require('../models/organization.js')

const MailSender = new Mail()

router.post("/", urlEncodeParser, (req,res) => {
  if (!req.body) return res.sendStatus(400)

  console.log(req.body)

  var parsedData = JSON.parse(req.body.data)

  var donationOrganizations = parsedData.organizations
  var userID = req.body.data.userID

  console.log(donationOrganizations.map((org) => org.id) )

  Organization.find(
    { _id: 
      { $in: donationOrganizations.map((org) => org.id) 
    }
  }, (err, orgs) => {
    if (err) return (console.log(err), res.sendStatus(500))

    if (orgs.length != donationOrganizations.length) return res.json({ status: 400, content: "Could not find all organizations passed" })

    var donationSplits = []

    var donationObject = {
      owner: userID,
      amount: parsedData.amount,
      verified: true,
      split: []
    }

    for (var i = 0; i < orgs.length; i++) {
      for (var j = 0; j < donationOrganizations.length; j++) {
        if (donationOrganizations[j].id == orgs[i].id) {
          donationObject.split.push({
            organizationID: orgs[i].id,
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
          return res.json({ status: 200, content: {
            KID: kid
          } })

          MailSender.send({
            subject: 'Some subject',
            reciever: 'bob@bob.com',
            templateName: 'thanks',
            templateData: {
              header: "This is the header!",
              showOrganizations: true,
              organizations: [{
                name: "AMF",
                amount: 300
              }, {
                name: "AMF",
                amount: 300
              }, {
                name: "AMF",
                amount: 300
              }]
            }
          }, (err, body) => {
            if (err) return console.log(err)
            console.log(body)
          })
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
  //Check if no parameters
  if (!req.query) return res.json({ status: 400, content: "Malformed request" })

  //Check if dates are valid ISO 8601
  if (!moment(req.query.fromDate, moment.ISO_8601, true).isValid() || !moment(req.query.toDate, moment.ISO_8601, true).isValid()) return res.json({ status: 400, content: "date must be in ISO 8601 format" })

  let fromDate = new Date(req.query.fromDate)
  let toDate = new Date(req.query.toDate)

  Donation.getTotalAggregatedDonations(fromDate, toDate, (err, result) => {
    if (err) res.json({ status: 400, content: err })
    else res.json({ status: 200, content: result })
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