const express = require('express')
const router = express.Router()

const Organization = require('../models/organization.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.get("/", urlEncodeParser, (req, res) => {
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

router.get("/active", urlEncodeParser, (req,res) => {
  Organization.find({ active: true }).
  select('name standardShare longDesc').
  sort({ standardShare: -1 }).
  exec((err, organizations) => {
    if (err) return res.json({ status: 400, content: "Internal error" })

    return res.json({ status: 200, content: organizations })
  });
})

router.post("/", urlEncodeParser, (req,res) => {
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

module.exports = router