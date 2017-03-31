console.log("Loading config")

const config = require('./config.js')

console.log("Loading dependencies")

const express = require('express')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const validator = require('validator')

//Custom modules
const KID = require('./custom_modules/KID.js')

const app = express()
const Schema = mongoose.Schema
const urlEncodeParser =bodyParser.urlencoded({ extended: false })

console.log("Connecting to DB")
mongoose.connect(config.db_connection_string)

//Models
const User = mongoose.model('User', new Schema({ 
  mail: {
    type: String,
    uniqe: true,
    required: true,
    validate: validator.isEmail
  },
  KID: {
    type: String,
    required: true,
    maxlength: 12
  }
}))

//Server
app.listen(3000, () => {
  console.log('listening on 3000')
})

app.post("/user", urlEncodeParser, (req,res) => {
    if (!req.body) return res.sendStatus(400)

    generateKID((userKID) => {
      User.create({
        mail: req.body.email,
        KID: userKID
      }, (err, something) => {
        if (err) console.log(err)
      })

      res.send(JSON.stringify({
        status: 200,
        msg: "Success"
      }))
    })
})

//Helper functions
function generateKID(cb) {
  var userKID = new KID().generate()
  console.log(userKID)

  var duplicates = User.count({ KID: userKID }, (err, count) => {
    if (count > 0) {
      userKID = generateKID(cb)
    } else {
      cb(userKID)
    }
  })
}