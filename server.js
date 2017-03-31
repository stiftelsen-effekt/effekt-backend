console.log("Loading config")

const config = require('./config.js')

console.log("Loading dependencies")

const express = require('express')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const validator = require('validator')

const app = express();

console.log("Connecting to DB")
mongoose.connect(config.db_connection_string)

//Models
var User = mongoose.model('User', { 
  mail: {
    type: String,
    uniqe: true,
    required: true,
    validate: validator.isEmail
  },
  KID: {
    type: Number,
    required: true,
    min: 12,
    max: 12
  }
})

//Server
app.listen(3000, () => {
  console.log('listening on 3000')
})

app.get("/", (req,res) => {
    res.send("Hello world")
})