const express = require('express')
const router = express.Router()

//const Organization = require('../models/organization.js')
const DAO = require('../custom_modules/DAO.js')

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

router.get("/active", urlEncodeParser, async (req,res) => {
  try {
    var activeOrganizations = await DAO.organizations.getActive()

    res.json({
      status: 200,
      content: activeOrganizations
    })
  }
  catch(ex) {
    console.log(ex)
    res.status(500).json({
      status: 500,
      content: "Internal server error"
    })
  }
})

/* 
  TODO: POST to '/' - Create Organization
*/

module.exports = router