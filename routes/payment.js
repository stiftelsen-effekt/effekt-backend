const express = require('express')
const router = express.Router()

const DAO = require('../custom_modules/DAO.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.get("/methods", async (req,res, next) => {
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

module.exports = router