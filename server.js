console.log("Loading config")

const config = require('./config.js')

console.log("Loading dependencies")

const express = require('express')
const bodyParser = require('body-parser')
const pretty = require('express-prettify');
const mongoose = require('mongoose')
const validator = require('validator')
const moment = require('moment')

//Custom modules
const KID = require('./custom_modules/KID.js')

const app = express()

app.use(pretty({ query: 'pretty' }))

const Schema = mongoose.Schema
const urlEncodeParser =bodyParser.urlencoded({ extended: false })

console.log("Connecting to DB")
mongoose.connect(config.db_connection_string)

//Models and schemas
const User = mongoose.model('User', new Schema({ 
  mail: {
    type: String,
    uniqe: true,
    required: true,
    validate: validator.isEmail
  },
  KID: {
    type: String,
    required: true,
    maxlength: 12
  }
}))

const DonationSplit = new Schema({
  organizationID: {
    type: String,
    required: true
  },
  share: {
    type: Number,
    required: true
  }
})

const Donation = mongoose.model('Donation', new Schema({
  amount: {
    type: Number,
    required: true
  },
  KID: {
    type: Number,
    minlength: 8,
    maxlength: 8
  },
  registered: {
    type: Date,
    default: Date.now()
  },
  verified: {
    type: Boolean
  },
  split: {
    type: [DonationSplit],
    validate: [(v) => { 
      return (v.reduce((acc, elem, i) => { 
        if (i == 1) return acc.share + elem.share
        return acc + elem.share
      }) == 100)
    }, 'Donation shares do not add up to 100']
  }
}))

const Organization = mongoose.model('Organization', new Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  standardShare: {
    type: Number
  },
  shortDesc: {
    type: String
  },
  longDesc: {
    type: String
  },
  active: {
    type: Boolean
  }
}))

//Server
app.listen(3000, () => {
  console.log('listening on 3000')
})

//User
app.post("/users", urlEncodeParser, (req,res) => {
    if (!req.body) return res.sendStatus(400)

    generateKID((userKID) => {
      User.create({
        mail: req.body.email,
        KID: userKID
      }, (err, something) => {
        if (err) console.log(err)
      })

      res.json({
        status: 200,
        content: "Success"
      })
    })
})

//Donation
app.post("/donations", urlEncodeParser, (req,res) => {
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

app.get("/donations", urlEncodeParser, (req, res) => {
  Donation.find({}, (err, obj) => {
    if (err) return res.json({ status: 400, content: "Malformed request" })

    return res.json(obj)
  })
})

app.get('/donations/total', urlEncodeParser, (req, res) => {
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

//Organization
app.get("/organizations", urlEncodeParser, (req, res) => {
  var orgName = req.query.name

  if (orgName) {
    Organization.findOne({ name: orgName }, (err, organization) => {    
      if (organization) {
        console.log(organization)

        res.json({
          satus: 200,
          content: {
            name: organization.name,
            standardShare: organization.standardShare,
            shortDesc: organization.shortDesc
          }
        })
      }
      else {
        res.json({
          status: 404,
          content: "No organization found with that name"
        })
      }
    })
  } else {
    Organization.find({}, (err, organizations) => {
      if (organizations) {
        res.json({
          status: 200,
          content: organizations
        }) 
      } else {
        res.json({
          status: 404,
          content: "Found no organizations"
        })
      }
    })
  }
})

app.post("/organizations", urlEncodeParser, (req,res) => {
    if (!req.body) return res.sendStatus(400)

    Organization.create({
      name: req.body.name,
      standardShare: req.body.standardShare,
      shortDesc: req.body.shortDesc,
      longDesc: req.body.longDesc,
      active: (req.body.active == 1)
    }, (err, something) => {
      if (err) console.log(err)

      res.json({
        status: 200,
        content: "OK"
      })
    })
})

//Helper functions
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