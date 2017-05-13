console.log("Loading config")

const config = require('./config.js')

if (typeof config.db_connection_string === "undefined" ||
    typeof config.mailgun_api_key === "undefined" || 
    typeof config.port === "undefined") {
  
  console.error(('\x1b[' + '31' + 'm') + "Error: " + ('\x1b[' + '37' + 'm') + "Change config.js in root before running") 
  process.exit()
}

console.log("Loading dependencies")

const express = require('express')
const fileUpload = require('express-fileupload')
const pretty = require('express-prettify')
const mongoose = require('mongoose')
const path = require('path')

//Routes
const usersRoute = require('./routes/users.js')
const donationsRout = require('./routes/donations.js')
const organizationsRoute = require('./routes/organizations.js')
const ocrParserRoute = require('./routes/ocrParser.js')

//Set global application variable root path
global.appRoot = path.resolve(__dirname)

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
app.listen(config.port, () => {
  console.log('listening on 3000')
})