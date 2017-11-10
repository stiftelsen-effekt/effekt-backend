const express = require('express')
const router = express.Router()

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

const moment = require('moment')

const config = require('../config.js')

const KID = require('../custom_modules/KID.js')
const Mail = require('../custom_modules/mail.js')

const DAO = require('../custom_modules/DAO.js')

router.post("/", urlEncodeParser, async (req,res,next) => {
  if (!req.body) return res.sendStatus(400)

  let parsedData = JSON.parse(req.body.data)

  let donationOrganizations = parsedData.organizations
  let donor = parsedData.donor

  try {
    var donationObject = {
      KID: KID,
      amount: parsedData.amount,
      standardSplit: undefined,
      split: []
    }
  
    //Create a donation split object
    if (parsedData.organizations) {
      donationObject.split = await createDonationSplitArray(parsedData.organizations)
      donationObject.standardSplit = false
    }
    else {
      donationObject.split = await getStandardSplit()
      donationObject.standardSplit = true
    }

    //Check if existing donor
    let donorID = await DAO.donors.getIDbyEmail(donor.email)
  
    if (donorID == null) {
      //Donor does not exist, create donor
      let donorID = await DAO.donors.add(donor)
    }
    
    //Try to get existing KID
    let donationKID = await DAO.donations.getKIDbySplit(donationObject.split)
  
    /*  We are now about to change data in the DB
        This happens in two discrete steps (addSplit and add)
        Therefore, we must start a transaction
        If we succesfully add the split, but not the donation
        we error and rollback the previously added split        */

    DAO.startTransaction()

    //Split does not exist create new KID and split
    if (!donationKID) {
      donationKID = await createKID()
      await DAO.donations.addSplit(donationObject.split, KID)
    }

    //Add donation to database
    try {
      await DAO.donations.add(donationObject)
      await DAO.commitTransaction()
    } catch(ex) {
      await DAO.rollbackTransaction()
      return next({ex: ex})
    }
  }
  catch (ex) {
    return next({ex: ex})
  }
  
  //In case the email component should fail, register the donation anyways, and notify client
  res.json({ status: 200, content: {
    KID: donationObject.KID
  }})

  sendDonationReciept(donationObject, donor.email, donor.name)
})

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
    try {
      var split = await DAO.organizations.getStandardSplit()
    }
    catch(ex) {
      return reject(ex)
    }

    fulfill(split)
  })
}

async function sendDonationReciept(donationObject, recieverEmail, recieverName) {
  try {
    var KIDstring = donationObject.KID.toString()
    //Add seperators for KID, makes it easier to read
    KIDstring = KIDstring.substr(0,3) + " " + KIDstring.substr(2,2) + " " + KIDstring.substr(5,3)

    var result = await Mail.send({
      subject: 'GiEffektivt.no - Donasjon klar for innbetaling',
      reciever: recieverEmail,
      templateName: 'registered',
      templateData: {
        header: "Hei, " + (recieverName.length > 0 ? recieverName : ""),
        //Add thousand seperator regex at end of amount
        donationSum: donationObject.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "&#8201;"),
        kid: KIDstring,
        accountNumber: config.bankAccount,
        organizations: donationObject.split.map(function(split) {
          return {
            name: split.name,
            //Add thousand seperator regex at end of amount
            amount: (donationObject.amount * split.share * 0.01).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "&#8201;"),
            percentage: split.share
          }
        })
      }
    })
  }
  catch(ex) {
    console.log(ex)
  }
}

router.get('/total', urlEncodeParser, async (req,res,next) => {
  //Check if no parameters
  if (!req.query) return res.json({ status: 400, content: "Malformed request" })

  //Check if dates are valid ISO 8601
  if (!moment(req.query.fromDate, moment.ISO_8601, true).isValid() || !moment(req.query.toDate, moment.ISO_8601, true).isValid()) return res.json({ status: 400, content: "Date must be in ISO 8601 format" })

  let fromDate = new Date(req.query.fromDate)
  let toDate = new Date(req.query.toDate)

  try {
    let res = await Donation.getTotalAggregatedDonations(fromDate, toDate)
  } catch(ex) {
    next({ex: ex})
  }
})

router.get('/:id', async (req,res,next) => {
  try {
    var donation = await DAO.donations.getByID(req.params.id)
  } catch(ex) {
    next({ex: ex})
  }
  
  res.json({
    status: 200,
    content: donation
  })
})

//Helper functions
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