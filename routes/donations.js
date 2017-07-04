const express = require('express')
const router = express.Router()

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

const moment = require('moment')
const KID = require('../custom_modules/KID.js')
const Mail = require('../custom_modules/mail.js')

const DAO = require('../custom_modules/DAO.js')

const MailSender = new Mail()

router.post("/", urlEncodeParser, async (req,res) => {
  if (!req.body) return res.sendStatus(400)

  var parsedData = JSON.parse(req.body.data)

  var donationOrganizations = parsedData.organizations
  var userID = req.body.data.userID

  var donationObject = {
    owner: userID,
    amount: parsedData.amount,
    standardSplit: undefined,
    split: []
  }

  try {
    if (parsedData.organizations) { 
      donationObject.split = await createDonationSplitArray(parsedData.organizations)
      donationObject.standardSplit = false
    }
    else {
      donationObject.split = await getStandardSplit()
      donationObject.standardSplit = true
    }
  }
  catch (ex) {
    console.log(ex)
    return res.status(500).send({
      status: 500,
      content: "Internal server error"
    })
  }

  try {
    donationObject.KID = await generateKID()
  } catch (ex) {
    console.log(ex)
    return res.status(500).json({
      status: 500,
      content: "Could not generate KID"
    })
  }


  try {
    await DAO.donations.add(donationObject)
  } catch (ex) {
    console.log(ex)
    return res.status(500).json({
      status: 500,
      content: "Internal server error"
    })
  }

  sendDonationReciept(donationObject, "account@harnes.me")

  return res.json({ status: 200, content: {
    KID: donationObject.KID
  }})
})

async function createDonationSplitArray(passedOrganizations) {
  console.log(passedOrganizations)
  return new Promise(async function(fulfill, reject) {
    //Filter passed organizations for 0 shares
    var filteredOrganizations = passedOrganizations.filter(org => org.split > 0)

    try {
      var organizationIDs = filteredOrganizations.reduce((acc, org) => {
        acc.push(org.id);
        return acc;
      }, []);
      var orgs = await DAO.organizations.getByIDs(organizationIDs)
    }
    catch (ex) {
      return reject(ex)
    }
    
    if (orgs.length != filteredOrganizations.length) return reject(new Error("Could not find all organizations in DB"))

    var donationSplits = []

    for (var i = 0; i < orgs.length; i++) {
      for (var j = 0; j < filteredOrganizations.length; j++) {
        if (filteredOrganizations[j].id == orgs[i].OrgID) {
          donationSplits.push({
            organizationID: orgs[i].OrgID,
            share: filteredOrganizations[j].split,
            name: orgs[i].org_full_name
          })

          filteredOrganizations.splice(j,1)
          orgs.splice(i,1)
          i--

          break
        }
      }
    }

    fulfill(donationSplits)
  })
}

async function getStandardSplit() {
  return new Promise(async (fulfill, reject) => {
    var orgs = await DAO.organizations.getStandardSplit()

    var splitObj = {}
    splitObj = orgs.map((org) => {
      return {
        organizationID: org.OrgID,
        name: org.org_full_name,
        share: org.std_percentage_share
      }
    })
  })
}

async function generateKID() {
  var donationKID = KID.generate()

  //KID is generated randomly, check for existing entry in database (collision)
  var duplicates = await DAO.donations.getDonationByKID(donationKID) 
  if (duplicates.length > 0) {
    donationKID = generateKID(cb)
  } else {
    return donationKID
  }
}

function sendDonationReciept(donationObject, recieverEmail) {
  MailSender.send({
    subject: 'Some subject',
    reciever: recieverEmail,
    templateName: 'registered',
    templateData: {
      header: "Hei, ",
      donationSum: donationObject.amount,
      kid: donationObject.KID,
      organizations: donationObject.split.map(function(split) {
        return {
          name: split.name,
          //Add splitting zeroes regex at end of amount
          amount: (donationObject.amount * split.share * 0.01).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "),
          percentage: split.share
        }
      })
    }
  }, (err, body) => {
    if (err) return console.log(err)
    console.log(body)
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

router.get('/:id', async (req, res) => {
  try {
    var donation = await DAO.donations.getFullDonationById(req.params.id)
  } catch(ex) {
    console.log(ex)
    return res.status(500).json({
      status: 500,
      content: "Internal server error"
    })
  }
  
  res.json({
    status: 200,
    content: donation
  })
})

module.exports = router