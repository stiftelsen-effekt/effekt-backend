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

  var parsedData = JSON.parse(req.body.data)

  var donationOrganizations = parsedData.organizations
  var userID = req.body.data.userID

  var donationObject = {
    owner: userID,
    amount: parsedData.amount,
    verified: true,
    split: []
  }

  if (parsedData.organizations) { 
    createDonationSplitArray(parsedData.organizations, (split) => {
      donationObject.split = split
      saveDonation(donationObject, parsedData.user, res)
    })
  }
  else {
    getStandardSplit((split) => {
      donationObject.split = split
      saveDonation(donationObject, parsedData.user, res)
    })
  }
})

function createDonationSplitArray(passedOrganizations, cb) {
  //Filter passed organizations for 0 shares
  var passedOrganizations = passedOrganizations.filter(org => org.split > 0)

  Organization.find(
    { _id: 
      { $in: passedOrganizations.map(org => org.id) }
    }, (err, orgs) => {
    if (err) return (console.log(err), res.sendStatus(500))

    if (orgs.length != passedOrganizations.length) return res.json({ status: 400, content: "Could not find all organizations passed" })

    var donationSplits = []

    for (var i = 0; i < orgs.length; i++) {
      for (var j = 0; j < passedOrganizations.length; j++) {
        if (passedOrganizations[j].id == orgs[i].id) {
          donationSplits.push({
            organizationID: orgs[i].id,
            share: passedOrganizations[j].split,
            name: orgs[i].name
          })

          passedOrganizations.splice(j,1)
          orgs.splice(i,1)
          i--

          break
        }
      }
    }

    cb(donationSplits)
  })
}

function saveDonation(donationObject, user, res) {
  generateKID((kid) => {
    donationObject.KID = kid

    Donation.create(donationObject, (err) => {
      if (err) {
        var returnErrors = []
        for (error in err.errors) {
          let errorElem = err.errors[error]
          if (errorElem.name == "ValidatorError") returnErrors.push(errorElem.message)
        }

        if (returnErrors.length > 0)  return res.json({ status: 400, content: returnErrors })
        else return res.sendStatus(500)
      }
      else {
        sendDonationReciept(donationObject, user)

        return res.json({ status: 200, content: {
          KID: kid
        } })
      }
    })
  })
}

function sendDonationReciept(donationObject, user) {
  MailSender.send({
    subject: 'Some subject',
    reciever: user,
    templateName: 'thanks',
    templateData: {
      header: "GiEffektivt.no - Overfør din donasjon",
      donationAmount: donationObject.amount,
      organizations: donationObject.split.map(function(split) {
        return {
          name: split.name,
          amount: donationObject.amount * split.share * 0.01
        }
      })
    }
  }, (err, body) => {
    if (err) return console.log(err)
    console.log(body)
  })
}

function getStandardSplit(cb) {
  var splitObj = {}

  Organization.find({
    active: true,
    standardShare: {
      $gt: 0
    }
  }, (err, orgs) => {
    splitObj = orgs.map((org) => {
      return {
        organizationID: org._id,
        name: org.name,
        share: org.standardShare
      }
    })

    cb(splitObj)
  })
}

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