console.log("Loading config")

const config = require('./config.js')

console.log("Loading dependencies")

const express = require('express')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const validator = require('validator')

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
    type: Number,
    required: true
  }
}))

//Server
app.listen(3000, () => {
  console.log('listening on 3000')
})

app.post("/user", urlEncodeParser, (req,res) => {
    if (!req.body) return res.sendStatus(400)
    res.send('welcome, ' + req.body.email)

    User.create({
      mail: req.body.email,
      KID: 123456789012
    }, (err, something) => {
      if (err) console.log(err)
    })
})