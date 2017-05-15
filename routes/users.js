const express = require('express')
const router = express.Router()

const User = require('../models/user.js')

const bodyParser = require('body-parser')
const urlEncodeParser = bodyParser.urlencoded({ extended: false })

router.post("/", urlEncodeParser, (req,res) => {
    if (!req.body.data) return res.sendStatus(400)

    var data = JSON.parse(req.body.data)

    console.log(data)

    User.count({ mail: data.email }, (err, count) => {
      if (count > 0) return res.json({ status: 400, content: "Email is already taken" })

      console.log(count)

      User.create({
        mail: data.email
      }, (err, something) => {
        if (err) return res.json( { status: 400, content: "Malformed request" } )

        return res.json({
          status: 200,
          content: "Success"
        })
      })
    })
})

router.get('/test', (req,res) => {
  return res.json({
    status: 200,
    content: "Hello world"
  })
})

module.exports = router