const express = require('express')
const router = express.Router()

//const User = require('../models/user.js')

const DAO = require('../custom_modules/DAO.js')
const KID = require('../custom_modules/KID.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post("/", urlEncodeParser, async (req,res) => {
    if (!req.body.data) return res.sendStatus(400)

    var data = JSON.parse(req.body.data)
    var email = data.email
    var name = data.name

    if (name.length > 0) {
      console.log(name.indexOf(' '))
      if (name.indexOf(' ') == -1) {
        var firstName = name
      }
      else {
        var firstName = name.substring(0, name.indexOf(' '))
        var lastName = name.substring(name.indexOf(' ')+1)
      }
    }
    
    if (typeof email === "undefined") {
      return res.status(400).json({
        status: 400,
        content: "Missing email in request"
      })
    }

    var existingUserKID = await DAO.donors.getKIDByEmail(email)
    if (existingUserKID != null) {
      return res.json({
        status: 200,
        content: {
          KID: existingUserKID
        }
      })
    } else {
      try {
        var newUserKID = await DAO.donors.add({
          KID: await generateKID(),
          email: email,
          firstName: (firstName ? firstName : ""),
          lastName: (lastName ? lastName : "")
        })

        return res.json({
          status: 200,
          content: {
            KID: newUserKID
          }
        })
      } 
      catch (ex) {
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
