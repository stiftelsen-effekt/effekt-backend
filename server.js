console.log("--------------------------------------------------")
console.log("| gieffektivt.no donation backend (╯°□°）╯︵ ┻━┻ |")
console.log("--------------------------------------------------")
console.log("Loading config")
const config = require('./config.js')

console.log("Loading dependencies")

const express = require('express')
const fileUpload = require('express-fileupload')
const pretty = require('express-prettify')
const path = require('path')
const rateLimit = require('express-rate-limit')
const honeypot = require('honeypot')
const morgan = require('morgan')
const logging = require('./handlers/loggingHandler.js')
const fs = require('fs')
const https = require('https')
const http = require('http')

const DAO = require('./custom_modules/DAO.js')

//Connect to the DB
//If unsucsessfull, quit app
DAO.connect()

const errorHandler = require('./handlers/errorHandler.js')

//Setup express
const app = express()

//Set global application variable root path
global.appRoot = path.resolve(__dirname)

//Setup request logging
logging(app)

app.get("/", (req, res, next) => {
  res.send("Hello Travis")
})

//Pretty printing of JSON
app.use(pretty({ 
  query: 'pretty' 
}))

//File upload 
app.use(fileUpload({ 
  limits: { fileSize: 10 * 1024 * 1024 } //Probably totally overkill, consider reducing
}))
app.enable('trust proxy')

//Honeypot
const pot = new honeypot(config.honeypot_api_key)
app.use((req,res,next) => {
  pot.query(req.ip, function(err, response){
    if (!response) {
      next()
    } else {
      res.status(403).json({
        status: 403,
        content: "IP blacklisted"
      })
    }
  })
})

//Rate limiting
app.use(new rateLimit({
  windowMs: 15*60*1000, // 15 minutes
  //limit each IP to 10 000 requests per windowMs (10 000 requests in 15 minutes)
  //Why so many? Becuse of shared IP's such as NTNU campus.
  max: 1000, 
  delayMs: 0 // disable delaying - full speed until the max limit is reached 
}))

//Set cross origin as allowed
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    next()
})

//Error handling
app.use(errorHandler)

//Load testing verification endpoint
//Loader.io (website for service)
app.get("/loaderio-66c56b6216728d162150350fd76fc76a/", (req, res, next) => {
  res.status(200).send("loaderio-66c56b6216728d162150350fd76fc76a");
})

//Server
var mainServer = http.createServer(app).listen(config.port)
console.log("Server listening on port " + config.port)
const websocketsHandler = require('./handlers/websocketsHandler.js')(mainServer)

//Routes
const donorsRoute = require('./routes/donors.js')
const donationsRoute = require('./routes/donations.js')
const organizationsRoute = require('./routes/organizations.js')
const ocrParserRoute = require('./routes/ocrParser.js')
const paypalRoute = require('./routes/paypal.js')(websocketsHandler)
const csrRoute = require('./routes/csr.js')

app.use('/donors', donorsRoute)
app.use('/donations', donationsRoute)
app.use('/organizations', organizationsRoute)
app.use('/ocr', ocrParserRoute)
app.use('/paypal', paypalRoute)
app.use('/csr', csrRoute)

app.use('/static', express.static('static'))