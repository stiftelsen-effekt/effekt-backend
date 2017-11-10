const express = require('express')
const router = express.Router()

const DAO = require('../custom_modules/DAO.js')
const KID = require('../custom_modules/KID.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post("/", urlEncodeParser, async (req,res,next) => {
    if (!req.body.data) return res.sendStatus(400)

    var data = JSON.parse(req.body.data)
    var email = data.email
    var name = data.name

    if (name.length > 0) {
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
          KID: await KID.getNonColliding(),
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
        next({ex: ex})
      }
    }
})

router.get('/:id', async (req,res,next) => {
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

router.get("/remove/:id", async (req,res,next) => {
  try {
    await DAO.donors.remove(req.params.id)
    res.json({
      status: 200,
      content: "Removed donor with ID " + req.params.id
    })
  } catch(ex) {
    next({ex: ex})
  }
})

module.exports = router