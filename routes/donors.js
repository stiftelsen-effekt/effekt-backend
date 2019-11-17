const express = require('express')
const router = express.Router()
const auth = require('../custom_modules/authorization/authMiddleware')
const roles = require('../enums/authorizationRoles')

const DAO = require('../custom_modules/DAO.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post("/", urlEncodeParser, async (req,res,next) => {
  try {
    if (!req.body.name) {
      let error = new Error("Missing param email or param name")
      error.status = 400
      throw error
    }

    await DAO.donors.add(req.body.email, req.body.name)

    return res.json({
      status: 200,
      content: "OK"
    })
  } catch(ex) {
    next(ex)
  }
})

router.get('/search/', auth(roles.read_all_donations), async (req,res, next) => {
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
    next(ex)
  }
})

router.get('/:id', auth(roles.read_all_donations) ,async (req,res,next) => {
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
    next(ex)
  }
})



module.exports = router