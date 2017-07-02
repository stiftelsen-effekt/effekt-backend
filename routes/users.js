const express = require('express')
const router = express.Router()

//const User = require('../models/user.js')

const DAO = require('../custom_modules/DAO.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post("/", urlEncodeParser, (req,res) => {
    if (!req.body.data) return res.sendStatus(400)

    var data = JSON.parse(req.body.data)

    console.log(data)

    User.count({ mail: data.email }, (err, count) => {
      if (count > 0) return res.json({ status: 200, content: "User already exists" })

      console.log(count)

      User.create({
        mail: data.email
      }, (err, something) => {
        if (err) return res.json( { status: 400, content: "Malformed request" } )

        return res.json({
          status: 200,
          content: "User created"
        })
      })
    })
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

module.exports = router