const express = require('express')

const KID = require('../custom_modules/KID.js')
const DAO = require('../custom_modules/DAO.js')

const authMiddleware = require('../custom_modules/authorization/authMiddleware')
const authRoles = require('../enums/authorizationRoles')

const router = express.Router()

const rounding = require("../custom_modules/rounding")

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: true })
const dateRangeHelper = require('../custom_modules/dateRangeHelper')

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
      donationObject.split = await createDonationSplitArray(donationOrganizations)
      donationObject.standardSplit = false
    }
    else {
      donationObject.split = await getStandardSplit()
      donationObject.standardSplit = true
    }

    //Check if existing donor
    donationObject.donorID = await DAO.donors.getIDbyEmail(donor.email)

    if (donationObject.donorID == null) {
      //Donor does not exist, create donor
      donationObject.donorID = await DAO.donors.add(donor)
    }

    //Try to get existing KID
    donationObject.KID = await DAO.donations.getKIDbySplit(donationObject.split, donationObject.donorID)

    //Split does not exist create new KID and split
    if (donationObject.KID == null) {
      donationObject.KID = await createKID()
      await DAO.donations.addSplit(donationObject.split, donationObject.KID, donationObject.donorID)
    }
  }
  catch (ex) {
    return next(ex)
  }

  res.json({
    status: 200,
    content: {
      KID: donationObject.KID
    }
  })
})

router.post("/distribution", 
  authMiddleware(authRoles.write_all_donations),
  async (req, res, next) => {
  try {
    let split = req.body.distribution.map(distribution => {return { organizationID: distribution.organizationId, share: distribution.share }}),
      donorId = req.body.donor.id

    if (split.length === 0) {
      let err = new Error("Empty distribution array provided")
      err.status = 400
      return next(err)
    }

    if (rounding.sumWithPrecision(split.map(split => split.share)) !== "100") {
      let err = new Error("Distribution does not sum to 100")
      err.status = 400
      return next(err)
    }
    
    //Check for existing distribution with that KID
    let KID = await DAO.donations.getKIDbySplit(split, donorId)

    if (!KID) {
      KID = await createKID()
      await DAO.donations.addSplit(split, KID, donorId)
    }
    
    res.json({
      status: 200,
      content: KID
    })
  } catch(ex) {
    next({ex})
  }
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

    await DAO.donations.add(KID, methodId, sum, timestamp, externalRef)

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

//Helper functions
async function createDonationSplitArray(passedOrganizations) {
  return new Promise(async function(fulfill, reject) {
    //Filter passed organizations for 0 shares
    var filteredOrganizations = passedOrganizations.filter(org => org.split > 0)

    try {
      var organizationIDs = filteredOrganizations.reduce((acc, org) => {
        acc.push(org.id);
        return acc;
      }, [])
      var orgs = await DAO.organizations.getByIDs(organizationIDs)
    }
    catch (ex) {
      return reject(ex)
    }

    if (orgs.length != filteredOrganizations.length) return reject(new Error("Could not find all organizations in DB"))

    var donationSplits = []

    for (var i = 0; i < orgs.length; i++) {
      for (var j = 0; j < filteredOrganizations.length; j++) {
        if (filteredOrganizations[j].id == orgs[i].ID) {
          donationSplits.push({
            organizationID: orgs[i].ID,
            share: filteredOrganizations[j].split,
            name: orgs[i].full_name
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
    try {
      var split = await DAO.organizations.getStandardSplit()
    }
    catch(ex) {
      return reject(ex)
    }

    fulfill(split)
  })
}

function createKID() {
  return new Promise(async (fulfill, reject) => {
    //Create new valid KID
    let newKID = KID.generate()
    //If KID already exists, try new kid, call this function recursively
    try {
      if (await DAO.donations.KIDexists(newKID)) {
        newKID = await createKID()
      }
    } catch(ex) {
      reject(ex)
    }

    fulfill(newKID)
  })
}

module.exports = router
