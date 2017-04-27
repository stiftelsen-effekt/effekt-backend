console.log("Loading config")

const config = require('./config.js')

console.log("Loading dependencies")

const express = require('express')
const fileUpload = require('express-fileupload')
const pretty = require('express-prettify')
const mongoose = require('mongoose')

//Routes
const usersRoute = require('./routes/users.js')
const donationsRout = require('./routes/donations.js')
const organizationsRoute = require('./routes/organizations.js')
const ocrParserRoute = require('./routes/ocrParser.js')

const app = express()

app.use(pretty({ 
  query: 'pretty' 
}))
app.use(fileUpload({ 
  limits: { fileSize: 10 * 1024 * 1024 } //Probably totally overkill, consider reducing
}))

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    next()
})

app.use('/users', usersRoute)
app.use('/donations', donationsRout)
app.use('/organizations', organizationsRoute)
app.use('/ocr', ocrParserRoute)

const Schema = mongoose.Schema

console.log("Connecting to DB")
mongoose.connect(config.db_connection_string)

//Server
app.listen(3000, () => {
  console.log('listening on 3000')
})