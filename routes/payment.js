const express = require('express')
const router = express.Router()

const DAO = require('../custom_modules/DAO.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.get("/methods", async (req,res, next) => {
  try {
    //TODO: Not implemented

    res.status(501).json({
      status: 501,
      content: "Not implemented"
    })
  }
  catch(ex) {
    next({ex: ex})
  }
})

module.exports = router