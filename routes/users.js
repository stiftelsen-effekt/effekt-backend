const express = require('express')
const router = express.Router()

//const User = require('../models/user.js')

const DAO = require('../custom_modules/DAO.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post("/", urlEncodeParser, async (req,res) => {
    if (!req.body.data) return res.sendStatus(400)

    var data = JSON.parse(req.body.data)
    var email = data.email

    if (typeof email === "undefined") {
      return res.status(400).json({
        status: 400,
        content: "Missing email in request"
      })
    }

    var numberOfUsersWithEmail = await DAO.donors.getCountByEmail(email)
    if (numberOfUsersWithEmail > 0) {
      return res.json({
        status: 200,
        content: "User already exists"
      })
    } else {
      try {
        await DAO.donors.add({email: email})

        return res.json({
          status: 200,
          content: "User created"
        })
      } catch (ex) {
        console.log(ex)
        return res.status(500).json({
          status: 500,
          content: "Internal server error"
        })
      }
    }
})

router.get('/', async (req, res) => {
  var organizations = await DAO.organizations.getById(["someID"])
  
  return res.json({
    status: 200,
    content: organizations
  })
})

router.get('/test', (req,res) => {
  return res.json({
    status: 200,
    content: "Hello world"
  })
})

/* Helper functions */

async function generateKID() {
  var newKID = KID.generate()

  //KID is generated randomly, check for existing entry in database (collision)
  var duplicate = await DAO.donors.getByKID(newKID)
  if (duplicate != null) {
    newKID = generateKID()
  } else {
    return newKID
  }
}


module.exports = {
  generateKID,
  router
}
