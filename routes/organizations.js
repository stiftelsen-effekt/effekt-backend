const express = require('express')
const router = express.Router()

const DAO = require('../custom_modules/DAO.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.get("/active", urlEncodeParser, async (req,res) => {
  try {
    var activeOrganizations = await DAO.organizations.getActive()

    res.json({
      status: 200,
      content: activeOrganizations
    })
  }
  catch(ex) {
    next({ex: ex})
  }
})

/* 
  TODO: POST to '/' - Create Organization
*/

module.exports = router