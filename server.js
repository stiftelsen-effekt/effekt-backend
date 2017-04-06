console.log("Loading config")

const config = require('./config.js')

console.log("Loading dependencies")

const express = require('express')
const bodyParser = require('body-parser')
const pretty = require('express-prettify');
const mongoose = require('mongoose')
const validator = require('validator')

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
  registered: {
    type: Date,
    default: Date.now()
  },
  verified: {
    type: Boolean
  },
  split: [DonationSplit]
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

  const donationOrganizations = JSON.parse(req.body.organizations)
  const totalSplit = donationOrganizations.reduce((acc, org, i) => { 
    if (i == 1) return acc.split + org.split 
    return acc + org.split
  })

  console.log("Amount: " + req.body.amount)
  console.log("Total split: " + totalSplit)
  if (totalSplit == 100) {
    Organization.find(
      { name: 
        { $in: donationOrganizations.map((org) => { return org.name }) 
      }
    }, (err, orgs) => {
      if (err) return console.log(err)

      var donationSplits = []

      var donationObject = {
        amount: req.body.amount,
        split: []
      }

      for (var i = 0; i < orgs.length; i++) {
        for (var j = 0; j < donationOrganizations.length; j++) {
          console.log("Iteration")
          console.log("Is " + donationOrganizations[j].name + " == " + orgs[i].name)

          if (donationOrganizations[j].name == orgs[i].name) {
            console.log("Push");

            donationObject.split.push({
              organizationID: orgs[i]._id,
              share: donationOrganizations[j].split
            })
          }
        }
      }

      Donation.create(donationObject, (err, obj) => {
        if (err) console.log(err)
      });

      return res.json({ status: 200, content: 'OKOK' })
    })
  } else {
    return res.json({ status: 400, content: 'Donation split does not add up to 100' })
  }
})

app.get("/donations", urlEncodeParser, (req, res) => {
  Donation.find({}, (err, obj) => {
    if (err) return res.json({ status: 400, content: 'Malformed request' })

    return res.json(obj)
  })
})

//Organization
app.get("/organizations", urlEncodeParser, (req, res) => {
  var orgName = req.query.name

  Organization.findOne({ name: orgName }, (err, org) => {    
    if (org) {
      console.log(org)

      res.json({
        satus: 200,
        content: {
          name: org.name,
          standardShare: org.standardShare,
          shortDesc: org.shortDesc
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
  var userKID = new KID().generate()
  console.log(userKID)

  var duplicates = User.count({ KID: userKID }, (err, count) => {
    if (count > 0) {
      userKID = generateKID(cb)
    } else {
      cb(userKID)
    }
  })
}