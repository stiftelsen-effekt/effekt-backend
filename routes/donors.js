const express = require('express')
const router = express.Router()
const auth = require('../custom_modules/authorization/authMiddleware')
const roles = require('../enums/authorizationRoles')

const DAO = require('../custom_modules/DAO.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post("/", urlEncodeParser, async (req,res,next) => {
  try {
    res.status(501).json({
      status: 501,
      content: "Not implemented"
    })
  } catch(ex) {
    next({ex:ex})
  }
})

router.get('/id/:id', auth(roles.read_all_donations) ,async (req,res,next) => {
  try {
    var donor = await DAO.donors.getByID(req.params.id)

    if (donor) {
      return res.json({
        status: 200,
        content: donor
      })
    }
    else {
      return res.status(404).json({
        status: 404,
        content: "No donor found with ID " + req.params.id
      })
    }
  }
  catch (ex) {
    next({ex:ex})
  }
})

router.get('/search/', auth(auth.read_all_donations), async (req,res, next) => {
  try {
    var donors = await DAO.donors.search(req.query.q)

    if (donors) {
      return res.json({
        status: 200,
        content: donors
      })
    } else {
      return res.status(404).json({
        status: 404,
        content: "No donors found matching query"
      })
    }
  } catch(ex) {
    next({ex:ex})
  }
})

module.exports = router