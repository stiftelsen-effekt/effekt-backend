const express = require('express')
const router = express.Router()
const mail = require('../custom_modules/mail')
const authMiddleware = require('../custom_modules/authorization/authMiddleware')
const authRoles = require('../enums/authorizationRoles')
const DAO = require('../custom_modules/DAO.js')
const config = require('../config')
const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: true })
const dateRangeHelper = require('../custom_modules/dateRangeHelper')
const donationHelpers = require('../custom_modules/donationHelpers')

router.post("/register", urlEncodeParser, async (req,res,next) => {
  if (!req.body) return res.sendStatus(400)

  let parsedData = JSON.parse(req.body.data)

  let donationOrganizations = parsedData.organizations
  let donor = parsedData.donor

  try {
    var donationObject = {
      KID: null, //Set later in code
      donorID: null, //Set later in code
      amount: parsedData.amount,
      standardSplit: undefined,
      split: []
    }

    //Create a donation split object
    if (donationOrganizations) {
      donationObject.split = await donationHelpers.createDonationSplitArray(donationOrganizations)
      donationObject.standardSplit = false
    }
    else {
      donationObject.split = await donationHelpers.getStandardSplit()
      donationObject.standardSplit = true
    }

    //Check if existing donor
    donationObject.donorID = await DAO.donors.getIDbyEmail(donor.email)

    

    if (donationObject.donorID == null) {
      //Donor does not exist, create donor
      donationObject.donorID = await DAO.donors.add(donor.email, donor.name, donor.ssn)
    }
    else {
      //Check for existing SSN if provided
      if (typeof donor.ssn !== "undefined" && donor.ssn != null) {
        dbDonor = await DAO.donors.getByID(donationObject.donorID)

        if (dbDonor.ssn == null) {
          //No existing ssn found, updating donor
          await DAO.donors.updateSsn(donationObject.donorID, donor.ssn)
        }
      }
    }

    //Try to get existing KID
    donationObject.KID = await DAO.distributions.getKIDbySplit(donationObject.split, donationObject.donorID)

    //Split does not exist create new KID and split
    if (donationObject.KID == null) {
      donationObject.KID = await donationHelpers.createKID()
      await DAO.distributions.add(donationObject.split, donationObject.KID, donationObject.donorID)
    }
  }
  catch (ex) {
    return next(ex)
  }

  res.json({
    status: 200,
    content: {
      KID: donationObject.KID,
      donorID: donationObject.donorID
    }
  })
})

router.post("/bank/pending", urlEncodeParser, async (req,res,next) => {
  let parsedData = JSON.parse(req.body.data)

  let success = await mail.sendDonationRegistered(parsedData.KID, parsedData.sum)

  if (success) res.json({ status: 200, content: "OK" })
  else res.status(500).json({ status: 500, content: "Could not send bank donation pending email" })
})

router.post("/confirm", 
  authMiddleware(authRoles.write_all_donations),
  urlEncodeParser,
  async (req, res, next) => {
  try {
    let sum = Number(req.body.sum)
    let timestamp = new Date(req.body.timestamp);
    let KID = Number(req.body.KID)
    let methodId = Number(req.body.paymentId)
    let externalRef = req.body.paymentExternalRef
    let metaOwnerID = req.body.metaOwnerID

    let donationID = await DAO.donations.add(KID, methodId, sum, timestamp, externalRef, metaOwnerID)

    if (config.env === "production" && req.body.reciept === true) 
      await mail.sendDonationReciept(donationID)

    res.json({
      status: 200,
      content: "OK"
    })
  } catch(ex) {
    next(ex)
  }
})

router.get("/total", async (req, res, next) => {
  try {
    let dates = dateRangeHelper.createDateObjectsFromExpressRequest(req)

    let aggregate = await DAO.donations.getAggregateByTime(dates.fromDate, dates.toDate)

    res.json({
      status: 200,
      content: aggregate
    })
  } catch(ex) {
    next(ex)
  }
})

router.post("/", authMiddleware(authRoles.read_all_donations), async(req, res, next) => {
  try {
    var results = await DAO.donations.getAll(req.body.sort, req.body.page, req.body.limit, req.body.filter)
    return res.json({ 
      status: 200, 
      content: {
        rows: results.rows,
        pages: results.pages
      } 
    })
  } catch(ex) {
    next(ex)
  }
})

router.get("/histogram", async (req,res,next) => {
  try {
    let buckets = await DAO.donations.getHistogramBySum()

    res.json({
      status: 200,
      content: buckets
    })
  } catch(ex) {
    next(ex)
  }
})

router.get("/:id", authMiddleware(authRoles.read_all_donations), async (req,res,next) => {
  try {
    var donation = await DAO.donations.getByID(req.params.id)

    return res.json({
      status: 200,
      content: donation
    })
  } catch (ex) {
    next(ex)
  }
})

router.post("/receipt", authMiddleware(authRoles.write_all_donations), async (req, res, next) => {
  let donationID = req.body.donationID

  if (req.body.email && req.body.email.indexOf("@") > -1) {
    var mailStatus = await mail.sendDonationReciept(donationID, req.body.email)
  } else {
    var mailStatus = await mail.sendDonationReciept(donationID)
  }

  if (mailStatus === true) { 
    res.json({
      status: 200,
      content: `Reciept sent for donation id ${donationID} to donor ID {}`
    }) 
  }
  else {
    res.json({
      status: 500,
      content: `Reciept failed with error code ${mailStatus}`
    })
  }
})

module.exports = router
